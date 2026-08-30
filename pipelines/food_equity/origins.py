"""Acquire and normalize the approved Census tract access origins."""

from __future__ import annotations

import csv
import hashlib
import io
import math
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import cast

from pyproj import Transformer

from pipelines.common.artifacts import StoredSnapshot, preserve_snapshot
from pipelines.common.http import Opener, Sleeper, fetch_bytes
from pipelines.food_equity.accessibility import TractOrigin
from pipelines.food_equity.errors import SourceValidationError
from pipelines.food_equity.models import MethodologyRegistry
from pipelines.food_equity.registry import load_registry

TRACT_ORIGIN_SOURCE_URL = (
    "https://www2.census.gov/geo/docs/reference/cenpop2020/tract/CenPop2020_Mean_TR55.txt"
)
TRACT_ORIGIN_HEADER = (
    "STATEFP",
    "COUNTYFP",
    "TRACTCE",
    "POPULATION",
    "LATITUDE",
    "LONGITUDE",
)
APPROVED_SOURCE_SHA256 = "59d8e6e0d6c84267cd845da984e3623e68eae61f3418cc94488865c5f37d3e2c"
APPROVED_HEADER_SHA256 = "44c4a1b5da7a516d5497ce7c16d13d95000f7630979b3b933c0c2c3f52f1cafb"
APPROVED_SOURCE_ROW_COUNT = 1_542
SOURCE_ENCODING = "utf-8-sig"
SOURCE_KEY = "tract_origins"
STATE_FIPS = "55"
COUNTY_FIPS = "079"
MILWAUKEE_GEOID_PREFIX = f"{STATE_FIPS}{COUNTY_FIPS}"
CANONICAL_TRACT_COUNT = 302
PROJECTED_CRS = "EPSG:3071"
MAX_SOURCE_BYTES = 1_000_000
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
GEOID_PATTERN = re.compile(r"[0-9]{11}")
_PROJECTOR = Transformer.from_crs("EPSG:4326", PROJECTED_CRS, always_xy=True)


class TractOriginSourceError(SourceValidationError):
    """Raised when the Census tract-origin artifact violates its contract."""


@dataclass(frozen=True, slots=True)
class CensusTractOrigin:
    """One typed source row from the statewide mean-center artifact."""

    state_fips: str
    county_fips: str
    tract_code: str
    population: int
    latitude: Decimal
    longitude: Decimal

    @property
    def geoid(self) -> str:
        return f"{self.state_fips}{self.county_fips}{self.tract_code}"


@dataclass(frozen=True, slots=True)
class ParsedTractOrigins:
    """Validated statewide source rows and their exact source fingerprints."""

    rows: tuple[CensusTractOrigin, ...]
    source_sha256: str
    header_sha256: str


@dataclass(frozen=True, slots=True)
class NormalizedTractOrigin:
    """One canonical Milwaukee access origin in the approved projected CRS."""

    geoid: str
    population: int
    latitude: Decimal
    longitude: Decimal
    x: Decimal
    y: Decimal
    source_snapshot_sha256: str
    projected_crs: str = PROJECTED_CRS

    def as_access_origin(self) -> TractOrigin:
        """Adapt the provenance-rich record to the routing input boundary."""

        return TractOrigin(
            geoid=self.geoid,
            x=self.x,
            y=self.y,
            source_snapshot_sha256=self.source_snapshot_sha256,
        )


@dataclass(frozen=True, slots=True)
class FetchedTractOrigins:
    """Exact Census bytes, parsed rows, and immutable source manifest."""

    content: bytes
    origins: ParsedTractOrigins
    snapshot: StoredSnapshot


def _validated_sha256(value: str, label: str) -> str:
    if SHA256_PATTERN.fullmatch(value) is None:
        raise TractOriginSourceError(f"{label} must be a lowercase SHA-256")
    return value


def _parse_fips(raw: str, *, width: int, label: str, row_number: int) -> str:
    value = raw.strip()
    if len(value) != width or not value.isdigit():
        raise TractOriginSourceError(f"tract-origin row {row_number} has invalid {label}")
    return value


def _parse_population(raw: str, row_number: int) -> int:
    value = raw.strip()
    if not value or not value.isdigit():
        raise TractOriginSourceError(f"tract-origin row {row_number} has invalid population")
    return int(value)


def _parse_coordinate(
    raw: str, *, label: str, minimum: Decimal, maximum: Decimal, row_number: int
) -> Decimal:
    try:
        value = Decimal(raw.strip())
    except InvalidOperation as error:
        raise TractOriginSourceError(
            f"tract-origin row {row_number} has invalid {label}"
        ) from error
    if not value.is_finite() or value < minimum or value > maximum:
        raise TractOriginSourceError(f"tract-origin row {row_number} has invalid {label}")
    return value


def read_tract_origins(
    content: bytes,
    *,
    expected_sha256: str | None = None,
    expected_header_sha256: str = APPROVED_HEADER_SHA256,
    expected_row_count: int | None = None,
) -> ParsedTractOrigins:
    """Parse the exact six-column Census artifact without inferring source fields."""

    if not content.startswith(b"\xef\xbb\xbf"):
        raise TractOriginSourceError("tract-origin artifact must use the approved UTF-8 BOM")
    source_sha256 = hashlib.sha256(content).hexdigest()
    if expected_sha256 is not None:
        if source_sha256 != _validated_sha256(expected_sha256, "expected source SHA-256"):
            raise TractOriginSourceError("tract-origin source SHA-256 does not match")
    first_line = content.splitlines(keepends=True)
    if not first_line:
        raise TractOriginSourceError("tract-origin artifact is empty")
    header_sha256 = hashlib.sha256(first_line[0]).hexdigest()
    if header_sha256 != _validated_sha256(expected_header_sha256, "expected header SHA-256"):
        raise TractOriginSourceError("tract-origin header fingerprint does not match")
    try:
        text = content.decode(SOURCE_ENCODING)
    except UnicodeDecodeError as error:
        raise TractOriginSourceError("tract-origin artifact is not valid UTF-8") from error
    reader = csv.DictReader(io.StringIO(text, newline=""))
    if tuple(reader.fieldnames or ()) != TRACT_ORIGIN_HEADER:
        raise TractOriginSourceError("tract-origin header or column order changed")

    rows: list[CensusTractOrigin] = []
    for row_number, raw in enumerate(reader, start=2):
        if None in raw or any(value is None for value in raw.values()):
            raise TractOriginSourceError(f"tract-origin row {row_number} has the wrong width")
        row = cast(dict[str, str], raw)
        rows.append(
            CensusTractOrigin(
                state_fips=_parse_fips(
                    row["STATEFP"], width=2, label="STATEFP", row_number=row_number
                ),
                county_fips=_parse_fips(
                    row["COUNTYFP"], width=3, label="COUNTYFP", row_number=row_number
                ),
                tract_code=_parse_fips(
                    row["TRACTCE"], width=6, label="TRACTCE", row_number=row_number
                ),
                population=_parse_population(row["POPULATION"], row_number),
                latitude=_parse_coordinate(
                    row["LATITUDE"],
                    label="latitude",
                    minimum=Decimal("-90"),
                    maximum=Decimal("90"),
                    row_number=row_number,
                ),
                longitude=_parse_coordinate(
                    row["LONGITUDE"],
                    label="longitude",
                    minimum=Decimal("-180"),
                    maximum=Decimal("180"),
                    row_number=row_number,
                ),
            )
        )
    if expected_row_count is not None and len(rows) != expected_row_count:
        raise TractOriginSourceError(
            f"tract-origin artifact must contain exactly {expected_row_count} source rows"
        )
    return ParsedTractOrigins(tuple(rows), source_sha256, header_sha256)


def _canonical_geoids(expected_geoids: Sequence[str], expected_count: int) -> tuple[str, ...]:
    geoids = tuple(expected_geoids)
    if len(geoids) != expected_count:
        raise TractOriginSourceError(
            f"canonical tract universe must contain exactly {expected_count} GEOIDs"
        )
    if len(geoids) != len(set(geoids)):
        raise TractOriginSourceError("canonical tract universe contains duplicate GEOIDs")
    if any(
        GEOID_PATTERN.fullmatch(geoid) is None or not geoid.startswith(MILWAUKEE_GEOID_PREFIX)
        for geoid in geoids
    ):
        raise TractOriginSourceError("canonical tract GEOIDs must be 11 digits in Milwaukee County")
    return tuple(sorted(geoids))


def normalize_tract_origins(
    parsed: ParsedTractOrigins,
    *,
    expected_geoids: Sequence[str],
    source_snapshot_sha256: str,
    expected_count: int = CANONICAL_TRACT_COUNT,
) -> tuple[NormalizedTractOrigin, ...]:
    """Reconcile and project exactly one official origin per canonical tract."""

    canonical_geoids = _canonical_geoids(expected_geoids, expected_count)
    source_sha256 = _validated_sha256(source_snapshot_sha256, "source snapshot SHA-256")
    if source_sha256 != parsed.source_sha256:
        raise TractOriginSourceError("source snapshot SHA-256 does not match parsed origin bytes")
    selected: dict[str, CensusTractOrigin] = {}
    duplicates: set[str] = set()
    for row in parsed.rows:
        if row.state_fips != STATE_FIPS or row.county_fips != COUNTY_FIPS:
            continue
        if row.geoid in selected:
            duplicates.add(row.geoid)
        else:
            selected[row.geoid] = row
    if duplicates:
        raise TractOriginSourceError(
            f"tract-origin artifact contains duplicate Milwaukee GEOIDs: {sorted(duplicates)}"
        )
    missing = sorted(set(canonical_geoids) - set(selected))
    extra = sorted(set(selected) - set(canonical_geoids))
    if missing or extra:
        raise TractOriginSourceError(
            f"tract-origin GEOIDs do not reconcile; missing={missing!r}, extra={extra!r}"
        )

    normalized: list[NormalizedTractOrigin] = []
    for geoid in canonical_geoids:
        row = selected[geoid]
        x, y = _PROJECTOR.transform(float(row.longitude), float(row.latitude))
        if not math.isfinite(x) or not math.isfinite(y):
            raise TractOriginSourceError(f"tract-origin projection failed for {geoid}")
        normalized.append(
            NormalizedTractOrigin(
                geoid=geoid,
                population=row.population,
                latitude=row.latitude,
                longitude=row.longitude,
                x=Decimal(str(x)),
                y=Decimal(str(y)),
                source_snapshot_sha256=source_sha256,
            )
        )
    return tuple(normalized)


def access_origins(records: Sequence[NormalizedTractOrigin]) -> tuple[TractOrigin, ...]:
    """Return deterministically ordered routing inputs without dropping source identity."""

    geoids = [record.geoid for record in records]
    if len(geoids) != len(set(geoids)):
        raise TractOriginSourceError("normalized tract origins contain duplicate GEOIDs")
    return tuple(
        record.as_access_origin() for record in sorted(records, key=lambda item: item.geoid)
    )


def fetch_and_preserve_tract_origins(
    root: Path,
    *,
    clock: Callable[[], datetime],
    opener: Opener | None = None,
    sleeper: Sleeper | None = None,
    expected_sha256: str = APPROVED_SOURCE_SHA256,
    expected_header_sha256: str = APPROVED_HEADER_SHA256,
    expected_row_count: int = APPROVED_SOURCE_ROW_COUNT,
    registry: MethodologyRegistry | None = None,
) -> FetchedTractOrigins:
    """Fetch once, enforce the pinned source identity, and preserve exact bytes."""

    parsed: ParsedTractOrigins | None = None

    def validate(content: bytes) -> None:
        nonlocal parsed
        parsed = read_tract_origins(
            content,
            expected_sha256=expected_sha256,
            expected_header_sha256=expected_header_sha256,
            expected_row_count=expected_row_count,
        )

    kwargs: dict[str, object] = {"validator": validate, "max_bytes": MAX_SOURCE_BYTES}
    if opener is not None:
        kwargs["opener"] = opener
    if sleeper is not None:
        kwargs["sleeper"] = sleeper
    content = fetch_bytes(TRACT_ORIGIN_SOURCE_URL, **kwargs)  # type: ignore[arg-type]
    if parsed is None:
        raise AssertionError("tract-origin fetch validator did not parse the response")

    methodology = registry or load_registry()
    source = next(item for item in methodology.sources if item.key == SOURCE_KEY)
    snapshot = preserve_snapshot(
        root=root,
        pipeline_slug="food-equity",
        source_key=SOURCE_KEY,
        source_url=TRACT_ORIGIN_SOURCE_URL,
        dataset_version=source.vintage,
        content=content,
        schema={
            "encoding": SOURCE_ENCODING,
            "header": list(TRACT_ORIGIN_HEADER),
            "header_sha256": parsed.header_sha256,
        },
        row_or_feature_count=len(parsed.rows),
        license=source.license_notes,
        methodology_reference=methodology.methodology_version,
        request_metadata={
            "county_filter": COUNTY_FIPS,
            "header": list(TRACT_ORIGIN_HEADER),
            "state_filter": STATE_FIPS,
        },
        clock=clock,
    )
    return FetchedTractOrigins(content, parsed, snapshot)


__all__ = [
    "APPROVED_HEADER_SHA256",
    "APPROVED_SOURCE_ROW_COUNT",
    "APPROVED_SOURCE_SHA256",
    "CensusTractOrigin",
    "FetchedTractOrigins",
    "NormalizedTractOrigin",
    "ParsedTractOrigins",
    "TRACT_ORIGIN_HEADER",
    "TRACT_ORIGIN_SOURCE_URL",
    "TractOriginSourceError",
    "access_origins",
    "fetch_and_preserve_tract_origins",
    "normalize_tract_origins",
    "read_tract_origins",
]
