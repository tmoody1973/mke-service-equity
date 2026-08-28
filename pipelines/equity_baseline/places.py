"""Acquire and normalize the approved CDC PLACES health indicators."""

from __future__ import annotations

import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from types import MappingProxyType
from typing import Callable, TypeAlias, cast
from urllib.parse import urlencode

from pipelines.equity_baseline.artifacts import StoredSnapshot, preserve_snapshot
from pipelines.equity_baseline.errors import PlacesGeographyError, PlacesSourceError
from pipelines.equity_baseline.http import Opener, Sleeper, fetch_bytes
from pipelines.equity_baseline.models import MethodologyRegistry, SourceDefinition
from pipelines.equity_baseline.registry import load_registry

CDC_PLACES_DATASET_ID = "cwsq-ngmh"
CDC_PLACES_ENDPOINT = f"https://data.cdc.gov/resource/{CDC_PLACES_DATASET_ID}.json"
CDC_PLACES_MEASURE_YEAR = "2023"
MILWAUKEE_COUNTY_FIPS = "55079"
PLACES_QUERY_LIMIT = 5000
PLACES_SELECT_COLUMNS = (
    "year",
    "countyfips",
    "locationid",
    "measureid",
    "datavaluetypeid",
    "data_value",
    "low_confidence_limit",
    "high_confidence_limit",
    "data_value_footnote_symbol",
    "data_value_footnote",
)
REQUIRED_IDENTITY_FIELDS = frozenset(
    {"year", "countyfips", "locationid", "measureid", "datavaluetypeid"}
)
GEOID_PATTERN = re.compile(r"^\d{11}$")
Row: TypeAlias = Mapping[str, object]


@dataclass(frozen=True, slots=True)
class PlacesRequest:
    """Bounded Socrata query and its source-release manifest metadata."""

    url: str
    manifest_metadata: Mapping[str, str]


@dataclass(frozen=True, slots=True)
class FetchedPlaces:
    """Exact public response bytes and their immutable snapshot."""

    content: bytes
    snapshot: StoredSnapshot


@dataclass(frozen=True, slots=True)
class PlacesObservation:
    """One normalized PLACES estimate with confidence limits and quality state."""

    geoid: str
    indicator_slug: str
    value: Decimal | None
    low_confidence_limit: Decimal | None
    high_confidence_limit: Decimal | None
    quality_status: str
    quality_reason: str | None
    quality_metadata: Mapping[str, object]
    source_year: str
    source_release: str


@dataclass(frozen=True, slots=True)
class PlacesNormalizationResult:
    """Complete six-indicator output for positive-population canonical tracts."""

    observations: tuple[PlacesObservation, ...]


def _measure_mapping(registry: MethodologyRegistry) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for indicator in registry.indicators:
        if indicator.source != "places":
            continue
        measure = indicator.formula.measure_id
        if measure is None:
            raise PlacesSourceError(f"PLACES indicator {indicator.slug!r} has no measure ID")
        if indicator.formula.data_value_type_id != "CrdPrv":
            raise PlacesSourceError(
                f"PLACES indicator {indicator.slug!r} does not use crude prevalence"
            )
        mapping[measure] = indicator.slug
    if len(mapping) != 6:
        raise PlacesSourceError("registry must define exactly six unique PLACES measures")
    return mapping


def _places_source(registry: MethodologyRegistry) -> SourceDefinition:
    try:
        return next(source for source in registry.sources if source.key == "places")
    except StopIteration as error:
        raise PlacesSourceError("registry has no PLACES source definition") from error


def build_places_request(registry: MethodologyRegistry | None = None) -> PlacesRequest:
    """Build the exact bounded, deterministic Socrata query."""

    methodology = registry or load_registry()
    measures = tuple(_measure_mapping(methodology))
    quoted_measures = ",".join(f"'{measure}'" for measure in measures)
    query = {
        "$select": ",".join(PLACES_SELECT_COLUMNS),
        "$where": (
            f"countyfips='{MILWAUKEE_COUNTY_FIPS}' AND "
            f"measureid IN({quoted_measures}) AND datavaluetypeid='CrdPrv'"
        ),
        "$order": "locationid,measureid",
        "$limit": str(PLACES_QUERY_LIMIT),
    }
    source = _places_source(methodology)
    metadata = {
        "dataset_id": CDC_PLACES_DATASET_ID,
        "source_release": source.vintage,
        "measure_year": CDC_PLACES_MEASURE_YEAR,
        **query,
    }
    return PlacesRequest(
        url=f"{CDC_PLACES_ENDPOINT}?{urlencode(query)}",
        manifest_metadata=MappingProxyType(metadata),
    )


def _decode_rows(content: bytes) -> list[Row]:
    try:
        raw = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PlacesSourceError("PLACES response is not valid JSON") from error
    if not isinstance(raw, list):
        raise PlacesSourceError("PLACES response must be a JSON array")
    rows: list[Row] = []
    for position, value in enumerate(raw):
        if not isinstance(value, Mapping):
            raise PlacesSourceError(f"PLACES row {position} must be an object")
        if any(not isinstance(key, str) for key in value):
            raise PlacesSourceError(f"PLACES row {position} has a non-string field name")
        row = cast(Row, value)
        missing = sorted(REQUIRED_IDENTITY_FIELDS - set(row))
        if missing:
            raise PlacesSourceError(f"PLACES row {position} missing identity fields: {missing}")
        rows.append(row)
    return rows


def fetch_and_preserve_places(
    root: Path,
    *,
    clock: Callable[[], datetime],
    registry: MethodologyRegistry | None = None,
    opener: Opener | None = None,
    sleeper: Sleeper | None = None,
) -> FetchedPlaces:
    """Fetch the bounded PLACES query once on success and preserve exact bytes."""

    methodology = registry or load_registry()
    request = build_places_request(methodology)

    def validate(raw: bytes) -> None:
        _decode_rows(raw)

    if opener is None and sleeper is None:
        content = fetch_bytes(request.url, validator=validate)
    elif opener is None:
        content = fetch_bytes(
            request.url,
            sleeper=cast(Sleeper, sleeper),
            validator=validate,
        )
    elif sleeper is None:
        content = fetch_bytes(
            request.url,
            opener=opener,
            validator=validate,
        )
    else:
        content = fetch_bytes(
            request.url,
            opener=opener,
            sleeper=sleeper,
            validator=validate,
        )
    rows = _decode_rows(content)
    source = _places_source(methodology)
    snapshot = preserve_snapshot(
        root=root,
        source_key="places",
        source_url=request.url,
        dataset_version=source.vintage,
        content=content,
        schema={"columns": list(PLACES_SELECT_COLUMNS)},
        row_or_feature_count=len(rows),
        license=source.license_notes,
        methodology_reference=methodology.methodology_version,
        request_metadata=dict(request.manifest_metadata),
        clock=clock,
    )
    return FetchedPlaces(content, snapshot)


def _required_string(row: Row, field: str, position: int) -> str:
    value = row.get(field)
    if not isinstance(value, str) or not value:
        raise PlacesSourceError(f"PLACES row {position} has invalid {field}")
    return value


def _optional_text(row: Row, field: str) -> str | None:
    value = row.get(field)
    if value is None:
        return None
    if not isinstance(value, str):
        raise PlacesSourceError(f"PLACES {field} must be a string when present")
    return value.strip() or None


def _decimal(raw: object) -> Decimal | None:
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        value = Decimal(raw)
    except InvalidOperation:
        return None
    return value if value.is_finite() else None


def _observation(
    *,
    geoid: str,
    slug: str,
    release: str,
    value: Decimal | None = None,
    low: Decimal | None = None,
    high: Decimal | None = None,
    status: str,
    reason: str | None,
    metadata: Mapping[str, object] | None = None,
) -> PlacesObservation:
    return PlacesObservation(
        geoid=geoid,
        indicator_slug=slug,
        value=value,
        low_confidence_limit=low,
        high_confidence_limit=high,
        quality_status=status,
        quality_reason=reason,
        quality_metadata=MappingProxyType(dict(metadata or {})),
        source_year=CDC_PLACES_MEASURE_YEAR,
        source_release=release,
    )


def _normalize_row(row: Row, *, geoid: str, slug: str, release: str) -> PlacesObservation:
    symbol = _optional_text(row, "data_value_footnote_symbol")
    footnote = _optional_text(row, "data_value_footnote")
    if symbol is not None or footnote is not None:
        return _observation(
            geoid=geoid,
            slug=slug,
            release=release,
            status="missing",
            reason="footnoted_or_suppressed",
            metadata={"footnote_symbol": symbol, "footnote": footnote},
        )
    if row.get("data_value") is None or row.get("data_value") == "":
        return _observation(
            geoid=geoid,
            slug=slug,
            release=release,
            status="missing",
            reason="missing_value",
        )
    low_raw = row.get("low_confidence_limit")
    high_raw = row.get("high_confidence_limit")
    if low_raw is None or low_raw == "" or high_raw is None or high_raw == "":
        return _observation(
            geoid=geoid,
            slug=slug,
            release=release,
            status="missing",
            reason="missing_confidence_interval",
        )
    value = _decimal(row.get("data_value"))
    low = _decimal(low_raw)
    high = _decimal(high_raw)
    if value is None or low is None or high is None:
        return _observation(
            geoid=geoid,
            slug=slug,
            release=release,
            status="invalid",
            reason="invalid_number",
        )
    if value < 0 or value > 100:
        reason = "value_out_of_range"
    elif low < 0 or low > 100 or high < 0 or high > 100:
        reason = "confidence_interval_out_of_range"
    elif low > value or value > high:
        reason = "invalid_confidence_interval"
    else:
        return _observation(
            geoid=geoid,
            slug=slug,
            release=release,
            value=value,
            low=low,
            high=high,
            status="verified",
            reason=None,
            metadata={"confidence_level": "95_percent"},
        )
    return _observation(
        geoid=geoid,
        slug=slug,
        release=release,
        status="invalid",
        reason=reason,
    )


def _validate_geoid_set(geoids: Sequence[str], label: str) -> set[str]:
    if len(geoids) != len(set(geoids)):
        raise PlacesGeographyError(f"{label} GEOIDs must be unique")
    for geoid in geoids:
        if not GEOID_PATTERN.fullmatch(geoid):
            raise PlacesGeographyError(f"{label} requires an 11-digit GEOID: {geoid!r}")
        if not geoid.startswith(MILWAUKEE_COUNTY_FIPS):
            raise PlacesGeographyError(f"{label} GEOID is outside Milwaukee County: {geoid!r}")
    return set(geoids)


def normalize_places(
    content: bytes,
    *,
    canonical_geoids: Sequence[str],
    positive_population_geoids: Sequence[str],
    registry: MethodologyRegistry | None = None,
) -> PlacesNormalizationResult:
    """Normalize six PLACES observations for each positive-population tract."""

    methodology = registry or load_registry()
    measures = _measure_mapping(methodology)
    source = _places_source(methodology)
    canonical = _validate_geoid_set(canonical_geoids, "canonical")
    positive = _validate_geoid_set(positive_population_geoids, "positive-population")
    if not positive <= canonical:
        raise PlacesGeographyError("positive-population GEOIDs must be canonical")

    indexed: dict[tuple[str, str], Row] = {}
    source_geoids: set[str] = set()
    for position, row in enumerate(_decode_rows(content)):
        year = _required_string(row, "year", position)
        county = _required_string(row, "countyfips", position)
        geoid = _required_string(row, "locationid", position)
        measure = _required_string(row, "measureid", position)
        value_type = _required_string(row, "datavaluetypeid", position)
        if year != CDC_PLACES_MEASURE_YEAR:
            raise PlacesSourceError(
                f"PLACES measure year must be {CDC_PLACES_MEASURE_YEAR}, got {year!r}"
            )
        if county != MILWAUKEE_COUNTY_FIPS:
            raise PlacesSourceError(f"PLACES county FIPS must be 55079, got {county!r}")
        if not GEOID_PATTERN.fullmatch(geoid):
            raise PlacesGeographyError(f"PLACES locationid must be an 11-digit GEOID: {geoid!r}")
        if not geoid.startswith(MILWAUKEE_COUNTY_FIPS):
            raise PlacesGeographyError(f"PLACES GEOID is outside Milwaukee County: {geoid!r}")
        if measure not in measures:
            raise PlacesSourceError(f"PLACES row uses unapproved measure {measure!r}")
        if value_type != "CrdPrv":
            raise PlacesSourceError(
                f"PLACES row must use crude prevalence CrdPrv, got {value_type!r}"
            )
        key = (geoid, measure)
        if key in indexed:
            raise PlacesSourceError(f"duplicate PLACES row for {geoid} {measure}")
        indexed[key] = row
        source_geoids.add(geoid)

    extra = sorted(source_geoids - canonical)
    if extra:
        raise PlacesGeographyError(f"PLACES response contains extra GEOIDs: {extra}")

    observations: list[PlacesObservation] = []
    for geoid in sorted(positive):
        tract_reported = geoid in source_geoids
        for measure, slug in measures.items():
            source_row = indexed.get((geoid, measure))
            if source_row is None:
                reason = (
                    "measure_not_reported"
                    if tract_reported
                    else "tract_not_reported_adult_threshold"
                )
                observations.append(
                    _observation(
                        geoid=geoid,
                        slug=slug,
                        release=source.vintage,
                        status="missing",
                        reason=reason,
                    )
                )
            else:
                observations.append(
                    _normalize_row(
                        source_row,
                        geoid=geoid,
                        slug=slug,
                        release=source.vintage,
                    )
                )
    observations.sort(key=lambda item: (item.geoid, item.indicator_slug))
    return PlacesNormalizationResult(tuple(observations))


__all__ = [
    "CDC_PLACES_DATASET_ID",
    "CDC_PLACES_ENDPOINT",
    "PLACES_QUERY_LIMIT",
    "PlacesGeographyError",
    "PlacesSourceError",
    "build_places_request",
    "fetch_and_preserve_places",
    "normalize_places",
]
