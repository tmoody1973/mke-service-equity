from __future__ import annotations

import hashlib
import io
import json
import subprocess
import zipfile
from dataclasses import replace
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from pipelines.common.http import HttpFetchError
from pipelines.food_equity.gtfs import (
    MCTS_DEVELOPER_TERMS_URL,
    MCTS_GTFS_SOURCE_URL,
    MAX_ARCHIVE_BYTES,
    MOBILITYDATA_VALIDATOR_SHA256,
    MOBILITYDATA_VALIDATOR_VERSION,
    REQUIRED_GTFS_COLUMNS,
    GtfsSourceError,
    fetch_and_preserve_gtfs,
    normalize_gtfs,
    read_gtfs_archive,
    select_analysis_dates,
    summarize_scheduled_service,
    validate_gtfs_with_mobilitydata,
)


FIXTURE_ROOT = Path(__file__).parents[1] / "fixtures/food_equity/gtfs"
GTFS_MEMBERS = (
    "agency.txt",
    "calendar.txt",
    "calendar_dates.txt",
    "feed_info.txt",
    "routes.txt",
    "shapes.txt",
    "stop_times.txt",
    "stops.txt",
    "trips.txt",
)
RETRIEVED_AT = datetime(2026, 9, 1, 1, tzinfo=UTC)


def archive_bytes(
    *,
    replacements: dict[str, bytes] | None = None,
    member_names: tuple[str, ...] = GTFS_MEMBERS,
) -> bytes:
    replacements = replacements or {}
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in member_names:
            member = zipfile.ZipInfo(name, date_time=(2026, 8, 29, 0, 0, 0))
            member.compress_type = zipfile.ZIP_DEFLATED
            content = (
                replacements[name] if name in replacements else (FIXTURE_ROOT / name).read_bytes()
            )
            archive.writestr(member, content)
    return output.getvalue()


def changed_member(name: str, old: str, new: str) -> bytes:
    return (FIXTURE_ROOT / name).read_text().replace(old, new).encode()


def parse_fixture(
    content: bytes | None = None,
    *,
    service_area_contains=lambda _longitude, _latitude: True,
):
    return read_gtfs_archive(
        content or archive_bytes(),
        service_area_contains=service_area_contains,
    )


def normalized_fixture(content: bytes | None = None):
    return normalize_gtfs(parse_fixture(content))


class FakeResponse:
    def __init__(self, content: bytes, *, last_modified: str | None = None) -> None:
        self.content = content
        self.headers = {"Last-Modified": last_modified} if last_modified is not None else {}

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self, amount: int = -1) -> bytes:
        return self.content if amount < 0 else self.content[:amount]


def test_locks_approved_mcts_and_validator_contract() -> None:
    assert MCTS_GTFS_SOURCE_URL == "https://kamino.mcts.org/gtfs/google_transit.zip"
    assert MCTS_DEVELOPER_TERMS_URL == "https://www.ridemcts.com/policies/developer-terms"
    assert MOBILITYDATA_VALIDATOR_VERSION == "8.0.1"
    assert MOBILITYDATA_VALIDATOR_SHA256 == (
        "19293ddd9b6f954f216d4f12054bd8a3232921751c4484339e339764a91000e2"
    )
    assert REQUIRED_GTFS_COLUMNS == {
        "agency.txt": frozenset({"agency_name", "agency_url", "agency_timezone"}),
        "routes.txt": frozenset({"route_id", "route_short_name", "route_long_name", "route_type"}),
        "trips.txt": frozenset({"route_id", "service_id", "trip_id"}),
        "stops.txt": frozenset({"stop_id", "stop_name", "stop_lat", "stop_lon"}),
        "stop_times.txt": frozenset(
            {"trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"}
        ),
    }


def test_reads_feed_metadata_agency_and_typed_route_trip_stop_coverage() -> None:
    feed = normalized_fixture()

    assert (
        feed.agency.agency_id,
        feed.agency.name,
        feed.agency.timezone,
    ) == ("MCTS", "Synthetic Milwaukee Transit", "America/Chicago")
    assert (
        feed.feed_info.publisher_name,
        feed.feed_info.feed_version,
        feed.feed_info.start_date,
        feed.feed_info.end_date,
    ) == (
        "Synthetic MCTS Fixture",
        "synthetic-v1",
        date(2026, 8, 31),
        date(2026, 9, 6),
    )
    assert tuple(route.route_id for route in feed.routes) == ("R1", "R2")
    assert tuple(trip.trip_id for trip in feed.trips) == (
        "T1",
        "T2",
        "T3",
        "T4",
        "T5",
        "TREM",
    )
    assert tuple(stop.stop_id for stop in feed.stops) == ("S1", "S2", "S3")


def test_feed_info_is_typed_when_present_but_remains_optional() -> None:
    members = tuple(name for name in GTFS_MEMBERS if name != "feed_info.txt")

    feed = normalize_gtfs(parse_fixture(archive_bytes(member_names=members)))

    assert feed.feed_info is None


@pytest.mark.parametrize(
    "missing_member",
    ["agency.txt", "routes.txt", "trips.txt", "stops.txt", "stop_times.txt"],
)
def test_rejects_missing_required_schedule_files(missing_member: str) -> None:
    members = tuple(name for name in GTFS_MEMBERS if name != missing_member)

    with pytest.raises(GtfsSourceError, match="required.*file|missing.*file"):
        parse_fixture(archive_bytes(member_names=members))


def test_requires_calendar_or_calendar_dates_and_accepts_each_supported_form() -> None:
    assert normalized_fixture().service_dates
    dates_only = (
        "service_id,date,exception_type\n"
        "WKD,20260901,1\n"
        "SAT,20260905,1\n"
        "REMOVED,20260905,1\n"
        "EXTRA,20260905,1\n"
    ).encode()
    without_calendar = tuple(name for name in GTFS_MEMBERS if name != "calendar.txt")
    assert normalize_gtfs(
        parse_fixture(
            archive_bytes(
                replacements={"calendar_dates.txt": dates_only},
                member_names=without_calendar,
            )
        )
    ).service_dates

    trips_using_calendar = changed_member("trips.txt", "R2,EXTRA,T4", "R2,SAT,T4")
    without_calendar_dates = tuple(name for name in GTFS_MEMBERS if name != "calendar_dates.txt")
    assert normalize_gtfs(
        parse_fixture(
            archive_bytes(
                replacements={"trips.txt": trips_using_calendar},
                member_names=without_calendar_dates,
            )
        )
    ).service_dates

    members = tuple(
        name for name in GTFS_MEMBERS if name not in {"calendar.txt", "calendar_dates.txt"}
    )

    with pytest.raises(GtfsSourceError, match="calendar"):
        parse_fixture(archive_bytes(member_names=members))


def test_rejects_raw_archive_bytes_over_the_acquisition_bound(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import pipelines.food_equity.gtfs as gtfs

    content = archive_bytes()
    monkeypatch.setattr(gtfs, "MAX_ARCHIVE_BYTES", len(content) - 1)

    with pytest.raises(GtfsSourceError, match="raw response size|size bound"):
        parse_fixture(content)

    assert MAX_ARCHIVE_BYTES == 25_000_000


def test_bounded_fetch_rejects_oversized_response_before_parsing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import pipelines.food_equity.gtfs as gtfs

    content = archive_bytes()
    monkeypatch.setattr(gtfs, "MAX_ARCHIVE_BYTES", len(content) - 1)

    with pytest.raises(HttpFetchError, match="response exceeds"):
        fetch_and_preserve_gtfs(
            tmp_path,
            clock=lambda: RETRIEVED_AT,
            service_area_contains=lambda _longitude, _latitude: True,
            validator_jar_path=tmp_path / "not-reached.jar",
            opener=lambda _request: FakeResponse(
                content, last_modified="Wed, 22 Jul 2026 00:06:18 GMT"
            ),
            sleeper=lambda _seconds: None,
        )


def test_fetch_requires_source_last_modified_header(tmp_path: Path) -> None:
    with pytest.raises(HttpFetchError, match="Last-Modified"):
        fetch_and_preserve_gtfs(
            tmp_path,
            clock=lambda: RETRIEVED_AT,
            service_area_contains=lambda _longitude, _latitude: True,
            validator_jar_path=tmp_path / "not-reached.jar",
            opener=lambda _request: FakeResponse(archive_bytes()),
            sleeper=lambda _seconds: None,
        )


@pytest.mark.parametrize(
    ("member_name", "column", "message"),
    [
        ("agency.txt", "agency_timezone", "agency_timezone|required.*column"),
        ("routes.txt", "route_id", "route_id|required.*column"),
        ("trips.txt", "service_id", "service_id|required.*column"),
        ("stops.txt", "stop_lon", "stop_lon|required.*column"),
        ("stop_times.txt", "departure_time", "departure_time|required.*column"),
    ],
)
def test_rejects_missing_required_columns(member_name: str, column: str, message: str) -> None:
    lines = (FIXTURE_ROOT / member_name).read_text().splitlines()
    header = lines[0].split(",")
    removed_index = header.index(column)
    content = "\n".join(
        ",".join(value for index, value in enumerate(line.split(",")) if index != removed_index)
        for line in lines
    ).encode()

    with pytest.raises(GtfsSourceError, match=message):
        parse_fixture(archive_bytes(replacements={member_name: content}))


@pytest.mark.parametrize(
    ("member_name", "old", "new", "message"),
    [
        ("routes.txt", "R2,MCTS", "R1,MCTS", "duplicate.*route_id|route_id.*duplicate"),
        ("trips.txt", "R2,REMOVED", "MISSING,REMOVED", "route_id|foreign key"),
        ("stop_times.txt", ",S2,1", ",MISSING,1", "stop_id|foreign key"),
        ("stop_times.txt", "T3,10:00", "MISSING,10:00", "trip_id|foreign key"),
    ],
)
def test_rejects_duplicate_ids_and_broken_foreign_keys(
    member_name: str, old: str, new: str, message: str
) -> None:
    changed = changed_member(member_name, old, new)

    with pytest.raises(GtfsSourceError, match=message):
        normalize_gtfs(parse_fixture(archive_bytes(replacements={member_name: changed})))


def test_rejects_stops_without_stop_time_coverage() -> None:
    stops = (FIXTURE_ROOT / "stops.txt").read_bytes() + (
        b"UNUSED,Synthetic Unused Stop,43.0600,-87.9400\n"
    )

    with pytest.raises(GtfsSourceError, match="stop.*no stop_times|unused.*stop"):
        normalize_gtfs(parse_fixture(archive_bytes(replacements={"stops.txt": stops})))


def test_rejects_frequencies_as_unsupported_exact_trip_expansion() -> None:
    frequencies = (
        b"trip_id,start_time,end_time,headway_secs,exact_times\nT1,10:00:00,14:00:00,600,0\n"
    )

    with pytest.raises(GtfsSourceError, match="frequencies.*unsupported|exact.*trip"):
        parse_fixture(
            archive_bytes(
                replacements={"frequencies.txt": frequencies},
                member_names=(*GTFS_MEMBERS, "frequencies.txt"),
            )
        )


def test_validates_coordinate_ranges_and_injected_service_area_predicate() -> None:
    invalid_latitude = changed_member("stops.txt", "43.0400", "91.0000")
    with pytest.raises(GtfsSourceError, match="latitude|coordinate"):
        parse_fixture(archive_bytes(replacements={"stops.txt": invalid_latitude}))

    observed: list[tuple[Decimal, Decimal]] = []

    def service_area_contains(longitude: Decimal, latitude: Decimal) -> bool:
        observed.append((longitude, latitude))
        return longitude > Decimal("-88")

    with pytest.raises(GtfsSourceError, match="service area|Milwaukee"):
        parse_fixture(service_area_contains=service_area_contains)
    assert observed
    assert observed[0][0] < 0


def test_parses_valid_gtfs_times_beyond_24_hours_and_rejects_invalid_time() -> None:
    feed = normalized_fixture()
    after_midnight = next(value for value in feed.stop_times if value.trip_id == "T5")

    assert after_midnight.departure_seconds == 25 * 60 * 60

    invalid_time = changed_member("stop_times.txt", "25:00:00", "24:60:00")
    with pytest.raises(GtfsSourceError, match="time|minute"):
        normalize_gtfs(parse_fixture(archive_bytes(replacements={"stop_times.txt": invalid_time})))


def test_selects_first_complete_week_in_agency_timezone_and_resolves_exceptions() -> None:
    feed = normalized_fixture()
    dates = select_analysis_dates(feed, retrieved_at=RETRIEVED_AT)

    # 2026-09-01 01:00 UTC is still Monday 2026-08-31 in America/Chicago.
    assert dates.week_start == date(2026, 8, 31)
    assert dates.tuesday == date(2026, 9, 1)
    assert dates.saturday == date(2026, 9, 5)
    assert dates.feed_valid_from == date(2026, 8, 31)
    assert dates.feed_valid_through == date(2026, 9, 6)

    summary = summarize_scheduled_service(
        feed,
        reachable_stop_ids=("S1", "S2"),
        analysis_dates=dates,
    )
    assert summary.tuesday_departures == 2
    # SAT is active, EXTRA is added, and REMOVED is removed by calendar_dates.txt.
    assert summary.saturday_departures == 1


def test_explicit_feed_info_dates_constrain_calendar_coverage() -> None:
    narrowed = changed_member("feed_info.txt", "20260831,20260906", "20260901,20260905")

    feed = normalized_fixture(archive_bytes(replacements={"feed_info.txt": narrowed}))

    assert feed.feed_valid_from == date(2026, 9, 1)
    assert feed.feed_valid_through == date(2026, 9, 5)


def test_service_window_is_start_inclusive_end_exclusive_and_deduplicates_trip() -> None:
    feed = normalized_fixture()
    dates = select_analysis_dates(feed, retrieved_at=RETRIEVED_AT)

    summary = summarize_scheduled_service(
        feed,
        reachable_stop_ids=("S1", "S2"),
        analysis_dates=dates,
    )

    # T1 appears at two reachable stops and counts once. T4 at exactly 14:00 is excluded.
    assert summary.tuesday_departures == 2
    assert summary.saturday_departures == 1
    assert summary.scheduled_service_intensity == Decimal("0.25")
    assert summary.quality_status == "verified"
    assert summary.quality_reason is None


def test_no_reachable_stop_is_observed_zero_but_uncovered_date_is_missing() -> None:
    feed = normalized_fixture()
    dates = select_analysis_dates(feed, retrieved_at=RETRIEVED_AT)

    observed_zero = summarize_scheduled_service(
        feed,
        reachable_stop_ids=(),
        analysis_dates=dates,
    )
    assert observed_zero.tuesday_departures == 0
    assert observed_zero.saturday_departures == 0
    assert observed_zero.scheduled_service_intensity == Decimal("0")
    assert observed_zero.quality_status == "verified"

    uncovered = summarize_scheduled_service(
        feed,
        reachable_stop_ids=("S1",),
        analysis_dates=replace(dates, saturday=date(2026, 9, 12)),
    )
    assert uncovered.tuesday_departures is None
    assert uncovered.saturday_departures is None
    assert uncovered.scheduled_service_intensity is None
    assert uncovered.quality_status == "missing"
    assert uncovered.quality_reason == "analysis_date_not_covered"


def test_fails_when_no_complete_service_week_exists_after_retrieval() -> None:
    feed = normalized_fixture()

    with pytest.raises(GtfsSourceError, match="complete.*week|service.*week"):
        select_analysis_dates(
            feed,
            retrieved_at=datetime(2026, 9, 8, 12, tzinfo=UTC),
        )


def test_missing_trip_shapes_are_an_explicit_nonfatal_quality_state() -> None:
    feed = normalized_fixture()

    assert feed.shape_quality_status == "partial_missing"
    assert feed.missing_shape_trip_ids == ("T2",)


def test_normalization_is_deterministic_across_archive_member_and_row_order() -> None:
    canonical = normalized_fixture()
    reversed_routes = b"\n".join(
        reversed((FIXTURE_ROOT / "routes.txt").read_bytes().splitlines()[1:])
    )
    header = (FIXTURE_ROOT / "routes.txt").read_bytes().splitlines()[0]
    reordered = archive_bytes(
        replacements={"routes.txt": header + b"\n" + reversed_routes + b"\n"},
        member_names=tuple(reversed(GTFS_MEMBERS)),
    )

    assert normalize_gtfs(parse_fixture(reordered)) == canonical


def test_fetches_once_and_preserves_exact_source_bytes_and_attribution(tmp_path: Path) -> None:
    content = archive_bytes()
    calls: list[str] = []
    jar_content = b"synthetic validator jar"
    jar_path = tmp_path / "gtfs-validator.jar"
    jar_path.write_bytes(jar_content)

    def opener(request: object) -> FakeResponse:
        calls.append(request.full_url)  # type: ignore[attr-defined]
        return FakeResponse(content, last_modified="Wed, 22 Jul 2026 00:06:18 GMT")

    def validator_runner(command: tuple[str, ...]) -> subprocess.CompletedProcess[bytes]:
        output_dir = Path(command[command.index("-o") + 1])
        output_dir.mkdir(parents=True)
        (output_dir / "report.json").write_text(json.dumps(validator_report(errors=0, warnings=1)))
        return subprocess.CompletedProcess(command, 0)

    fetched = fetch_and_preserve_gtfs(
        tmp_path,
        clock=lambda: RETRIEVED_AT,
        opener=opener,
        sleeper=lambda _seconds: None,
        service_area_contains=lambda _longitude, _latitude: True,
        validator_jar_path=jar_path,
        validator_sha256=hashlib.sha256(jar_content).hexdigest(),
        validator_runner=validator_runner,
    )

    assert calls == [MCTS_GTFS_SOURCE_URL]
    assert fetched.content == content
    assert fetched.snapshot.raw_path.read_bytes() == content
    assert fetched.snapshot.manifest.checksum_sha256 == hashlib.sha256(content).hexdigest()
    assert fetched.snapshot.manifest.dataset_version == "synthetic-v1"
    assert fetched.validation.error_count == 0
    assert fetched.validation.warning_count == 1
    assert fetched.snapshot.manifest.request_metadata == {
        "agency_timezone": "America/Chicago",
        "analysis_saturday": "2026-09-05",
        "analysis_tuesday": "2026-09-01",
        "analysis_week_start": "2026-08-31",
        "feed_valid_from": "2026-08-31",
        "feed_valid_through": "2026-09-06",
        "not_sponsored_or_operated_by_mts_mcts": True,
        "source_last_modified": "2026-07-22T00:06:18Z",
        "static_schedule_only": True,
        "terms_url": MCTS_DEVELOPER_TERMS_URL,
    }


def validator_report(*, errors: int, warnings: int) -> dict[str, object]:
    notices: list[dict[str, object]] = []
    if errors:
        notices.append(
            {"code": "missing_required_file", "severity": "ERROR", "totalNotices": errors}
        )
    if warnings:
        notices.append({"code": "missing_shape", "severity": "WARNING", "totalNotices": warnings})
    return {
        "inputFile": "/private/tmp/source/google_transit.zip",
        "notices": notices,
        "summary": {"errors": errors, "warnings": warnings},
    }


def test_validator_verifies_pinned_jar_checksum_and_retains_sanitized_warnings(
    tmp_path: Path,
) -> None:
    archive_path = tmp_path / "snapshot.zip"
    archive_path.write_bytes(archive_bytes())
    jar_path = tmp_path / "gtfs-validator.jar"
    jar_content = b"synthetic validator jar"
    jar_path.write_bytes(jar_content)
    commands: list[tuple[str, ...]] = []

    def runner(command: tuple[str, ...]) -> subprocess.CompletedProcess[bytes]:
        commands.append(command)
        output_dir = Path(command[command.index("-o") + 1])
        output_dir.mkdir(parents=True)
        (output_dir / "report.json").write_text(json.dumps(validator_report(errors=0, warnings=1)))
        return subprocess.CompletedProcess(command, 0)

    result = validate_gtfs_with_mobilitydata(
        archive_path,
        validator_jar_path=jar_path,
        validator_sha256=hashlib.sha256(jar_content).hexdigest(),
        report_dir=tmp_path / "reports",
        runner=runner,
    )

    assert commands == [
        (
            "java",
            "-jar",
            str(jar_path),
            "-i",
            str(archive_path),
            "-o",
            str(
                tmp_path
                / "reports"
                / "validator-output"
                / hashlib.sha256(archive_path.read_bytes()).hexdigest()
            ),
        )
    ]
    assert result.error_count == 0
    assert result.warning_count == 1
    retained = json.loads(result.report_path.read_bytes())
    assert "inputFile" not in retained
    assert retained["notices"] == [
        {"code": "missing_shape", "severity": "WARNING", "totalNotices": 1}
    ]
    assert retained["snapshot_sha256"] == hashlib.sha256(archive_path.read_bytes()).hexdigest()


def test_validator_rejects_checksum_mismatch_and_error_notices(tmp_path: Path) -> None:
    archive_path = tmp_path / "snapshot.zip"
    archive_path.write_bytes(archive_bytes())
    jar_path = tmp_path / "gtfs-validator.jar"
    jar_path.write_bytes(b"wrong jar")
    called = False

    def must_not_run(_command: tuple[str, ...]) -> None:
        nonlocal called
        called = True

    with pytest.raises(GtfsSourceError, match="checksum"):
        validate_gtfs_with_mobilitydata(
            archive_path,
            validator_jar_path=jar_path,
            validator_sha256=MOBILITYDATA_VALIDATOR_SHA256,
            report_dir=tmp_path / "reports-checksum",
            runner=must_not_run,
        )
    assert called is False

    expected_hash = hashlib.sha256(jar_path.read_bytes()).hexdigest()

    def error_runner(command: tuple[str, ...]) -> subprocess.CompletedProcess[bytes]:
        output_dir = Path(command[command.index("-o") + 1])
        output_dir.mkdir(parents=True)
        (output_dir / "report.json").write_text(json.dumps(validator_report(errors=1, warnings=0)))
        return subprocess.CompletedProcess(command, 0)

    with pytest.raises(GtfsSourceError, match="validator.*error|error.*validator"):
        validate_gtfs_with_mobilitydata(
            archive_path,
            validator_jar_path=jar_path,
            validator_sha256=expected_hash,
            report_dir=tmp_path / "reports-errors",
            runner=error_runner,
        )


def test_validator_requires_explicit_zero_process_exit(tmp_path: Path) -> None:
    archive_path = tmp_path / "snapshot.zip"
    archive_path.write_bytes(archive_bytes())
    jar_path = tmp_path / "gtfs-validator.jar"
    jar_path.write_bytes(b"synthetic jar")

    def ambiguous_runner(command: tuple[str, ...]) -> None:
        output_dir = Path(command[command.index("-o") + 1])
        output_dir.mkdir(parents=True)
        (output_dir / "report.json").write_text(json.dumps(validator_report(errors=0, warnings=0)))

    with pytest.raises(GtfsSourceError, match="exited unsuccessfully"):
        validate_gtfs_with_mobilitydata(
            archive_path,
            validator_jar_path=jar_path,
            validator_sha256=hashlib.sha256(jar_path.read_bytes()).hexdigest(),
            report_dir=tmp_path / "reports-ambiguous-exit",
            runner=ambiguous_runner,
        )


def test_validator_rejects_nonempty_system_error_notices(tmp_path: Path) -> None:
    archive_path = tmp_path / "snapshot.zip"
    archive_path.write_bytes(archive_bytes())
    jar_path = tmp_path / "gtfs-validator.jar"
    jar_path.write_bytes(b"synthetic jar")
    expected_hash = hashlib.sha256(jar_path.read_bytes()).hexdigest()

    def system_error_runner(command: tuple[str, ...]) -> subprocess.CompletedProcess[bytes]:
        output_dir = Path(command[command.index("-o") + 1])
        output_dir.mkdir(parents=True)
        (output_dir / "report.json").write_text(json.dumps(validator_report(errors=0, warnings=0)))
        (output_dir / "system_errors.json").write_text(
            json.dumps(
                {
                    "notices": [
                        {
                            "code": "validator_runtime_failure",
                            "severity": "ERROR",
                            "totalNotices": 1,
                        }
                    ]
                }
            )
        )
        return subprocess.CompletedProcess(command, 0)

    with pytest.raises(GtfsSourceError, match="system.*error|validator.*error"):
        validate_gtfs_with_mobilitydata(
            archive_path,
            validator_jar_path=jar_path,
            validator_sha256=expected_hash,
            report_dir=tmp_path / "reports-system-errors",
            runner=system_error_runner,
        )
