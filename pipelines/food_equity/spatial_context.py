"""Source-backed local spatial predicates for database-free Food stages."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import cast

import geopandas as gpd
from shapely import union_all
from shapely.geometry import Point
from shapely.geometry.base import BaseGeometry

from pipelines.common.artifacts import StoredSnapshot, load_stored_snapshot
from pipelines.equity_baseline.geography import GeographyRecord, read_canonical_tracts
from pipelines.food_equity.errors import SourceValidationError

BASELINE_FETCH_STATE_PATH = Path("data/normalized/equity-baseline/fetched.json")
CANONICAL_TRACT_COUNT = 302
PROJECTED_CRS = "EPSG:3071"
WGS84_CRS = "EPSG:4326"
REVIEW_BUFFER_M = Decimal("3218.688")


class SpatialContextError(SourceValidationError):
    """Raised when canonical TIGER geography cannot support approved predicates."""


@dataclass(frozen=True, slots=True)
class SpatialContext:
    """Inclusive county and review-area predicates derived from exact TIGER bytes."""

    geoids: tuple[str, ...]
    tiger_snapshot_sha256: str
    county_projected: BaseGeometry = field(compare=False, repr=False)
    review_area_projected: BaseGeometry = field(compare=False, repr=False)
    review_area_wgs84: BaseGeometry = field(compare=False, repr=False)

    def service_area_contains(self, longitude: Decimal, latitude: Decimal) -> bool:
        return bool(self.review_area_wgs84.covers(Point(float(longitude), float(latitude))))

    def review_area_contains_projected(self, x: Decimal, y: Decimal) -> bool:
        return bool(self.review_area_projected.covers(Point(float(x), float(y))))

    def approved_area_for_origin(self, geoid: str, x: Decimal, y: Decimal) -> str | None:
        if geoid not in self.geoids or not self.review_area_contains_projected(x, y):
            return None
        return geoid


def build_spatial_context(
    geographies: Sequence[GeographyRecord],
    *,
    tiger_snapshot_sha256: str,
    expected_count: int = CANONICAL_TRACT_COUNT,
) -> SpatialContext:
    """Build exact inclusive predicates from canonical source-backed tract polygons."""

    records = tuple(sorted(geographies, key=lambda item: item.geoid))
    geoids = tuple(item.geoid for item in records)
    if len(records) != expected_count or len(set(geoids)) != expected_count:
        raise SpatialContextError(
            f"canonical spatial context must contain exactly {expected_count} unique tracts"
        )
    if len(tiger_snapshot_sha256) != 64 or any(
        character not in "0123456789abcdef" for character in tiger_snapshot_sha256
    ):
        raise SpatialContextError("TIGER snapshot identity must be a lowercase SHA-256")
    try:
        projected = gpd.GeoSeries([item.geometry for item in records], crs=WGS84_CRS).to_crs(
            PROJECTED_CRS
        )
        county_projected = union_all(projected.to_numpy())
        review_projected = county_projected.buffer(float(REVIEW_BUFFER_M))
        review_wgs84 = gpd.GeoSeries([review_projected], crs=PROJECTED_CRS).to_crs(WGS84_CRS)[0]
    except (TypeError, ValueError) as error:
        raise SpatialContextError("canonical TIGER polygons cannot be projected") from error
    if any(
        geometry.is_empty or not geometry.is_valid
        for geometry in (county_projected, review_projected, review_wgs84)
    ):
        raise SpatialContextError("canonical spatial predicates are empty or invalid")
    return SpatialContext(
        geoids=geoids,
        tiger_snapshot_sha256=tiger_snapshot_sha256,
        county_projected=county_projected,
        review_area_projected=review_projected,
        review_area_wgs84=review_wgs84,
    )


def _state_object(path: Path) -> Mapping[str, object]:
    try:
        value: object = json.loads(path.read_bytes())
    except FileNotFoundError as error:
        raise SpatialContextError(
            "canonical Equity Baseline fetch state is missing; run Plan 2 fetch first"
        ) from error
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SpatialContextError("canonical Equity Baseline fetch state is invalid") from error
    if not isinstance(value, Mapping) or any(not isinstance(key, str) for key in value):
        raise SpatialContextError("canonical Equity Baseline fetch state must be an object")
    return cast(Mapping[str, object], value)


def _manifest_path(root: Path, state: Mapping[str, object]) -> Path:
    tiger = state.get("tiger")
    if not isinstance(tiger, Mapping):
        raise SpatialContextError("canonical Equity Baseline state has no TIGER snapshot")
    value = tiger.get("manifest_path")
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise SpatialContextError("canonical TIGER manifest path is invalid")
    candidate = (root / value).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as error:
        raise SpatialContextError("canonical TIGER manifest escaped the workspace") from error
    return candidate


def load_spatial_context(
    root: Path,
    *,
    state_path: Path = BASELINE_FETCH_STATE_PATH,
) -> tuple[SpatialContext, StoredSnapshot]:
    """Reload Plan 2's exact TIGER snapshot and derive the approved local predicates."""

    resolved_root = root.resolve()
    state = _state_object(resolved_root / state_path)
    snapshot = load_stored_snapshot(
        root=resolved_root,
        manifest_path=_manifest_path(resolved_root, state),
        expected_source_key="tiger",
    )
    geographies = read_canonical_tracts(snapshot.raw_path)
    return (
        build_spatial_context(
            geographies,
            tiger_snapshot_sha256=snapshot.manifest.checksum_sha256,
        ),
        snapshot,
    )


__all__ = [
    "BASELINE_FETCH_STATE_PATH",
    "CANONICAL_TRACT_COUNT",
    "PROJECTED_CRS",
    "REVIEW_BUFFER_M",
    "SpatialContext",
    "SpatialContextError",
    "build_spatial_context",
    "load_spatial_context",
]
