"""Acquire and normalize the approved USDA SRAM driving-distance benchmark."""

from __future__ import annotations

import csv
import hashlib
import io
import re
import zipfile
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import cast

from pipelines.common.artifacts import StoredSnapshot, preserve_snapshot
from pipelines.common.http import Opener, Sleeper, fetch_bytes
from pipelines.food_equity.errors import SourceValidationError
from pipelines.food_equity.registry import load_registry

SRAM_SOURCE_URL = (
    "https://www.ers.usda.gov/media/29395/"
    "2025-snap-authorized-retailer-access-map-sram-data.zip?v=81233"
)
SRAM_ARCHIVE_MEMBERS = (
    "SRAM Driving Distance Data.csv",
    "SRAM General Tract Characteristics Data.csv",
    "SRAM Straight Line Distance Data.csv",
    "SRAM Variable Lookup Driving Distance.csv",
    "SRAM Variable Lookup General Tract Characteristics.csv",
    "SRAM Variable Lookup Straight Line Distance.csv",
    "SRAM Read Me.txt",
)
DRIVING_DATA_MEMBER = "SRAM Driving Distance Data.csv"
DRIVING_LOOKUP_MEMBER = "SRAM Variable Lookup Driving Distance.csv"
README_MEMBER = "SRAM Read Me.txt"
REQUIRED_DRIVING_COLUMNS = frozenset(
    {
        "CensusTract20",
        "State",
        "County20",
        "County24",
        "DD_SRAM_lapop1",
        "DD_SRAM_lapop1share",
    }
)
APPROVED_DRIVING_HEADER_SHA256 = "8034b4d6aa2fe69ca4ddbe3d91649f6cf5f249a728ea13a70a2810596039fc64"
APPROVED_RELEASE = "July 2026"
APPROVED_METHOD_PHRASE = "driving (network-based) distance"
SOURCE_ENCODING = "cp1252"
CANONICAL_TRACT_COUNT = 302
WISCONSIN_STATE_FIPS = "55"
MILWAUKEE_COUNTY_FIPS = "079"
MILWAUKEE_GEOID_PREFIX = f"{WISCONSIN_STATE_FIPS}{MILWAUKEE_COUNTY_FIPS}"
MAX_UNCOMPRESSED_ARCHIVE_BYTES = 100_000_000
GEOID_PATTERN = re.compile(r"^[0-9]{11}$")


class SramSourceError(SourceValidationError):
    """Raised when SRAM bytes or rows violate the approved source contract."""


@dataclass(frozen=True, slots=True)
class SramRawRow:
    """Only the approved fields retained from one statewide SRAM row."""

    geoid: str
    state: str
    county_2020: str
    county_2024: str
    population_beyond_one_mile: str
    population_share_beyond_one_mile: str


@dataclass(frozen=True, slots=True)
class ParsedSramArchive:
    """Validated source metadata and bounded fields from the driving table."""

    rows: tuple[SramRawRow, ...]
    header_sha256: str
    release: str
    source_method: str


@dataclass(frozen=True, slots=True)
class SramRecord:
    """One canonical tract observation with explicit source quality."""

    geoid: str
    population_beyond_one_mile: int | None
    population_share_beyond_one_mile: Decimal | None
    quality_status: str
    quality_reason: str | None
    metric_slug: str = "sram_snap_low_access_share_1mi"
    unit: str = "percent"
    source_method: str = "driving_network_based"


@dataclass(frozen=True, slots=True)
class FetchedSram:
    """Exact fetched archive, its parsed contract, and immutable snapshot."""

    content: bytes
    archive: ParsedSramArchive
    snapshot: StoredSnapshot


def _decode_member(content: bytes, _member: str) -> str:
    return content.decode(SOURCE_ENCODING)


def _validated_zip(content: bytes) -> zipfile.ZipFile:
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as error:
        raise SramSourceError("SRAM response is not a valid ZIP archive") from error
    infos = archive.infolist()
    names = tuple(info.filename for info in infos)
    if names != SRAM_ARCHIVE_MEMBERS or len(names) != len(set(names)):
        archive.close()
        raise SramSourceError("SRAM archive members do not match the approved release")
    if any(info.is_dir() or info.flag_bits & 0x1 for info in infos):
        archive.close()
        raise SramSourceError("SRAM archive contains a directory or encrypted member")
    if sum(info.file_size for info in infos) > MAX_UNCOMPRESSED_ARCHIVE_BYTES:
        archive.close()
        raise SramSourceError("SRAM archive exceeds the approved uncompressed size bound")
    return archive


def _read_csv(text: str, member: str) -> tuple[tuple[str, ...], list[dict[str, str]]]:
    reader = csv.DictReader(io.StringIO(text, newline=""))
    if reader.fieldnames is None or not reader.fieldnames:
        raise SramSourceError(f"{member} has no header")
    headers = tuple(reader.fieldnames)
    if len(headers) != len(set(headers)):
        raise SramSourceError(f"{member} contains duplicate headers")
    rows: list[dict[str, str]] = []
    for position, row in enumerate(reader, start=2):
        if None in row or any(value is None for value in row.values()):
            raise SramSourceError(f"{member} row {position} has the wrong width")
        rows.append(cast(dict[str, str], row))
    return headers, rows


def _validate_lookup(content: bytes) -> None:
    headers, rows = _read_csv(_decode_member(content, DRIVING_LOOKUP_MEMBER), DRIVING_LOOKUP_MEMBER)
    if not {"Field", "LongName", "Description"}.issubset(headers):
        raise SramSourceError("SRAM driving lookup is missing required columns")
    by_field = {row["Field"]: row for row in rows}
    for field in ("DD_SRAM_lapop1", "DD_SRAM_lapop1share"):
        definition = by_field.get(field)
        if definition is None:
            raise SramSourceError(f"SRAM driving lookup is missing {field}")
        method_text = f"{definition['LongName']} {definition['Description']}".casefold()
        if "driving distance" not in method_text or APPROVED_METHOD_PHRASE not in method_text:
            raise SramSourceError(f"SRAM driving method changed for {field}")


def _validate_readme(content: bytes) -> None:
    readme = _decode_member(content, README_MEMBER)
    if f"Initial release: {APPROVED_RELEASE}" not in readme:
        raise SramSourceError("SRAM release metadata does not match July 2026")
    if "intentionally left blank when data are unavailable or not applicable" not in readme:
        raise SramSourceError("SRAM readme no longer documents blank source values")


def read_sram_archive(
    content: bytes,
    *,
    expected_header_sha256: str = APPROVED_DRIVING_HEADER_SHA256,
) -> ParsedSramArchive:
    """Validate an exact release archive and retain only approved driving fields."""

    with _validated_zip(content) as archive:
        try:
            driving_content = archive.read(DRIVING_DATA_MEMBER)
            lookup_content = archive.read(DRIVING_LOOKUP_MEMBER)
            readme_content = archive.read(README_MEMBER)
        except (KeyError, RuntimeError, zipfile.BadZipFile) as error:
            raise SramSourceError("SRAM archive cannot read an approved member") from error

    first_line = driving_content.splitlines(keepends=True)
    if not first_line:
        raise SramSourceError("SRAM driving table is empty")
    header_sha256 = hashlib.sha256(first_line[0]).hexdigest()
    if header_sha256 != expected_header_sha256:
        raise SramSourceError("SRAM driving header fingerprint does not match the approved schema")

    headers, rows = _read_csv(
        _decode_member(driving_content, DRIVING_DATA_MEMBER), DRIVING_DATA_MEMBER
    )
    missing = sorted(REQUIRED_DRIVING_COLUMNS - set(headers))
    if missing:
        raise SramSourceError(f"SRAM driving table missing required columns: {missing}")
    _validate_lookup(lookup_content)
    _validate_readme(readme_content)

    retained = tuple(
        SramRawRow(
            geoid=row["CensusTract20"].strip(),
            state=row["State"].strip(),
            county_2020=row["County20"].strip(),
            county_2024=row["County24"].strip(),
            population_beyond_one_mile=row["DD_SRAM_lapop1"].strip(),
            population_share_beyond_one_mile=row["DD_SRAM_lapop1share"].strip(),
        )
        for row in rows
    )
    return ParsedSramArchive(
        rows=retained,
        header_sha256=header_sha256,
        release=APPROVED_RELEASE,
        source_method="driving_network_based",
    )


def _validate_expected_geoids(
    expected_geoids: Sequence[str], expected_count: int
) -> tuple[str, ...]:
    geoids = tuple(expected_geoids)
    if len(geoids) != expected_count:
        raise SramSourceError(
            f"canonical tract universe must contain exactly {expected_count} GEOIDs"
        )
    if len(geoids) != len(set(geoids)):
        raise SramSourceError("canonical tract universe contains duplicate canonical GEOIDs")
    if any(
        GEOID_PATTERN.fullmatch(geoid) is None or not geoid.startswith(MILWAUKEE_GEOID_PREFIX)
        for geoid in geoids
    ):
        raise SramSourceError("canonical tract GEOIDs must be 11 digits in Milwaukee County")
    return tuple(sorted(geoids))


def _parse_population(raw: str, geoid: str) -> int | None:
    if not raw:
        return None
    try:
        value = Decimal(raw)
    except InvalidOperation as error:
        raise SramSourceError(f"SRAM population count for {geoid} is not numeric") from error
    if not value.is_finite() or value < 0 or value != value.to_integral_value():
        raise SramSourceError(f"SRAM population count for {geoid} is outside its valid range")
    return int(value)


def _parse_share(raw: str, geoid: str) -> Decimal | None:
    if not raw:
        return None
    try:
        value = Decimal(raw)
    except InvalidOperation as error:
        raise SramSourceError(f"SRAM population share for {geoid} is not numeric") from error
    if not value.is_finite() or value < 0 or value > 100:
        raise SramSourceError(f"SRAM population share for {geoid} is outside its valid range")
    return value


def normalize_sram(
    archive: ParsedSramArchive,
    *,
    expected_geoids: Sequence[str],
    expected_count: int = CANONICAL_TRACT_COUNT,
) -> tuple[SramRecord, ...]:
    """Reconcile SRAM to the canonical tract universe without filling missing data."""

    canonical_geoids = _validate_expected_geoids(expected_geoids, expected_count)
    canonical_set = set(canonical_geoids)
    source_rows: dict[str, SramRawRow] = {}
    duplicates: set[str] = set()
    for row in archive.rows:
        if GEOID_PATTERN.fullmatch(row.geoid) is None:
            raise SramSourceError(
                f"SRAM CensusTract20 must contain exactly 11 digits: {row.geoid!r}"
            )
        is_milwaukee = row.geoid.startswith(MILWAUKEE_GEOID_PREFIX)
        named_milwaukee = row.state == "Wisconsin" and row.county_2020 == "Milwaukee County"
        if is_milwaukee != named_milwaukee:
            raise SramSourceError(f"SRAM geography labels do not match GEOID {row.geoid}")
        if not is_milwaukee:
            continue
        if row.geoid in source_rows:
            duplicates.add(row.geoid)
        else:
            source_rows[row.geoid] = row
    if duplicates:
        raise SramSourceError(f"SRAM contains duplicate Milwaukee GEOIDs: {sorted(duplicates)}")
    extra = sorted(set(source_rows) - canonical_set)
    if extra:
        raise SramSourceError(f"SRAM contains extra Milwaukee GEOIDs: {extra}")

    records: list[SramRecord] = []
    for geoid in canonical_geoids:
        source_row = source_rows.get(geoid)
        if source_row is None:
            records.append(
                SramRecord(
                    geoid=geoid,
                    population_beyond_one_mile=None,
                    population_share_beyond_one_mile=None,
                    quality_status="missing",
                    quality_reason="source_row_missing",
                )
            )
            continue
        population = _parse_population(source_row.population_beyond_one_mile, geoid)
        share = _parse_share(source_row.population_share_beyond_one_mile, geoid)
        has_blank = population is None or share is None
        records.append(
            SramRecord(
                geoid=geoid,
                population_beyond_one_mile=population,
                population_share_beyond_one_mile=share,
                quality_status="missing" if has_blank else "verified",
                quality_reason="source_blank" if has_blank else None,
            )
        )
    return tuple(records)


def fetch_and_preserve_sram(
    root: Path,
    *,
    clock: Callable[[], datetime],
    opener: Opener | None = None,
    sleeper: Sleeper | None = None,
    expected_header_sha256: str = APPROVED_DRIVING_HEADER_SHA256,
) -> FetchedSram:
    """Fetch the approved archive once, validate it, and preserve exact bytes."""

    parsed: ParsedSramArchive | None = None

    def validate(content: bytes) -> None:
        nonlocal parsed
        parsed = read_sram_archive(content, expected_header_sha256=expected_header_sha256)

    if opener is None and sleeper is None:
        content = fetch_bytes(SRAM_SOURCE_URL, validator=validate)
    elif opener is None:
        content = fetch_bytes(SRAM_SOURCE_URL, sleeper=cast(Sleeper, sleeper), validator=validate)
    elif sleeper is None:
        content = fetch_bytes(SRAM_SOURCE_URL, opener=opener, validator=validate)
    else:
        content = fetch_bytes(
            SRAM_SOURCE_URL,
            opener=opener,
            sleeper=sleeper,
            validator=validate,
        )
    if parsed is None:
        raise AssertionError("SRAM fetch validator did not produce a parsed archive")

    registry = load_registry()
    source = next(item for item in registry.sources if item.key == "sram")
    snapshot = preserve_snapshot(
        root=root,
        pipeline_slug="food-equity",
        source_key="sram",
        source_url=SRAM_SOURCE_URL,
        dataset_version=source.vintage,
        content=content,
        schema={
            "archive_members": list(SRAM_ARCHIVE_MEMBERS),
            "driving_header_sha256": parsed.header_sha256,
            "required_columns": sorted(REQUIRED_DRIVING_COLUMNS),
            "source_method": parsed.source_method,
        },
        row_or_feature_count=len(parsed.rows),
        license=source.license_notes,
        methodology_reference=registry.methodology_version,
        request_metadata={
            "archive_member": DRIVING_DATA_MEMBER,
            "release": parsed.release,
        },
        clock=clock,
    )
    return FetchedSram(content=content, archive=parsed, snapshot=snapshot)


__all__ = [
    "APPROVED_DRIVING_HEADER_SHA256",
    "DRIVING_DATA_MEMBER",
    "DRIVING_LOOKUP_MEMBER",
    "FetchedSram",
    "ParsedSramArchive",
    "REQUIRED_DRIVING_COLUMNS",
    "SRAM_ARCHIVE_MEMBERS",
    "SRAM_SOURCE_URL",
    "SOURCE_ENCODING",
    "SramRecord",
    "SramSourceError",
    "fetch_and_preserve_sram",
    "normalize_sram",
    "read_sram_archive",
]
