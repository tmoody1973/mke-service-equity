"""Acquire, validate, and summarize the approved MCTS static GTFS feed."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import subprocess
import zipfile
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Protocol, cast
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pipelines.common.artifacts import (
    ArtifactPaths,
    StoredSnapshot,
    atomic_write_bytes,
    canonical_json_bytes,
    preserve_snapshot,
)
from pipelines.common.http import Opener, Sleeper, fetch_bytes
from pipelines.food_equity.errors import SourceValidationError
from pipelines.food_equity.models import MethodologyRegistry
from pipelines.food_equity.registry import load_registry

MCTS_GTFS_SOURCE_URL = "https://kamino.mcts.org/gtfs/google_transit.zip"
MCTS_DEVELOPER_TERMS_URL = "https://www.ridemcts.com/policies/developer-terms"
MOBILITYDATA_VALIDATOR_VERSION = "8.0.1"
MOBILITYDATA_VALIDATOR_SHA256 = "19293ddd9b6f954f216d4f12054bd8a3232921751c4484339e339764a91000e2"
SOURCE_KEY = "mcts_gtfs"
SOURCE_ENCODING = "utf-8-sig"
MAX_ARCHIVE_MEMBERS = 64
MAX_ARCHIVE_BYTES = 25_000_000
MAX_UNCOMPRESSED_ARCHIVE_BYTES = 250_000_000
WINDOW_START_SECONDS = 10 * 60 * 60
WINDOW_END_SECONDS = 14 * 60 * 60
WINDOW_HOURS = Decimal(4)

REQUIRED_GTFS_COLUMNS: Mapping[str, frozenset[str]] = {
    "agency.txt": frozenset({"agency_name", "agency_url", "agency_timezone"}),
    "routes.txt": frozenset({"route_id", "route_short_name", "route_long_name", "route_type"}),
    "trips.txt": frozenset({"route_id", "service_id", "trip_id"}),
    "stops.txt": frozenset({"stop_id", "stop_name", "stop_lat", "stop_lon"}),
    "stop_times.txt": frozenset(
        {"trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"}
    ),
}
_OPTIONAL_GTFS_COLUMNS: Mapping[str, frozenset[str]] = {
    "calendar.txt": frozenset(
        {
            "service_id",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
            "start_date",
            "end_date",
        }
    ),
    "calendar_dates.txt": frozenset({"service_id", "date", "exception_type"}),
    "feed_info.txt": frozenset({"feed_publisher_name", "feed_publisher_url", "feed_lang"}),
    "shapes.txt": frozenset({"shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"}),
}
_BASE_REQUIRED_FILES = frozenset(
    {"agency.txt", "routes.txt", "trips.txt", "stops.txt", "stop_times.txt"}
)
_WEEKDAYS = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)

ServiceAreaContains = Callable[[Decimal, Decimal], bool]


class GtfsSourceError(SourceValidationError):
    """Raised when GTFS bytes or records violate the approved source contract."""


@dataclass(frozen=True, slots=True)
class GtfsAgency:
    agency_id: str | None
    name: str
    url: str
    timezone: str


@dataclass(frozen=True, slots=True)
class GtfsFeedInfo:
    publisher_name: str
    publisher_url: str
    language: str
    start_date: date | None
    end_date: date | None
    feed_version: str | None


@dataclass(frozen=True, slots=True)
class GtfsRoute:
    route_id: str
    agency_id: str | None
    short_name: str | None
    long_name: str | None
    route_type: int


@dataclass(frozen=True, slots=True)
class GtfsStop:
    stop_id: str
    name: str
    latitude: Decimal
    longitude: Decimal


@dataclass(frozen=True, slots=True)
class GtfsTrip:
    route_id: str
    service_id: str
    trip_id: str
    headsign: str | None
    shape_id: str | None


@dataclass(frozen=True, slots=True)
class GtfsStopTime:
    trip_id: str
    stop_id: str
    stop_sequence: int
    arrival_seconds: int
    departure_seconds: int


@dataclass(frozen=True, slots=True)
class GtfsCalendar:
    service_id: str
    weekdays: tuple[bool, ...]
    start_date: date
    end_date: date


@dataclass(frozen=True, slots=True)
class GtfsCalendarDate:
    service_id: str
    service_date: date
    exception_type: int


@dataclass(frozen=True, slots=True)
class ParsedGtfsArchive:
    """Strict CSV tables retained from one exact GTFS ZIP."""

    archive_sha256: str
    member_names: tuple[str, ...]
    tables: Mapping[str, tuple[Mapping[str, str], ...]]
    headers: Mapping[str, tuple[str, ...]]


@dataclass(frozen=True, slots=True)
class NormalizedGtfs:
    """Typed, referentially valid static schedule used by calculations."""

    archive_sha256: str = field(compare=False)
    agency: GtfsAgency
    feed_info: GtfsFeedInfo | None
    routes: tuple[GtfsRoute, ...]
    trips: tuple[GtfsTrip, ...]
    stops: tuple[GtfsStop, ...]
    stop_times: tuple[GtfsStopTime, ...]
    calendars: tuple[GtfsCalendar, ...]
    calendar_dates: tuple[GtfsCalendarDate, ...]
    service_dates: tuple[date, ...]
    shape_quality_status: str
    missing_shape_trip_ids: tuple[str, ...]
    feed_valid_from: date
    feed_valid_through: date


@dataclass(frozen=True, slots=True)
class GtfsAnalysisDates:
    week_start: date
    tuesday: date
    saturday: date
    feed_valid_from: date
    feed_valid_through: date


@dataclass(frozen=True, slots=True)
class ScheduledServiceSummary:
    tuesday_departures: int | None
    saturday_departures: int | None
    scheduled_service_intensity: Decimal | None
    quality_status: str
    quality_reason: str | None


@dataclass(frozen=True, slots=True)
class MobilityDataValidationResult:
    report_path: Path
    error_count: int
    warning_count: int


@dataclass(frozen=True, slots=True)
class FetchedGtfs:
    content: bytes
    feed: NormalizedGtfs
    analysis_dates: GtfsAnalysisDates
    snapshot: StoredSnapshot
    validation: MobilityDataValidationResult


class ValidatorRunner(Protocol):
    def __call__(self, command: tuple[str, ...]) -> object: ...


def _default_validator_runner(command: tuple[str, ...]) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(command, check=False, capture_output=True)


def _validated_archive(content: bytes) -> tuple[zipfile.ZipFile, tuple[str, ...]]:
    if len(content) > MAX_ARCHIVE_BYTES:
        raise GtfsSourceError("GTFS archive exceeds the raw response size bound")
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as error:
        raise GtfsSourceError("GTFS response is not a valid ZIP archive") from error
    infos = archive.infolist()
    names = tuple(info.filename for info in infos)
    if not infos or len(infos) > MAX_ARCHIVE_MEMBERS or len(names) != len(set(names)):
        archive.close()
        raise GtfsSourceError("GTFS archive has an invalid member count or duplicate member")
    if any(
        info.is_dir()
        or info.flag_bits & 0x1
        or "/" in info.filename
        or "\\" in info.filename
        or info.filename in {".", ".."}
        or not info.filename.endswith(".txt")
        for info in infos
    ):
        archive.close()
        raise GtfsSourceError("GTFS archive contains an unsafe or unsupported member")
    if sum(info.file_size for info in infos) > MAX_UNCOMPRESSED_ARCHIVE_BYTES:
        archive.close()
        raise GtfsSourceError("GTFS archive exceeds the uncompressed size bound")
    missing = sorted(_BASE_REQUIRED_FILES - set(names))
    if missing:
        archive.close()
        raise GtfsSourceError(f"GTFS archive is missing required files: {missing}")
    if not ({"calendar.txt", "calendar_dates.txt"} & set(names)):
        archive.close()
        raise GtfsSourceError("GTFS archive requires calendar.txt and/or calendar_dates.txt")
    if "frequencies.txt" in names:
        archive.close()
        raise GtfsSourceError(
            "GTFS frequencies.txt is unsupported because service intensity uses exact trips"
        )
    return archive, names


def _read_table(
    content: bytes, member: str
) -> tuple[tuple[str, ...], tuple[Mapping[str, str], ...]]:
    try:
        text = content.decode(SOURCE_ENCODING)
    except UnicodeDecodeError as error:
        raise GtfsSourceError(f"{member} is not valid UTF-8") from error
    reader = csv.DictReader(io.StringIO(text, newline=""))
    headers = tuple(reader.fieldnames or ())
    if not headers or len(headers) != len(set(headers)) or any(not value for value in headers):
        raise GtfsSourceError(f"{member} has a missing or duplicate header")
    required = REQUIRED_GTFS_COLUMNS.get(member, _OPTIONAL_GTFS_COLUMNS.get(member))
    if required is not None:
        missing = sorted(required - set(headers))
        if missing:
            raise GtfsSourceError(f"{member} is missing required columns: {missing}")
    rows: list[Mapping[str, str]] = []
    for position, row in enumerate(reader, start=2):
        if None in row or any(value is None for value in row.values()):
            raise GtfsSourceError(f"{member} row {position} has the wrong width")
        rows.append(dict(cast(Mapping[str, str], row)))
    return headers, tuple(rows)


def read_gtfs_archive(
    content: bytes,
    *,
    service_area_contains: ServiceAreaContains,
) -> ParsedGtfsArchive:
    """Read a bounded GTFS ZIP and independently enforce its relied-on CSV contract."""

    archive, member_names = _validated_archive(content)
    tables: dict[str, tuple[Mapping[str, str], ...]] = {}
    headers: dict[str, tuple[str, ...]] = {}
    with archive:
        for member in sorted(member_names):
            try:
                member_content = archive.read(member)
            except (KeyError, RuntimeError, zipfile.BadZipFile) as error:
                raise GtfsSourceError(f"GTFS archive cannot read {member}") from error
            header, rows = _read_table(member_content, member)
            headers[member] = header
            tables[member] = rows

    parsed = ParsedGtfsArchive(
        archive_sha256=hashlib.sha256(content).hexdigest(),
        member_names=tuple(sorted(member_names)),
        tables=tables,
        headers=headers,
    )
    _validate_stop_coordinates(parsed, service_area_contains=service_area_contains)
    return parsed


def _validate_stop_coordinates(
    parsed: ParsedGtfsArchive,
    *,
    service_area_contains: ServiceAreaContains,
) -> None:
    for position, row in enumerate(parsed.tables["stops.txt"], start=2):
        latitude = _coordinate(
            _required(row, "stop_lat", f"stops.txt row {position}"),
            f"stops.txt row {position} stop_lat coordinate",
            minimum=Decimal("-90"),
            maximum=Decimal("90"),
        )
        longitude = _coordinate(
            _required(row, "stop_lon", f"stops.txt row {position}"),
            f"stops.txt row {position} stop_lon coordinate",
            minimum=Decimal("-180"),
            maximum=Decimal("180"),
        )
        if not service_area_contains(longitude, latitude):
            raise GtfsSourceError(f"stops.txt row {position} is outside the approved service area")


def _required(row: Mapping[str, str], field: str, context: str) -> str:
    value = row.get(field, "").strip()
    if not value:
        raise GtfsSourceError(f"{context} has no {field}")
    return value


def _optional(row: Mapping[str, str], field: str) -> str | None:
    value = row.get(field, "").strip()
    return value or None


def _date(raw: str, context: str) -> date:
    try:
        return datetime.strptime(raw, "%Y%m%d").date()
    except ValueError as error:
        raise GtfsSourceError(f"{context} must be a valid YYYYMMDD date") from error


def _integer(raw: str, context: str, *, minimum: int = 0) -> int:
    try:
        value = int(raw)
    except ValueError as error:
        raise GtfsSourceError(f"{context} must be an integer") from error
    if str(value) != raw.strip() or value < minimum:
        raise GtfsSourceError(f"{context} must be an integer at least {minimum}")
    return value


def _coordinate(raw: str, context: str, *, minimum: Decimal, maximum: Decimal) -> Decimal:
    try:
        value = Decimal(raw)
    except InvalidOperation as error:
        raise GtfsSourceError(f"{context} must be a decimal coordinate") from error
    if not value.is_finite() or value < minimum or value > maximum:
        raise GtfsSourceError(f"{context} is outside the valid coordinate range")
    return value


def _time_seconds(raw: str, context: str) -> int:
    parts = raw.split(":")
    if len(parts) != 3 or any(
        len(part) != 2 or not part.isascii() or not part.isdigit() for part in parts
    ):
        raise GtfsSourceError(f"{context} must use HH:MM:SS")
    hour, minute, second = (int(part) for part in parts)
    if hour > 99 or minute > 59 or second > 59:
        raise GtfsSourceError(f"{context} is outside the GTFS time range")
    return hour * 3600 + minute * 60 + second


def _unique_ids(values: Sequence[str], context: str, identifier: str) -> None:
    if len(values) != len(set(values)):
        raise GtfsSourceError(f"{context} contains duplicate {identifier} values")


def _normalize_gtfs(
    parsed: ParsedGtfsArchive,
    *,
    service_area_contains: ServiceAreaContains,
) -> NormalizedGtfs:
    agencies: list[GtfsAgency] = []
    for position, row in enumerate(parsed.tables["agency.txt"], start=2):
        timezone = _required(row, "agency_timezone", f"agency.txt row {position}")
        try:
            ZoneInfo(timezone)
        except ZoneInfoNotFoundError as error:
            raise GtfsSourceError(f"agency.txt row {position} has an unknown timezone") from error
        agencies.append(
            GtfsAgency(
                agency_id=_optional(row, "agency_id"),
                name=_required(row, "agency_name", f"agency.txt row {position}"),
                url=_required(row, "agency_url", f"agency.txt row {position}"),
                timezone=timezone,
            )
        )
    if len(agencies) != 1:
        raise GtfsSourceError("MCTS GTFS must contain exactly one agency")
    _unique_ids(
        [item.agency_id for item in agencies if item.agency_id is not None],
        "agency.txt",
        "agency_id",
    )

    routes: list[GtfsRoute] = []
    for position, row in enumerate(parsed.tables["routes.txt"], start=2):
        routes.append(
            GtfsRoute(
                route_id=_required(row, "route_id", f"routes.txt row {position}"),
                agency_id=_optional(row, "agency_id"),
                short_name=_optional(row, "route_short_name"),
                long_name=_optional(row, "route_long_name"),
                route_type=_integer(
                    _required(row, "route_type", f"routes.txt row {position}"),
                    f"routes.txt row {position} route_type",
                ),
            )
        )
    _unique_ids([item.route_id for item in routes], "routes.txt", "route_id")

    stops: list[GtfsStop] = []
    for position, row in enumerate(parsed.tables["stops.txt"], start=2):
        latitude = _coordinate(
            _required(row, "stop_lat", f"stops.txt row {position}"),
            f"stops.txt row {position} stop_lat",
            minimum=Decimal("-90"),
            maximum=Decimal("90"),
        )
        longitude = _coordinate(
            _required(row, "stop_lon", f"stops.txt row {position}"),
            f"stops.txt row {position} stop_lon",
            minimum=Decimal("-180"),
            maximum=Decimal("180"),
        )
        if not service_area_contains(longitude, latitude):
            raise GtfsSourceError(f"stops.txt row {position} is outside the approved service area")
        stops.append(
            GtfsStop(
                stop_id=_required(row, "stop_id", f"stops.txt row {position}"),
                name=_required(row, "stop_name", f"stops.txt row {position}"),
                latitude=latitude,
                longitude=longitude,
            )
        )
    _unique_ids([item.stop_id for item in stops], "stops.txt", "stop_id")

    calendars: list[GtfsCalendar] = []
    for position, row in enumerate(parsed.tables.get("calendar.txt", ()), start=2):
        flags = tuple(
            _integer(_required(row, weekday, f"calendar.txt row {position}"), f"{weekday}")
            for weekday in _WEEKDAYS
        )
        if any(flag not in {0, 1} for flag in flags):
            raise GtfsSourceError(f"calendar.txt row {position} weekday flags must be 0 or 1")
        start = _date(_required(row, "start_date", f"calendar.txt row {position}"), "start_date")
        end = _date(_required(row, "end_date", f"calendar.txt row {position}"), "end_date")
        if start > end:
            raise GtfsSourceError(f"calendar.txt row {position} has an inverted date range")
        calendars.append(
            GtfsCalendar(
                service_id=_required(row, "service_id", f"calendar.txt row {position}"),
                weekdays=tuple(bool(flag) for flag in flags),
                start_date=start,
                end_date=end,
            )
        )
    _unique_ids([item.service_id for item in calendars], "calendar.txt", "service_id")

    calendar_dates: list[GtfsCalendarDate] = []
    calendar_date_keys: list[tuple[str, date]] = []
    for position, row in enumerate(parsed.tables.get("calendar_dates.txt", ()), start=2):
        service_id = _required(row, "service_id", f"calendar_dates.txt row {position}")
        service_date = _date(
            _required(row, "date", f"calendar_dates.txt row {position}"),
            f"calendar_dates.txt row {position} date",
        )
        exception_type = _integer(
            _required(row, "exception_type", f"calendar_dates.txt row {position}"),
            f"calendar_dates.txt row {position} exception_type",
        )
        if exception_type not in {1, 2}:
            raise GtfsSourceError("calendar_dates.txt exception_type must be 1 or 2")
        calendar_date_keys.append((service_id, service_date))
        calendar_dates.append(GtfsCalendarDate(service_id, service_date, exception_type))
    if len(calendar_date_keys) != len(set(calendar_date_keys)):
        raise GtfsSourceError("calendar_dates.txt contains duplicate service/date rows")

    service_ids = {item.service_id for item in calendars}
    added_service_ids = {item.service_id for item in calendar_dates if item.exception_type == 1}
    known_service_ids = service_ids | added_service_ids
    if not known_service_ids:
        raise GtfsSourceError("GTFS contains no service calendar records")
    if any(
        item.exception_type == 2 and item.service_id not in service_ids for item in calendar_dates
    ):
        raise GtfsSourceError("calendar_dates.txt removes an unknown calendar service")

    trips: list[GtfsTrip] = []
    for position, row in enumerate(parsed.tables["trips.txt"], start=2):
        trips.append(
            GtfsTrip(
                route_id=_required(row, "route_id", f"trips.txt row {position}"),
                service_id=_required(row, "service_id", f"trips.txt row {position}"),
                trip_id=_required(row, "trip_id", f"trips.txt row {position}"),
                headsign=_optional(row, "trip_headsign"),
                shape_id=_optional(row, "shape_id"),
            )
        )
    _unique_ids([item.trip_id for item in trips], "trips.txt", "trip_id")

    stop_times: list[GtfsStopTime] = []
    stop_time_keys: list[tuple[str, int]] = []
    for position, row in enumerate(parsed.tables["stop_times.txt"], start=2):
        trip_id = _required(row, "trip_id", f"stop_times.txt row {position}")
        sequence = _integer(
            _required(row, "stop_sequence", f"stop_times.txt row {position}"),
            f"stop_times.txt row {position} stop_sequence",
        )
        stop_time_keys.append((trip_id, sequence))
        stop_times.append(
            GtfsStopTime(
                trip_id=trip_id,
                stop_id=_required(row, "stop_id", f"stop_times.txt row {position}"),
                stop_sequence=sequence,
                arrival_seconds=_time_seconds(
                    _required(row, "arrival_time", f"stop_times.txt row {position}"),
                    f"stop_times.txt row {position} arrival_time",
                ),
                departure_seconds=_time_seconds(
                    _required(row, "departure_time", f"stop_times.txt row {position}"),
                    f"stop_times.txt row {position} departure_time",
                ),
            )
        )
    if len(stop_time_keys) != len(set(stop_time_keys)):
        raise GtfsSourceError("stop_times.txt contains duplicate trip/stop_sequence rows")

    route_ids = {item.route_id for item in routes}
    agency_ids = {item.agency_id for item in agencies if item.agency_id is not None}
    trip_ids = {item.trip_id for item in trips}
    stop_ids = {item.stop_id for item in stops}
    if agency_ids and any(
        item.agency_id is not None and item.agency_id not in agency_ids for item in routes
    ):
        raise GtfsSourceError("routes.txt contains an unknown agency_id")
    if any(item.route_id not in route_ids for item in trips):
        raise GtfsSourceError("trips.txt contains an unknown route_id")
    if any(item.service_id not in known_service_ids for item in trips):
        raise GtfsSourceError("trips.txt contains an unknown service_id")
    if any(item.trip_id not in trip_ids for item in stop_times):
        raise GtfsSourceError("stop_times.txt contains an unknown trip_id")
    if any(item.stop_id not in stop_ids for item in stop_times):
        raise GtfsSourceError("stop_times.txt contains an unknown stop_id")
    trip_route_ids = {item.route_id for item in trips}
    if route_ids - trip_route_ids:
        raise GtfsSourceError("routes.txt contains a route_id with no trips")
    stop_time_trip_ids = {item.trip_id for item in stop_times}
    if trip_ids - stop_time_trip_ids:
        raise GtfsSourceError("trips.txt contains a trip_id with no stop_times")
    used_stop_ids = {item.stop_id for item in stop_times}
    if stop_ids - used_stop_ids:
        raise GtfsSourceError("stops.txt contains a stop_id with no stop_times")

    shape_ids = {
        _required(row, "shape_id", f"shapes.txt row {position}")
        for position, row in enumerate(parsed.tables.get("shapes.txt", ()), start=2)
    }
    referenced_shape_ids = {item.shape_id for item in trips if item.shape_id is not None}
    missing_shape_ids = referenced_shape_ids - shape_ids
    missing_shape_trip_ids = tuple(
        sorted(
            item.trip_id
            for item in trips
            if item.shape_id is None or item.shape_id in missing_shape_ids
        )
    )
    shape_quality_status = "complete" if not missing_shape_trip_ids else "partial_missing"

    all_dates = [item.start_date for item in calendars]
    all_dates.extend(item.end_date for item in calendars)
    all_dates.extend(item.service_date for item in calendar_dates)
    calendar_valid_from = min(all_dates)
    calendar_valid_through = max(all_dates)

    feed_info: GtfsFeedInfo | None = None
    feed_rows = parsed.tables.get("feed_info.txt", ())
    if len(feed_rows) > 1:
        raise GtfsSourceError("feed_info.txt must contain at most one row")
    if feed_rows:
        row = feed_rows[0]
        feed_info_start = (
            _date(row["feed_start_date"].strip(), "feed_start_date")
            if row.get("feed_start_date", "").strip()
            else None
        )
        feed_info_end = (
            _date(row["feed_end_date"].strip(), "feed_end_date")
            if row.get("feed_end_date", "").strip()
            else None
        )
        if (
            feed_info_start is not None
            and feed_info_end is not None
            and feed_info_start > feed_info_end
        ):
            raise GtfsSourceError("feed_info.txt has an inverted date range")
        feed_info = GtfsFeedInfo(
            publisher_name=_required(row, "feed_publisher_name", "feed_info.txt row 2"),
            publisher_url=_required(row, "feed_publisher_url", "feed_info.txt row 2"),
            language=_required(row, "feed_lang", "feed_info.txt row 2"),
            start_date=feed_info_start,
            end_date=feed_info_end,
            feed_version=_optional(row, "feed_version"),
        )

    feed_valid_from = max(
        calendar_valid_from,
        feed_info.start_date
        if feed_info is not None and feed_info.start_date is not None
        else calendar_valid_from,
    )
    feed_valid_through = min(
        calendar_valid_through,
        feed_info.end_date
        if feed_info is not None and feed_info.end_date is not None
        else calendar_valid_through,
    )
    if feed_valid_from > feed_valid_through:
        raise GtfsSourceError("feed_info validity does not overlap the service calendar")

    service_dates = tuple(
        service_date
        for offset in range((feed_valid_through - feed_valid_from).days + 1)
        if _active_service_ids_from_rows(
            calendars,
            calendar_dates,
            service_date := feed_valid_from + timedelta(days=offset),
        )
    )

    return NormalizedGtfs(
        archive_sha256=parsed.archive_sha256,
        agency=agencies[0],
        feed_info=feed_info,
        routes=tuple(sorted(routes, key=lambda item: item.route_id)),
        trips=tuple(sorted(trips, key=lambda item: item.trip_id)),
        stops=tuple(sorted(stops, key=lambda item: item.stop_id)),
        stop_times=tuple(sorted(stop_times, key=lambda item: (item.trip_id, item.stop_sequence))),
        calendars=tuple(sorted(calendars, key=lambda item: item.service_id)),
        calendar_dates=tuple(
            sorted(calendar_dates, key=lambda item: (item.service_date, item.service_id))
        ),
        service_dates=service_dates,
        shape_quality_status=shape_quality_status,
        missing_shape_trip_ids=missing_shape_trip_ids,
        feed_valid_from=feed_valid_from,
        feed_valid_through=feed_valid_through,
    )


def normalize_gtfs(parsed: ParsedGtfsArchive) -> NormalizedGtfs:
    """Normalize a parsed archive already checked by ``read_gtfs_archive``."""

    # read_gtfs_archive has already enforced the caller's service-area predicate. This second
    # pass deliberately uses a total predicate and cannot make an invalid point valid because
    # the parsed archive is not publicly constructible from unchecked source bytes in practice.
    return _normalize_gtfs(parsed, service_area_contains=lambda _longitude, _latitude: True)


def _active_service_ids_from_rows(
    calendars: Sequence[GtfsCalendar],
    calendar_dates: Sequence[GtfsCalendarDate],
    service_date: date,
) -> frozenset[str]:
    active = {
        item.service_id
        for item in calendars
        if item.start_date <= service_date <= item.end_date
        and item.weekdays[service_date.weekday()]
    }
    for exception in calendar_dates:
        if exception.service_date != service_date:
            continue
        if exception.exception_type == 1:
            active.add(exception.service_id)
        else:
            active.discard(exception.service_id)
    return frozenset(active)


def _active_service_ids(feed: NormalizedGtfs, service_date: date) -> frozenset[str]:
    return _active_service_ids_from_rows(feed.calendars, feed.calendar_dates, service_date)


def _date_is_covered(feed: NormalizedGtfs, service_date: date) -> bool:
    if any(item.start_date <= service_date <= item.end_date for item in feed.calendars):
        return True
    return any(item.service_date == service_date for item in feed.calendar_dates)


def select_analysis_dates(
    feed: NormalizedGtfs,
    *,
    retrieved_at: datetime,
) -> GtfsAnalysisDates:
    """Select the first complete service week using the agency's local calendar date."""

    if retrieved_at.tzinfo is None or retrieved_at.utcoffset() is None:
        raise GtfsSourceError("GTFS retrieval timestamp must be timezone-aware")
    local_date = retrieved_at.astimezone(ZoneInfo(feed.agency.timezone)).date()
    candidate = local_date + timedelta(days=(-local_date.weekday()) % 7)
    last_start = feed.feed_valid_through - timedelta(days=6)
    while candidate <= last_start:
        week = tuple(candidate + timedelta(days=offset) for offset in range(7))
        tuesday = candidate + timedelta(days=1)
        saturday = candidate + timedelta(days=5)
        trip_service_ids = {item.service_id for item in feed.trips}
        if (
            all(_date_is_covered(feed, item) for item in week)
            and (_active_service_ids(feed, tuesday) & trip_service_ids)
            and (_active_service_ids(feed, saturday) & trip_service_ids)
        ):
            return GtfsAnalysisDates(
                week_start=candidate,
                tuesday=tuesday,
                saturday=saturday,
                feed_valid_from=feed.feed_valid_from,
                feed_valid_through=feed.feed_valid_through,
            )
        candidate += timedelta(days=7)
    raise GtfsSourceError("GTFS has no complete covered analysis week on or after retrieval")


def _departure_count(
    feed: NormalizedGtfs,
    *,
    reachable_stop_ids: frozenset[str],
    service_date: date,
) -> int:
    active_service_ids = _active_service_ids(feed, service_date)
    active_trip_ids = {item.trip_id for item in feed.trips if item.service_id in active_service_ids}
    return len(
        {
            item.trip_id
            for item in feed.stop_times
            if item.trip_id in active_trip_ids
            and item.stop_id in reachable_stop_ids
            and WINDOW_START_SECONDS <= item.departure_seconds < WINDOW_END_SECONDS
        }
    )


def summarize_scheduled_service(
    feed: NormalizedGtfs,
    *,
    reachable_stop_ids: Sequence[str] | None,
    analysis_dates: GtfsAnalysisDates,
) -> ScheduledServiceSummary:
    """Count unique scheduled trips in the approved Tuesday/Saturday service windows."""

    if reachable_stop_ids is None:
        return ScheduledServiceSummary(None, None, None, "missing", "origin is unsnapped")
    known_stop_ids = {item.stop_id for item in feed.stops}
    reachable = frozenset(reachable_stop_ids)
    unknown = sorted(reachable - known_stop_ids)
    if unknown:
        return ScheduledServiceSummary(
            None,
            None,
            None,
            "missing",
            f"reachable stop IDs are absent from GTFS: {unknown}",
        )
    if (
        analysis_dates.feed_valid_from != feed.feed_valid_from
        or analysis_dates.feed_valid_through != feed.feed_valid_through
        or analysis_dates.tuesday < feed.feed_valid_from
        or analysis_dates.saturday > feed.feed_valid_through
        or not _date_is_covered(feed, analysis_dates.tuesday)
        or not _date_is_covered(feed, analysis_dates.saturday)
    ):
        return ScheduledServiceSummary(None, None, None, "missing", "analysis_date_not_covered")
    if not _active_service_ids(feed, analysis_dates.tuesday) or not _active_service_ids(
        feed, analysis_dates.saturday
    ):
        return ScheduledServiceSummary(
            None, None, None, "missing", "analysis date has no resolved active service"
        )
    tuesday = _departure_count(
        feed, reachable_stop_ids=reachable, service_date=analysis_dates.tuesday
    )
    saturday = _departure_count(
        feed, reachable_stop_ids=reachable, service_date=analysis_dates.saturday
    )
    intensity = Decimal(min(tuesday, saturday)) / WINDOW_HOURS
    return ScheduledServiceSummary(tuesday, saturday, intensity, "verified", None)


def _notice_counts(value: object) -> tuple[int, int]:
    errors = 0
    warnings = 0
    if isinstance(value, Mapping):
        severity = value.get("severity")
        count_raw = value.get("totalNotices", value.get("count", 1))
        count = count_raw if isinstance(count_raw, int) and not isinstance(count_raw, bool) else 1
        if severity == "ERROR":
            errors += count
        elif severity == "WARNING":
            warnings += count
        for nested in value.values():
            nested_errors, nested_warnings = _notice_counts(nested)
            errors += nested_errors
            warnings += nested_warnings
    elif isinstance(value, list):
        for nested in value:
            nested_errors, nested_warnings = _notice_counts(nested)
            errors += nested_errors
            warnings += nested_warnings
    return errors, warnings


def _has_system_errors(value: object) -> bool:
    if value in (None, [], {}):
        return False
    if isinstance(value, Mapping):
        notice_keys = ("notices", "errors", "systemErrors", "system_errors")
        present = [value[key] for key in notice_keys if key in value]
        if present:
            return any(item not in (None, [], {}) for item in present)
        return True
    return True


def validate_gtfs_with_mobilitydata(
    snapshot_path: Path,
    *,
    validator_jar_path: Path,
    validator_sha256: str = MOBILITYDATA_VALIDATOR_SHA256,
    report_dir: Path,
    runner: ValidatorRunner = _default_validator_runner,
) -> MobilityDataValidationResult:
    """Run the pinned validator and retain only deterministic warning/error counts."""

    try:
        jar_content = validator_jar_path.read_bytes()
    except OSError as error:
        raise GtfsSourceError("MobilityData validator JAR cannot be read") from error
    if hashlib.sha256(jar_content).hexdigest() != validator_sha256:
        raise GtfsSourceError("MobilityData validator JAR checksum does not match v8.0.1")
    if not snapshot_path.is_file():
        raise GtfsSourceError("GTFS snapshot path is not a regular file")
    report_dir.mkdir(parents=True, exist_ok=True)
    snapshot_sha256 = hashlib.sha256(snapshot_path.read_bytes()).hexdigest()
    validator_output_dir = report_dir / "validator-output" / snapshot_sha256
    command = (
        "java",
        "-jar",
        str(validator_jar_path),
        "-i",
        str(snapshot_path),
        "-o",
        str(validator_output_dir),
    )
    try:
        result = runner(command)
    except (OSError, subprocess.SubprocessError) as error:
        raise GtfsSourceError("MobilityData validator could not execute") from error
    return_code = getattr(result, "returncode", None)
    if not isinstance(return_code, int) or return_code != 0:
        raise GtfsSourceError("MobilityData validator exited unsuccessfully")

    raw_report_path = validator_output_dir / "report.json"
    try:
        report_value: object = json.loads(raw_report_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise GtfsSourceError("MobilityData validator report is missing or invalid") from error
    system_errors_path = validator_output_dir / "system_errors.json"
    system_errors: object = None
    if system_errors_path.exists():
        try:
            system_errors = json.loads(system_errors_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise GtfsSourceError("MobilityData system-error report is invalid") from error
    error_count, warning_count = _notice_counts(report_value)
    if not isinstance(report_value, Mapping):
        raise GtfsSourceError("MobilityData validator report must be an object")
    notices = report_value.get("notices", [])
    if not isinstance(notices, list):
        raise GtfsSourceError("MobilityData validator notices must be an array")
    retained_notices = []
    for notice in notices:
        if not isinstance(notice, Mapping):
            raise GtfsSourceError("MobilityData validator notice must be an object")
        retained_notices.append(
            {key: notice[key] for key in ("code", "severity", "totalNotices") if key in notice}
        )
    retained_notices.sort(
        key=lambda item: (
            str(item.get("severity", "")),
            str(item.get("code", "")),
            int(item.get("totalNotices", 0)),
        )
    )
    summary_path = report_dir / f"validator-report-{snapshot_sha256}.json"
    atomic_write_bytes(
        summary_path,
        canonical_json_bytes(
            {
                "error_count": error_count,
                "notices": retained_notices,
                "snapshot_sha256": snapshot_sha256,
                "validator_version": MOBILITYDATA_VALIDATOR_VERSION,
                "warning_count": warning_count,
            }
        ),
    )
    if error_count or _has_system_errors(system_errors):
        raise GtfsSourceError("MobilityData validator reported GTFS errors")
    return MobilityDataValidationResult(summary_path, error_count, warning_count)


def fetch_and_preserve_gtfs(
    root: Path,
    *,
    clock: Callable[[], datetime],
    source_last_modified: datetime,
    service_area_contains: ServiceAreaContains,
    validator_jar_path: Path,
    validator_sha256: str = MOBILITYDATA_VALIDATOR_SHA256,
    validator_runner: ValidatorRunner = _default_validator_runner,
    opener: Opener | None = None,
    sleeper: Sleeper | None = None,
    registry: MethodologyRegistry | None = None,
) -> FetchedGtfs:
    """Fetch once, independently validate, and preserve the exact mutable GTFS bytes."""

    parsed: ParsedGtfsArchive | None = None

    def validate(content: bytes) -> None:
        nonlocal parsed
        parsed = read_gtfs_archive(content, service_area_contains=service_area_contains)

    if opener is None and sleeper is None:
        content = fetch_bytes(
            MCTS_GTFS_SOURCE_URL,
            validator=validate,
            max_bytes=MAX_ARCHIVE_BYTES,
        )
    elif opener is None:
        content = fetch_bytes(
            MCTS_GTFS_SOURCE_URL,
            sleeper=cast(Sleeper, sleeper),
            validator=validate,
            max_bytes=MAX_ARCHIVE_BYTES,
        )
    elif sleeper is None:
        content = fetch_bytes(
            MCTS_GTFS_SOURCE_URL,
            opener=opener,
            validator=validate,
            max_bytes=MAX_ARCHIVE_BYTES,
        )
    else:
        content = fetch_bytes(
            MCTS_GTFS_SOURCE_URL,
            opener=opener,
            sleeper=sleeper,
            validator=validate,
            max_bytes=MAX_ARCHIVE_BYTES,
        )
    if parsed is None:
        raise AssertionError("GTFS fetch validator did not parse the response")
    feed = normalize_gtfs(parsed)
    retrieved_at = clock()
    if retrieved_at.tzinfo is None or retrieved_at.utcoffset() is None:
        raise GtfsSourceError("GTFS snapshot clock must return a timezone-aware datetime")
    if source_last_modified.tzinfo is None or source_last_modified.utcoffset() is None:
        raise GtfsSourceError("GTFS source Last-Modified timestamp must be timezone-aware")
    if source_last_modified > retrieved_at:
        raise GtfsSourceError("GTFS source Last-Modified timestamp cannot follow retrieval")
    analysis_dates = select_analysis_dates(feed, retrieved_at=retrieved_at)
    methodology = registry or load_registry()
    source = next(item for item in methodology.sources if item.key == SOURCE_KEY)
    dataset_version = (
        feed.feed_info.feed_version
        if feed.feed_info is not None and feed.feed_info.feed_version is not None
        else f"service-{feed.feed_valid_from.isoformat()}-{feed.feed_valid_through.isoformat()}"
    )
    snapshot = preserve_snapshot(
        root=root,
        pipeline_slug="food-equity",
        source_key=SOURCE_KEY,
        source_url=MCTS_GTFS_SOURCE_URL,
        dataset_version=dataset_version,
        content=content,
        schema={
            "headers": {key: list(value) for key, value in sorted(parsed.headers.items())},
            "members": list(parsed.member_names),
        },
        row_or_feature_count=len(feed.stop_times),
        license=source.license_notes,
        methodology_reference=methodology.methodology_version,
        request_metadata={
            "agency_timezone": feed.agency.timezone,
            "analysis_saturday": analysis_dates.saturday.isoformat(),
            "analysis_tuesday": analysis_dates.tuesday.isoformat(),
            "analysis_week_start": analysis_dates.week_start.isoformat(),
            "feed_valid_from": feed.feed_valid_from.isoformat(),
            "feed_valid_through": feed.feed_valid_through.isoformat(),
            "not_sponsored_or_operated_by_mts_mcts": True,
            "source_last_modified": source_last_modified.astimezone(UTC)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z"),
            "static_schedule_only": True,
            "terms_url": MCTS_DEVELOPER_TERMS_URL,
        },
        clock=lambda: retrieved_at.astimezone(UTC),
    )
    validation = validate_gtfs_with_mobilitydata(
        snapshot.raw_path,
        validator_jar_path=validator_jar_path,
        validator_sha256=validator_sha256,
        report_dir=ArtifactPaths.for_pipeline(root, "food-equity").reports / SOURCE_KEY,
        runner=validator_runner,
    )
    return FetchedGtfs(content, feed, analysis_dates, snapshot, validation)


__all__ = [
    "FetchedGtfs",
    "GtfsAnalysisDates",
    "GtfsSourceError",
    "MCTS_DEVELOPER_TERMS_URL",
    "MCTS_GTFS_SOURCE_URL",
    "MOBILITYDATA_VALIDATOR_SHA256",
    "MOBILITYDATA_VALIDATOR_VERSION",
    "MAX_ARCHIVE_BYTES",
    "MobilityDataValidationResult",
    "NormalizedGtfs",
    "ParsedGtfsArchive",
    "REQUIRED_GTFS_COLUMNS",
    "ScheduledServiceSummary",
    "fetch_and_preserve_gtfs",
    "normalize_gtfs",
    "read_gtfs_archive",
    "select_analysis_dates",
    "summarize_scheduled_service",
    "validate_gtfs_with_mobilitydata",
]
