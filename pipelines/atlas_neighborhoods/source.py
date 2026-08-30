"""Immutable acquisition, validation, and normalization of DCD neighborhoods."""

from __future__ import annotations

import json
import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import cast

from shapely import make_valid, wkb
from shapely.geometry import MultiPolygon, Polygon, shape

from pipelines.common.artifacts import StoredSnapshot, preserve_snapshot, schema_fingerprint
from pipelines.common.http import Opener, Sleeper, fetch_bytes

SOURCE_KEY = "milwaukee_dcd_neighborhoods"
SOURCE_URL = "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/AGO/neighborhoods/MapServer/0"
NEIGHBORHOOD_QUERY_URL = (
    SOURCE_URL
    + "/query?where=1%3D1&outFields=OBJECTID%2CNEIGHBORHD%2CNBHD_ID"
    + "&returnGeometry=true&outSR=4326&orderByFields=NBHD_ID&f=geojson"
)
DATASET_VERSION = "2000_reference_january_2007_catalog_update"
EXPECTED_FEATURE_COUNT = 190
MAX_RESPONSE_BYTES = 25 * 1024 * 1024
SCHEMA = {
    "type": "FeatureCollection",
    "feature_keys": ["type", "id", "properties", "geometry"],
    "property_keys": ["OBJECTID", "NEIGHBORHD", "NBHD_ID"],
    "geometry_types": ["Polygon", "MultiPolygon"],
    "coordinate_reference_system": "WGS84 / EPSG:4326",
}
SCHEMA_FINGERPRINT = schema_fingerprint(SCHEMA)
KNOWN_REPAIR_NBHD_ID = 30
KNOWN_REPAIR_NAME = "LAND BANK"


class NeighborhoodSourceError(ValueError):
    """Raised when the approved neighborhood source contract is violated."""


@dataclass(frozen=True, slots=True)
class NeighborhoodRecord:
    """A normalized neighborhood with a PostGIS-compatible stable geometry."""

    object_id: int
    neighborhood: str
    nbhd_id: int
    geometry_wkb_hex: str
    geometry_geojson: dict[str, object]


@dataclass(frozen=True, slots=True)
class StoredNeighborhoodSnapshot:
    """Normalized records, exact source bytes, and their immutable provenance."""

    content: bytes
    records: tuple[NeighborhoodRecord, ...]
    snapshot: StoredSnapshot


def _object(content: bytes) -> Mapping[str, object]:
    try:
        value: object = json.loads(
            content,
            parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)),
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise NeighborhoodSourceError("neighborhood response is not strict JSON") from error
    if not isinstance(value, Mapping):
        raise NeighborhoodSourceError("neighborhood response must be an object")
    return cast(Mapping[str, object], value)


def _coordinates_valid(value: object, *, depth: int = 0) -> bool:
    if depth == 0:
        if not isinstance(value, list):
            return False
        return all(_coordinates_valid(item, depth=1) for item in value)
    if (
        isinstance(value, list)
        and value
        and all(
            isinstance(item, (int, float)) and not isinstance(item, bool) for item in value
        )
    ):
        if len(value) != 2:
            return False
        longitude, latitude = cast(tuple[int | float, int | float], tuple(value))
        return (
            math.isfinite(longitude)
            and math.isfinite(latitude)
            and -180 <= longitude <= 180
            and -90 <= latitude <= 90
        )
    return (
        isinstance(value, list)
        and bool(value)
        and all(_coordinates_valid(item, depth=depth + 1) for item in value)
    )


def _geometry(
    value: object,
    position: int,
    *,
    allow_known_repair: bool = False,
) -> dict[str, object]:
    if not isinstance(value, Mapping) or set(value) != {"type", "coordinates"}:
        raise NeighborhoodSourceError(f"feature {position} geometry has unexpected fields")
    geometry_type = value.get("type")
    coordinates = value.get("coordinates")
    if geometry_type not in {"Polygon", "MultiPolygon"} or not _coordinates_valid(coordinates):
        raise NeighborhoodSourceError(f"feature {position} has invalid WGS84 geometry")
    try:
        parsed = shape({"type": geometry_type, "coordinates": coordinates})
    except Exception as error:
        raise NeighborhoodSourceError(f"feature {position} geometry cannot be parsed") from error
    if parsed.is_empty:
        raise NeighborhoodSourceError(f"feature {position} geometry is empty or invalid")
    if not parsed.is_valid:
        if not allow_known_repair:
            raise NeighborhoodSourceError(f"feature {position} geometry is empty or invalid")
        original_area = parsed.area
        parsed = make_valid(parsed)
        area_tolerance = max(1e-12, original_area * 1e-9)
        if (
            parsed.is_empty
            or not parsed.is_valid
            or abs(parsed.area - original_area) > area_tolerance
        ):
            raise NeighborhoodSourceError(
                f"feature {position} known geometry repair changed polygon area"
            )
    if isinstance(parsed, Polygon):
        parsed = MultiPolygon([parsed])
    if not isinstance(parsed, MultiPolygon):
        raise NeighborhoodSourceError(f"feature {position} geometry is not a polygon")
    return cast(dict[str, object], parsed.__geo_interface__)


def validate_neighborhood_response(
    content: bytes,
    *,
    expected_count: int = EXPECTED_FEATURE_COUNT,
) -> tuple[Mapping[str, object], ...]:
    """Validate source bytes and return feature mappings in source order."""
    document = _object(content)
    if set(document) != {"type", "features"} or document.get("type") != "FeatureCollection":
        raise NeighborhoodSourceError("response must be a FeatureCollection with no extra fields")
    features = document.get("features")
    if not isinstance(features, list) or len(features) != expected_count:
        raise NeighborhoodSourceError(f"expected exactly {expected_count} neighborhood features")
    seen_ids: set[int] = set()
    seen_nbhd: set[int] = set()
    for position, feature in enumerate(features):
        if not isinstance(feature, Mapping) or set(feature) != {
            "type",
            "id",
            "properties",
            "geometry",
        }:
            raise NeighborhoodSourceError(f"feature {position} has unexpected fields")
        if feature.get("type") != "Feature":
            raise NeighborhoodSourceError(f"feature {position} must be a GeoJSON Feature")
        properties = feature.get("properties")
        if not isinstance(properties, Mapping) or set(properties) != {
            "OBJECTID",
            "NEIGHBORHD",
            "NBHD_ID",
        }:
            raise NeighborhoodSourceError(f"feature {position} properties do not match schema")
        object_id = properties["OBJECTID"]
        name = properties["NEIGHBORHD"]
        nbhd_id = properties["NBHD_ID"]
        if isinstance(object_id, bool) or not isinstance(object_id, int) or object_id <= 0:
            raise NeighborhoodSourceError(f"feature {position} has invalid OBJECTID")
        if not isinstance(name, str) or not name.strip():
            raise NeighborhoodSourceError(f"feature {position} has blank NEIGHBORHD")
        if isinstance(nbhd_id, bool) or not isinstance(nbhd_id, int) or nbhd_id <= 0:
            raise NeighborhoodSourceError(f"feature {position} has invalid NBHD_ID")
        if feature.get("id") != object_id:
            raise NeighborhoodSourceError(f"feature {position} id does not equal OBJECTID")
        if object_id in seen_ids or nbhd_id in seen_nbhd:
            raise NeighborhoodSourceError(f"feature {position} contains a duplicate identifier")
        seen_ids.add(object_id)
        seen_nbhd.add(nbhd_id)
        _geometry(
            feature.get("geometry"),
            position,
            allow_known_repair=(
                nbhd_id == KNOWN_REPAIR_NBHD_ID and name == KNOWN_REPAIR_NAME
            ),
        )
    return tuple(cast(Mapping[str, object], feature) for feature in features)


def normalize_neighborhoods(
    content: bytes,
    *,
    expected_count: int = EXPECTED_FEATURE_COUNT,
) -> tuple[NeighborhoodRecord, ...]:
    """Validate and deterministically normalize neighborhood features by NBHD_ID."""
    records: list[NeighborhoodRecord] = []
    for position, feature in enumerate(validate_neighborhood_response(content, expected_count=expected_count)):
        properties = cast(Mapping[str, object], feature["properties"])
        geojson = _geometry(
            feature["geometry"],
            position,
            allow_known_repair=(
                properties["NBHD_ID"] == KNOWN_REPAIR_NBHD_ID
                and properties["NEIGHBORHD"] == KNOWN_REPAIR_NAME
            ),
        )
        geometry = shape(geojson)
        records.append(
            NeighborhoodRecord(
                object_id=cast(int, properties["OBJECTID"]),
                neighborhood=cast(str, properties["NEIGHBORHD"]),
                nbhd_id=cast(int, properties["NBHD_ID"]),
                geometry_wkb_hex=wkb.dumps(
                    geometry,
                    hex=True,
                    output_dimension=2,
                    byte_order=1,
                ),
                geometry_geojson=geojson,
            )
        )
    return tuple(sorted(records, key=lambda record: record.nbhd_id))


def fetch_neighborhood_snapshot(
    root: Path,
    *,
    opener: Opener | None = None,
    sleeper: Sleeper | None = None,
    clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    expected_count: int = EXPECTED_FEATURE_COUNT,
    max_bytes: int = MAX_RESPONSE_BYTES,
) -> StoredNeighborhoodSnapshot:
    """Fetch, validate, normalize, and preserve one exact neighborhood response."""
    def validator(value: bytes) -> None:
        validate_neighborhood_response(value, expected_count=expected_count)

    if opener is None and sleeper is None:
        content = fetch_bytes(
            NEIGHBORHOOD_QUERY_URL,
            validator=validator,
            max_bytes=max_bytes,
        )
    elif opener is None:
        content = fetch_bytes(
            NEIGHBORHOOD_QUERY_URL,
            sleeper=cast(Sleeper, sleeper),
            validator=validator,
            max_bytes=max_bytes,
        )
    elif sleeper is None:
        content = fetch_bytes(
            NEIGHBORHOOD_QUERY_URL,
            opener=opener,
            validator=validator,
            max_bytes=max_bytes,
        )
    else:
        content = fetch_bytes(
            NEIGHBORHOOD_QUERY_URL,
            opener=opener,
            sleeper=sleeper,
            validator=validator,
            max_bytes=max_bytes,
        )
    records = normalize_neighborhoods(content, expected_count=expected_count)
    snapshot = preserve_snapshot(
        root=root,
        pipeline_slug="atlas_neighborhoods",
        source_key=SOURCE_KEY,
        source_url=NEIGHBORHOOD_QUERY_URL,
        dataset_version=DATASET_VERSION,
        content=content,
        schema=SCHEMA,
        row_or_feature_count=len(records),
        license="City GIS disclaimer applies; no separate license is stated",
        methodology_reference=(
            "Approved City of Milwaukee DCD neighborhood reference: "
            "2000 reference, January 2007 catalog update"
        ),
        request_metadata={
            "url": NEIGHBORHOOD_QUERY_URL,
            "method": "GET",
            "out_fields": ["OBJECTID", "NEIGHBORHD", "NBHD_ID"],
            "out_sr": 4326,
            "attribution": "City of Milwaukee DCD and ITMD-GIS",
            "limitations": (
                "Not an official City or neighborhood-association boundary; "
                "not updated on an ongoing basis; City of Milwaukee coverage only"
            ),
            "known_geometry_normalization": (
                "NBHD_ID 30 LAND BANK: Shapely MakeValid repairs one source ring "
                "self-intersection only when polygon area is preserved within 1e-9 relative"
            ),
        },
        clock=clock,
    )
    return StoredNeighborhoodSnapshot(content=content, records=records, snapshot=snapshot)
