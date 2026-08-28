"""Strict canonicalization of 2020 Census TIGER/Line tract geography."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import cast

import geopandas as gpd
from pyproj.exceptions import CRSError
from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.geometry.base import BaseGeometry

from pipelines.equity_baseline.errors import GeographyValidationError

WISCONSIN_STATE_FIPS = "55"
MILWAUKEE_COUNTY_FIPS = "079"
OUTPUT_CRS = "EPSG:4326"
CENTROID_CRS = "EPSG:3071"
TIGER_2020_WISCONSIN_TRACTS_URL = (
    "https://www2.census.gov/geo/tiger/TIGER2020/TRACT/tl_2020_55_tract.zip"
)
REQUIRED_TIGER_COLUMNS = frozenset(
    {
        "STATEFP20",
        "COUNTYFP20",
        "TRACTCE20",
        "GEOID20",
        "NAME20",
        "NAMELSAD20",
        "geometry",
    }
)


@dataclass(frozen=True, slots=True)
class GeographyRecord:
    """One canonical Milwaukee County 2020 Census tract."""

    geoid: str
    name: str
    state_fips: str
    county_fips: str
    vintage: str
    geometry: MultiPolygon
    centroid: Point


def _column_values(frame: gpd.GeoDataFrame, column: str) -> list[object]:
    return cast(list[object], frame[column].tolist())


def _require_codes(frame: gpd.GeoDataFrame, column: str, width: int) -> list[str]:
    pattern = re.compile(rf"^[0-9]{{{width}}}$")
    values = _column_values(frame, column)
    if any(not isinstance(value, str) or pattern.fullmatch(value) is None for value in values):
        raise GeographyValidationError(f"{column} must contain exactly {width} digits")
    return cast(list[str], values)


def _require_names(frame: gpd.GeoDataFrame) -> list[str]:
    values = _column_values(frame, "NAMELSAD20")
    if any(not isinstance(value, str) or not value.strip() for value in values):
        raise GeographyValidationError("NAMELSAD20 must contain non-empty tract names")
    return cast(list[str], values)


def _validate_source_geometry(frame: gpd.GeoDataFrame) -> None:
    if bool(frame.geometry.isna().any()):
        raise GeographyValidationError("authoritative source contains null geometry")
    if bool(frame.geometry.is_empty.any()):
        raise GeographyValidationError("authoritative source contains empty geometry")
    if not bool(frame.geometry.is_valid.all()):
        raise GeographyValidationError("authoritative source contains invalid geometry")
    geometry_types = set(frame.geometry.geom_type.tolist())
    unexpected = geometry_types - {"Polygon", "MultiPolygon"}
    if unexpected:
        raise GeographyValidationError(
            "authoritative tract geometry must be Polygon or MultiPolygon"
        )


def _validate_source(frame: gpd.GeoDataFrame) -> None:
    missing = REQUIRED_TIGER_COLUMNS - set(frame.columns)
    if missing:
        raise GeographyValidationError(
            f"missing required TIGER columns: {', '.join(sorted(missing))}"
        )
    if frame.crs is None:
        raise GeographyValidationError("authoritative TIGER source has no declared CRS")
    if frame.empty:
        raise GeographyValidationError("authoritative TIGER source is empty")

    state_codes = _require_codes(frame, "STATEFP20", 2)
    county_codes = _require_codes(frame, "COUNTYFP20", 3)
    geoids = _require_codes(frame, "GEOID20", 11)
    tract_codes = _require_codes(frame, "TRACTCE20", 6)
    _require_names(frame)

    if len(geoids) != len(set(geoids)):
        raise GeographyValidationError("GEOID20 values must be unique")
    for state_fips, county_fips, tract_code, geoid in zip(
        state_codes, county_codes, tract_codes, geoids, strict=True
    ):
        if geoid != f"{state_fips}{county_fips}{tract_code}":
            raise GeographyValidationError("GEOID20 does not match its state/county FIPS prefix")

    _validate_source_geometry(frame)


def _to_multipolygon(geometry: BaseGeometry) -> MultiPolygon:
    if isinstance(geometry, MultiPolygon):
        return geometry
    if isinstance(geometry, Polygon):
        return MultiPolygon([geometry])
    raise GeographyValidationError("canonical tract geometry must be Polygon or MultiPolygon")


def normalize_canonical_tracts(frame: gpd.GeoDataFrame) -> tuple[GeographyRecord, ...]:
    """Validate statewide source geography and return canonical Milwaukee tracts."""

    _validate_source(frame)
    selected = frame.loc[
        (frame["STATEFP20"] == WISCONSIN_STATE_FIPS)
        & (frame["COUNTYFP20"] == MILWAUKEE_COUNTY_FIPS)
    ].copy()
    if selected.empty:
        raise GeographyValidationError("authoritative source contains no Milwaukee County tracts")

    try:
        output = selected.to_crs(OUTPUT_CRS)
        centroid_geometry = selected.to_crs(CENTROID_CRS).geometry.centroid.to_crs(OUTPUT_CRS)
    except (CRSError, ValueError) as error:
        raise GeographyValidationError("cannot reproject authoritative tract geography") from error

    output_geometries = output.geometry.tolist()
    centroids = centroid_geometry.tolist()
    if any(geometry.is_empty or not geometry.is_valid for geometry in output_geometries):
        raise GeographyValidationError("reprojected canonical geometry is empty or invalid")
    if any(not isinstance(centroid, Point) or centroid.is_empty for centroid in centroids):
        raise GeographyValidationError("projected centroid calculation produced unusable output")

    geoids = cast(list[str], output["GEOID20"].tolist())
    names = cast(list[str], output["NAMELSAD20"].tolist())
    states = cast(list[str], output["STATEFP20"].tolist())
    counties = cast(list[str], output["COUNTYFP20"].tolist())
    records = [
        GeographyRecord(
            geoid=geoid,
            name=name,
            state_fips=state_fips,
            county_fips=county_fips,
            vintage="2020 TIGER/Line",
            geometry=_to_multipolygon(geometry),
            centroid=cast(Point, centroid),
        )
        for geoid, name, state_fips, county_fips, geometry, centroid in zip(
            geoids,
            names,
            states,
            counties,
            output_geometries,
            centroids,
            strict=True,
        )
    ]
    return tuple(sorted(records, key=lambda record: record.geoid))


def read_canonical_tracts(path: str | Path) -> tuple[GeographyRecord, ...]:
    """Read a TIGER/Line vector source with pyogrio and canonicalize it."""

    frame = gpd.read_file(path, engine="pyogrio")
    return normalize_canonical_tracts(frame)


__all__ = [
    "GeographyRecord",
    "GeographyValidationError",
    "REQUIRED_TIGER_COLUMNS",
    "TIGER_2020_WISCONSIN_TRACTS_URL",
    "normalize_canonical_tracts",
    "read_canonical_tracts",
]
