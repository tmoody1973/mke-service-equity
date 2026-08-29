"""Acquire and normalize the approved ACS vehicle-access constraint."""

from __future__ import annotations

import json
import os
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from types import MappingProxyType
from typing import cast
from urllib.parse import urlencode

from pipelines.common.artifacts import StoredSnapshot, preserve_snapshot
from pipelines.common.http import Opener, Sleeper, fetch_bytes
from pipelines.equity_baseline.acs import ParsedGroup, parse_group_response
from pipelines.equity_baseline.acs import validate_group_metadata as validate_acs_group_metadata
from pipelines.equity_baseline.errors import AcsGeographyError, AcsSourceError
from pipelines.equity_baseline.quality import (
    ReliabilityState,
    coefficient_of_variation,
    proportion_margin_of_error,
)
from pipelines.equity_baseline.registry import load_registry as load_equity_registry
from pipelines.food_equity.errors import SourceValidationError
from pipelines.food_equity.registry import load_registry

ACS_2024_5_YEAR_ENDPOINT = "https://api.census.gov/data/2024/acs/acs5"
ACS_GROUP = "B08201"
APPROVED_ESTIMATES = ("B08201_001E", "B08201_002E")
CANONICAL_TRACT_COUNT = 302
MILWAUKEE_GEOID_PREFIX = "55079"
GEOID_PATTERN = re.compile(r"^[0-9]{11}$")


class VehicleAccessSourceError(SourceValidationError):
    """Raised when the approved ACS response violates its source contract."""


class VehicleAccessGeographyError(VehicleAccessSourceError):
    """Raised when ACS rows do not reconcile to the canonical tract universe."""


@dataclass(frozen=True, slots=True)
class VehicleAccessRequest:
    """One bounded ACS request and its credential-free manifest metadata."""

    group: str
    url: str
    manifest_metadata: Mapping[str, str]


@dataclass(frozen=True, slots=True)
class VehicleAccessObservation:
    """One tract-level no-vehicle percentage with uncertainty evidence."""

    geoid: str
    value: Decimal | None
    margin_of_error: Decimal | None
    coefficient_of_variation: Decimal | None
    reliability: ReliabilityState | None
    quality_status: str
    quality_reason: str | None
    quality_metadata: Mapping[str, object]
    metric_slug: str = "households_no_vehicle"
    unit: str = "percent"


@dataclass(frozen=True, slots=True)
class FetchedVehicleAccess:
    """Exact ACS response bytes and their food-equity snapshot."""

    content: bytes
    snapshot: StoredSnapshot


def build_vehicle_access_request() -> VehicleAccessRequest:
    """Build the approved request, reading the optional key only at call time."""

    metadata = {
        "get": f"group({ACS_GROUP})",
        "for": "tract:*",
        "in": "state:55 county:079",
        "group": ACS_GROUP,
    }
    query = {key: value for key, value in metadata.items() if key != "group"}
    api_key = os.getenv("CENSUS_API_KEY")
    if api_key:
        query["key"] = api_key
    return VehicleAccessRequest(
        group=ACS_GROUP,
        url=f"{ACS_2024_5_YEAR_ENDPOINT}?{urlencode(query)}",
        manifest_metadata=MappingProxyType(metadata),
    )


def validate_group_metadata(metadata: Mapping[str, object]) -> None:
    """Validate the official B08201 estimate, MOE, and annotation identities."""

    try:
        validate_acs_group_metadata(
            ACS_GROUP,
            metadata,
            required_estimates=APPROVED_ESTIMATES,
        )
    except AcsSourceError as error:
        raise VehicleAccessSourceError(str(error)) from error


def _parse_response(content: bytes) -> ParsedGroup:
    try:
        return parse_group_response(
            ACS_GROUP,
            content,
            required_estimates=APPROVED_ESTIMATES,
        )
    except AcsGeographyError as error:
        raise VehicleAccessGeographyError(str(error)) from error
    except AcsSourceError as error:
        raise VehicleAccessSourceError(str(error)) from error


def _canonical_geoids(expected_geoids: Sequence[str], expected_count: int) -> tuple[str, ...]:
    geoids = tuple(expected_geoids)
    if len(geoids) != expected_count:
        raise VehicleAccessGeographyError(
            f"canonical tract universe must contain exactly {expected_count} GEOIDs"
        )
    if len(geoids) != len(set(geoids)):
        raise VehicleAccessGeographyError(
            "canonical tract universe contains duplicate canonical GEOIDs"
        )
    if any(
        GEOID_PATTERN.fullmatch(geoid) is None or not geoid.startswith(MILWAUKEE_GEOID_PREFIX)
        for geoid in geoids
    ):
        raise VehicleAccessGeographyError(
            "canonical tract GEOIDs must be 11 digits in Milwaukee County"
        )
    return tuple(sorted(geoids))


def _missing_observation(geoid: str, reason: str) -> VehicleAccessObservation:
    return VehicleAccessObservation(
        geoid=geoid,
        value=None,
        margin_of_error=None,
        coefficient_of_variation=None,
        reliability=None,
        quality_status="missing",
        quality_reason=reason,
        quality_metadata=MappingProxyType({"reason": reason}),
    )


def normalize_vehicle_access(
    content: bytes,
    *,
    expected_geoids: Sequence[str],
    expected_count: int = CANONICAL_TRACT_COUNT,
    group_metadata: Mapping[str, object] | None = None,
) -> tuple[VehicleAccessObservation, ...]:
    """Normalize one no-vehicle observation for every canonical tract."""

    canonical_geoids = _canonical_geoids(expected_geoids, expected_count)
    if group_metadata is not None:
        validate_group_metadata(group_metadata)
    parsed = _parse_response(content)
    actual = set(parsed.rows)
    expected = set(canonical_geoids)
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    duplicate = list(parsed.duplicate_geoids)
    if missing or extra or duplicate:
        raise VehicleAccessGeographyError(
            f"ACS group {ACS_GROUP} geography mismatch: missing={missing}; "
            f"extra={extra}; duplicate={duplicate}"
        )

    reliability_policy = load_equity_registry().reliability
    observations: list[VehicleAccessObservation] = []
    for geoid in canonical_geoids:
        cells = parsed.rows[geoid]
        unusable = next(
            (
                (variable, cells[variable].unusable_reason)
                for variable in APPROVED_ESTIMATES
                if cells[variable].unusable_reason is not None
            ),
            None,
        )
        if unusable is not None:
            variable, reason = unusable
            observations.append(_missing_observation(geoid, f"{reason}:{variable}"))
            continue

        denominator = cast(Decimal, cells["B08201_001E"].estimate)
        numerator = cast(Decimal, cells["B08201_002E"].estimate)
        if denominator <= 0:
            observations.append(_missing_observation(geoid, "nonpositive_denominator"))
            continue
        value = numerator / denominator * Decimal("100")
        if value < 0 or value > 100:
            observations.append(_missing_observation(geoid, "out_of_range"))
            continue

        margin = proportion_margin_of_error(
            numerator=numerator,
            denominator=denominator,
            numerator_moe=cast(Decimal, cells["B08201_002E"].margin_of_error),
            denominator_moe=cast(Decimal, cells["B08201_001E"].margin_of_error),
        )
        reliability = coefficient_of_variation(value, margin, reliability_policy)
        observations.append(
            VehicleAccessObservation(
                geoid=geoid,
                value=value,
                margin_of_error=margin,
                coefficient_of_variation=reliability.cv,
                reliability=reliability.state,
                quality_status="verified",
                quality_reason=None,
                quality_metadata=MappingProxyType(
                    {
                        "cv_state": reliability.state.value,
                        "source_confidence_level": "90_percent",
                    }
                ),
            )
        )
    return tuple(observations)


def fetch_and_preserve_vehicle_access(
    root: Path,
    *,
    clock: Callable[[], datetime],
    opener: Opener | None = None,
    sleeper: Sleeper | None = None,
) -> FetchedVehicleAccess:
    """Fetch B08201 once, validate it, and preserve exact credential-safe bytes."""

    request = build_vehicle_access_request()

    def validate(content: bytes) -> None:
        _parse_response(content)

    if opener is None and sleeper is None:
        content = fetch_bytes(request.url, validator=validate)
    elif opener is None:
        content = fetch_bytes(request.url, sleeper=cast(Sleeper, sleeper), validator=validate)
    elif sleeper is None:
        content = fetch_bytes(request.url, opener=opener, validator=validate)
    else:
        content = fetch_bytes(
            request.url,
            opener=opener,
            sleeper=sleeper,
            validator=validate,
        )

    payload = json.loads(content)
    registry = load_registry()
    source = next(item for item in registry.sources if item.key == "acs_vehicle")
    snapshot = preserve_snapshot(
        root=root,
        pipeline_slug="food-equity",
        source_key="acs_vehicle",
        source_url=request.url,
        dataset_version=source.vintage,
        content=content,
        schema={
            "columns": payload[0],
            "group": ACS_GROUP,
            "required_estimates": list(APPROVED_ESTIMATES),
        },
        row_or_feature_count=len(payload) - 1,
        license=source.license_notes,
        methodology_reference=registry.methodology_version,
        request_metadata=dict(request.manifest_metadata),
        clock=clock,
    )
    return FetchedVehicleAccess(content=content, snapshot=snapshot)


__all__ = [
    "ACS_2024_5_YEAR_ENDPOINT",
    "ACS_GROUP",
    "APPROVED_ESTIMATES",
    "CANONICAL_TRACT_COUNT",
    "FetchedVehicleAccess",
    "VehicleAccessGeographyError",
    "VehicleAccessObservation",
    "VehicleAccessRequest",
    "VehicleAccessSourceError",
    "build_vehicle_access_request",
    "fetch_and_preserve_vehicle_access",
    "normalize_vehicle_access",
    "validate_group_metadata",
]
