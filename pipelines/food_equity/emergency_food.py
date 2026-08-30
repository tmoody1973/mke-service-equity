"""Acquire and normalize the approved ArcGIS emergency-food context layer."""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from typing import cast
from urllib.parse import urlencode

from pipelines.common.artifacts import StoredSnapshot, preserve_snapshot
from pipelines.common.http import Opener, Sleeper, fetch_bytes
from pipelines.food_equity.errors import SourceValidationError
from pipelines.food_equity.models import MethodologyRegistry, ResourceCategory
from pipelines.food_equity.registry import load_registry

ARCGIS_ITEM_ID = "303b7e4385a6450fa7d36d76a1ba5a67"
EMERGENCY_FOOD_LAYER_ID = 0
EMERGENCY_FOOD_SOURCE_URL = (
    "https://services5.arcgis.com/3kr3fkJcIf6EOY6g/ArcGIS/rest/services/"
    "EmergencyFood_MKE/FeatureServer/0"
)
EMERGENCY_FOOD_QUERY_FIELDS = (
    "ObjectID",
    "USER_Company_Business_Name",
    "USER_Address",
    "USER_City",
    "USER_Zip_Code",
    "USER_Phone_Number",
    "USER_Type",
    "USER_Notes",
    "USER_Website",
    "USER_Service_Area",
)
EMERGENCY_FOOD_FIELD_SCHEMA = (
    ("ObjectID", "esriFieldTypeOID", "ObjectID"),
    ("USER_Company_Business_Name", "esriFieldTypeString", "Company/Business Name"),
    ("USER_Address", "esriFieldTypeString", "Address"),
    ("USER_City", "esriFieldTypeString", "City"),
    ("USER_Zip_Code", "esriFieldTypeDouble", "Zip Code"),
    ("USER_Phone_Number", "esriFieldTypeString", "Phone Number"),
    ("USER_Type", "esriFieldTypeString", "Type"),
    ("USER_Notes", "esriFieldTypeString", "Notes"),
    ("USER_Website", "esriFieldTypeString", "Website"),
    ("USER_Service_Area", "esriFieldTypeString", "Service Area"),
)
EMERGENCY_FOOD_QUERY_PARAMETERS = {
    "f": "json",
    "orderByFields": "ObjectID ASC",
    "outFields": ",".join(EMERGENCY_FOOD_QUERY_FIELDS),
    "outSR": "4326",
    "returnGeometry": "true",
    "where": "1=1",
}
EMERGENCY_FOOD_QUERY_URL = (
    f"{EMERGENCY_FOOD_SOURCE_URL}/query?{urlencode(EMERGENCY_FOOD_QUERY_PARAMETERS)}"
)
OBSERVED_SOURCE_FEATURE_COUNT = 75
SOURCE_VINTAGE = "data edited 2024-08-07; schema/layer edited 2024-08-27"
SOURCE_KEY = "emergency_food_context"
POINT_GEOMETRY_TYPE = "esriGeometryPoint"
WGS84_WKID = 4326


class EmergencyFoodSourceError(SourceValidationError):
    """Raised when the emergency-food response violates the approved contract."""


@dataclass(frozen=True, slots=True)
class ArcGisField:
    """One validated ArcGIS field declaration."""

    name: str
    type: str
    alias: str


@dataclass(frozen=True, slots=True)
class RawEmergencyFoodFeature:
    """One typed source feature before semantic normalization."""

    object_id: int
    name: str | None
    address: str | None
    city: str | None
    zip_code: int | float | None
    phone: str | None
    source_type: str | None
    notes: str | None
    website: str | None
    service_area: str | None
    geometry_x: int | float | None
    geometry_y: int | float | None
    geometry_present: bool


@dataclass(frozen=True, slots=True)
class ParsedEmergencyFoodResponse:
    """A structurally validated ArcGIS FeatureSet."""

    object_id_field_name: str
    geometry_type: str
    out_sr_wkid: int
    fields: tuple[ArcGisField, ...]
    features: tuple[RawEmergencyFoodFeature, ...]


@dataclass(frozen=True, slots=True)
class EmergencyFoodRecord:
    """One normalized, context-only emergency-food resource."""

    object_id: int
    source_record_id: str
    name: str | None
    address: str | None
    city: str | None
    zip_code: str | None
    zip_status: str
    phone: str | None
    source_type: str | None
    category: ResourceCategory
    notes: str | None
    website: str | None
    service_area: str | None
    longitude: Decimal | None
    latitude: Decimal | None
    coordinate_status: str
    fixed_location: bool
    routing_status: str
    active_status: str
    active: None
    verification_date: date | None
    operating_hours: None
    hours_status: str
    scoring_eligible: bool
    reuse_terms_confirmed: bool
    public_redistribution_allowed: bool
    context_status: str
    conflict_status: str
    conflict_group_id: str | None
    source_key: str = SOURCE_KEY
    source_vintage: str = SOURCE_VINTAGE

    @property
    def stable_id(self) -> str:
        """Expose the complete ArcGIS source identity."""

        return self.source_record_id


@dataclass(frozen=True, slots=True)
class FetchedEmergencyFood:
    """Fetched response bytes, validated features, and immutable snapshot."""

    content: bytes
    response: ParsedEmergencyFoodResponse
    snapshot: StoredSnapshot


def _json_object(content: bytes) -> Mapping[str, object]:
    def invalid_constant(value: str) -> None:
        raise ValueError(f"non-finite JSON number {value}")

    try:
        raw: object = json.loads(content, parse_constant=invalid_constant)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise EmergencyFoodSourceError(
            "emergency-food response is not valid strict JSON"
        ) from error
    if not isinstance(raw, Mapping) or any(not isinstance(key, str) for key in raw):
        raise EmergencyFoodSourceError("emergency-food response must be a JSON object")
    if "error" in raw:
        raise EmergencyFoodSourceError("ArcGIS returned an error instead of a FeatureSet")
    return cast(Mapping[str, object], raw)


def _validate_spatial_reference(raw: object) -> int:
    if not isinstance(raw, Mapping):
        raise EmergencyFoodSourceError("ArcGIS spatial reference must be an object")
    wkid = raw.get("wkid")
    latest_wkid = raw.get("latestWkid", wkid)
    if (
        not isinstance(wkid, int)
        or isinstance(wkid, bool)
        or wkid != WGS84_WKID
        or not isinstance(latest_wkid, int)
        or isinstance(latest_wkid, bool)
        or latest_wkid != WGS84_WKID
    ):
        raise EmergencyFoodSourceError("ArcGIS spatial reference must be WGS84 / 4326")
    return wkid


def _validate_fields(raw: object) -> tuple[ArcGisField, ...]:
    if not isinstance(raw, list):
        raise EmergencyFoodSourceError("ArcGIS fields must be an array")
    fields: list[ArcGisField] = []
    for position, value in enumerate(raw):
        if not isinstance(value, Mapping):
            raise EmergencyFoodSourceError(f"ArcGIS field {position} must be an object")
        name = value.get("name")
        field_type = value.get("type")
        alias = value.get("alias")
        if (
            not isinstance(name, str)
            or not isinstance(field_type, str)
            or not isinstance(alias, str)
        ):
            raise EmergencyFoodSourceError(f"ArcGIS field {position} has invalid schema values")
        fields.append(ArcGisField(name=name, type=field_type, alias=alias))
    observed = tuple((field.name, field.type, field.alias) for field in fields)
    if observed != EMERGENCY_FOOD_FIELD_SCHEMA:
        raise EmergencyFoodSourceError("ArcGIS field schema or field type changed")
    return tuple(fields)


def _optional_source_string(
    attributes: Mapping[str, object], field: str, position: int
) -> str | None:
    value = attributes[field]
    if value is not None and not isinstance(value, str):
        raise EmergencyFoodSourceError(
            f"ArcGIS feature {position} attribute {field} must be a string or null"
        )
    return value


def _source_number(value: object, *, label: str) -> int | float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise EmergencyFoodSourceError(f"{label} must be numeric or null")
    if not math.isfinite(value):
        raise EmergencyFoodSourceError(f"{label} must be finite")
    return value


def _raw_feature(value: object, position: int) -> RawEmergencyFoodFeature:
    if not isinstance(value, Mapping) or set(value) != {"attributes", "geometry"}:
        raise EmergencyFoodSourceError(
            f"ArcGIS feature {position} must contain only attributes and geometry"
        )
    attributes = value.get("attributes")
    if not isinstance(attributes, Mapping) or set(attributes) != set(EMERGENCY_FOOD_QUERY_FIELDS):
        raise EmergencyFoodSourceError(f"ArcGIS feature {position} attributes do not match schema")
    object_id = attributes["ObjectID"]
    if isinstance(object_id, bool) or not isinstance(object_id, int) or object_id < 0:
        raise EmergencyFoodSourceError(f"ArcGIS feature {position} has invalid ObjectID")

    geometry = value.get("geometry")
    geometry_present = geometry is not None
    x: int | float | None = None
    y: int | float | None = None
    if geometry is not None:
        if not isinstance(geometry, Mapping) or set(geometry) != {"x", "y"}:
            raise EmergencyFoodSourceError(
                f"ArcGIS feature {position} point geometry must contain only x and y"
            )
        x = _source_number(geometry["x"], label=f"ArcGIS feature {position} geometry x")
        y = _source_number(geometry["y"], label=f"ArcGIS feature {position} geometry y")

    zip_value = _source_number(
        attributes["USER_Zip_Code"], label=f"ArcGIS feature {position} ZIP code"
    )
    return RawEmergencyFoodFeature(
        object_id=object_id,
        name=_optional_source_string(attributes, "USER_Company_Business_Name", position),
        address=_optional_source_string(attributes, "USER_Address", position),
        city=_optional_source_string(attributes, "USER_City", position),
        zip_code=zip_value,
        phone=_optional_source_string(attributes, "USER_Phone_Number", position),
        source_type=_optional_source_string(attributes, "USER_Type", position),
        notes=_optional_source_string(attributes, "USER_Notes", position),
        website=_optional_source_string(attributes, "USER_Website", position),
        service_area=_optional_source_string(attributes, "USER_Service_Area", position),
        geometry_x=x,
        geometry_y=y,
        geometry_present=geometry_present,
    )


def read_emergency_food_response(
    content: bytes,
    *,
    expected_feature_count: int | None = OBSERVED_SOURCE_FEATURE_COUNT,
) -> ParsedEmergencyFoodResponse:
    """Validate the complete approved ArcGIS FeatureSet and retain typed source rows."""

    raw = _json_object(content)
    if raw.get("objectIdFieldName") != "ObjectID":
        raise EmergencyFoodSourceError("ArcGIS ObjectID field identity changed")
    unique_id = raw.get("uniqueIdField")
    if unique_id is not None and (
        not isinstance(unique_id, Mapping)
        or unique_id.get("name") != "ObjectID"
        or unique_id.get("isSystemMaintained") is not True
    ):
        raise EmergencyFoodSourceError("ArcGIS unique ObjectID field identity changed")
    geometry_type = raw.get("geometryType")
    if geometry_type != POINT_GEOMETRY_TYPE:
        raise EmergencyFoodSourceError("ArcGIS response geometry must be point geometry")
    out_sr_wkid = _validate_spatial_reference(raw.get("spatialReference"))
    fields = _validate_fields(raw.get("fields"))
    exceeded_transfer_limit = raw.get("exceededTransferLimit")
    if exceeded_transfer_limit is not None and exceeded_transfer_limit is not False:
        raise EmergencyFoodSourceError(
            "ArcGIS response is partial or has an unknown transfer limit"
        )
    raw_features = raw.get("features")
    if not isinstance(raw_features, list):
        raise EmergencyFoodSourceError("ArcGIS FeatureSet features must be an array")
    if expected_feature_count is not None and len(raw_features) != expected_feature_count:
        raise EmergencyFoodSourceError(
            f"ArcGIS response must contain exactly {expected_feature_count} features"
        )
    features = tuple(_raw_feature(value, position) for position, value in enumerate(raw_features))
    object_ids = [feature.object_id for feature in features]
    duplicates = sorted(
        object_id for object_id in set(object_ids) if object_ids.count(object_id) > 1
    )
    if duplicates:
        raise EmergencyFoodSourceError(f"duplicate ArcGIS ObjectID values: {duplicates}")
    return ParsedEmergencyFoodResponse(
        object_id_field_name="ObjectID",
        geometry_type=POINT_GEOMETRY_TYPE,
        out_sr_wkid=out_sr_wkid,
        fields=fields,
        features=tuple(sorted(features, key=lambda feature: feature.object_id)),
    )


def _optional_trimmed(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _optional_source_text(value: str | None) -> str | None:
    """Preserve substantive partner text while treating whitespace-only text as missing."""

    if value is None or not value.strip():
        return None
    return value


def _zip_code(value: int | float | None) -> tuple[str | None, str]:
    if value is None or value == 0:
        return None, "missing"
    decimal = Decimal(str(value))
    if decimal != decimal.to_integral_value() or decimal < 0 or decimal > 99999:
        return None, "invalid"
    return f"{int(decimal):05d}", "source_value"


def _coordinates(
    feature: RawEmergencyFoodFeature,
) -> tuple[Decimal | None, Decimal | None, str]:
    if not feature.geometry_present:
        return None, None, "missing"
    if feature.geometry_x is None and feature.geometry_y is None:
        return None, None, "missing"
    if feature.geometry_x is None or feature.geometry_y is None:
        return None, None, "invalid"
    longitude = Decimal(str(feature.geometry_x))
    latitude = Decimal(str(feature.geometry_y))
    if longitude < -180 or longitude > 180 or latitude < -90 or latitude > 90:
        return None, None, "invalid"
    return longitude, latitude, "source_coordinate"


def emergency_food_context_status(
    *,
    retrieved_at: datetime,
    reuse_terms_confirmed: bool,
    verification_date: date | None,
    registry: MethodologyRegistry | None = None,
) -> str:
    """Return verified context only when terms and freshness both satisfy the registry."""

    if retrieved_at.tzinfo is None or retrieved_at.utcoffset() is None:
        raise EmergencyFoodSourceError("retrieved_at must be timezone-aware")
    methodology = registry or load_registry()
    source = next(item for item in methodology.sources if item.key == SOURCE_KEY)
    max_age_days = source.max_age_days
    if max_age_days is None:
        raise EmergencyFoodSourceError("emergency-food source has no maximum verification age")
    if not reuse_terms_confirmed or verification_date is None:
        return "stale_unverified_context"
    retrieval_date = retrieved_at.astimezone(UTC).date()
    age_days = (retrieval_date - verification_date).days
    return "verified_context" if 0 <= age_days <= max_age_days else "stale_unverified_context"


def _category(source_type: str | None, registry: MethodologyRegistry) -> ResourceCategory:
    normalized = _optional_trimmed(source_type)
    if normalized is None:
        return ResourceCategory.UNVERIFIED
    rule = next(
        (
            item
            for item in registry.classifications
            if item.source == SOURCE_KEY and item.source_value == normalized
        ),
        None,
    )
    if rule is None:
        raise EmergencyFoodSourceError(
            f"unrecognized emergency-food source type/category: {normalized!r}"
        )
    return rule.category


def _conflict_key(record: EmergencyFoodRecord) -> tuple[str, str, str, str] | None:
    identity = (record.name, record.address, record.city, record.zip_code)
    if any(value is None for value in identity):
        return None
    return cast(
        tuple[str, str, str, str],
        tuple(" ".join(cast(str, value).casefold().split()) for value in identity),
    )


def normalize_emergency_food(
    response: ParsedEmergencyFoodResponse,
    *,
    retrieved_at: datetime,
    reuse_terms_confirmed: bool = False,
    verification_date: date | None = None,
    registry: MethodologyRegistry | None = None,
) -> tuple[EmergencyFoodRecord, ...]:
    """Normalize emergency resources without inventing status, location, or hours."""

    methodology = registry or load_registry()
    object_ids = [feature.object_id for feature in response.features]
    if len(object_ids) != len(set(object_ids)):
        raise EmergencyFoodSourceError("duplicate ArcGIS ObjectID in parsed response")
    context_status = emergency_food_context_status(
        retrieved_at=retrieved_at,
        reuse_terms_confirmed=reuse_terms_confirmed,
        verification_date=verification_date,
        registry=methodology,
    )
    records: list[EmergencyFoodRecord] = []
    for feature in sorted(response.features, key=lambda item: item.object_id):
        longitude, latitude, coordinate_status = _coordinates(feature)
        zip_code, zip_status = _zip_code(feature.zip_code)
        has_location = coordinate_status == "source_coordinate"
        records.append(
            EmergencyFoodRecord(
                object_id=feature.object_id,
                source_record_id=(
                    f"{ARCGIS_ITEM_ID}/{EMERGENCY_FOOD_LAYER_ID}/{feature.object_id}"
                ),
                name=_optional_trimmed(feature.name),
                address=_optional_trimmed(feature.address),
                city=_optional_trimmed(feature.city),
                zip_code=zip_code,
                zip_status=zip_status,
                phone=_optional_trimmed(feature.phone),
                source_type=_optional_trimmed(feature.source_type),
                category=_category(feature.source_type, methodology),
                notes=_optional_source_text(feature.notes),
                website=_optional_trimmed(feature.website),
                service_area=_optional_source_text(feature.service_area),
                longitude=longitude,
                latitude=latitude,
                coordinate_status=coordinate_status,
                fixed_location=has_location,
                routing_status="context_coordinate_available"
                if has_location
                else "unroutable_context",
                active_status="unknown",
                active=None,
                verification_date=verification_date,
                operating_hours=None,
                hours_status="missing",
                scoring_eligible=False,
                reuse_terms_confirmed=reuse_terms_confirmed,
                public_redistribution_allowed=reuse_terms_confirmed,
                context_status=context_status,
                conflict_status="not_conflicting",
                conflict_group_id=None,
            )
        )

    categories_by_key: dict[tuple[str, str, str, str], set[ResourceCategory]] = {}
    for record in records:
        key = _conflict_key(record)
        if key is not None:
            categories_by_key.setdefault(key, set()).add(record.category)
    conflicting_keys = {key for key, categories in categories_by_key.items() if len(categories) > 1}
    normalized: list[EmergencyFoodRecord] = []
    for record in records:
        key = _conflict_key(record)
        if key is None or key not in conflicting_keys:
            normalized.append(record)
            continue
        group_id = hashlib.sha256("\x1f".join(key).encode()).hexdigest()
        normalized.append(
            replace(
                record,
                conflict_status="conflicting",
                conflict_group_id=group_id,
            )
        )
    return tuple(normalized)


def fetch_and_preserve_emergency_food(
    root: Path,
    *,
    clock: Callable[[], datetime],
    opener: Opener | None = None,
    sleeper: Sleeper | None = None,
    expected_feature_count: int | None = OBSERVED_SOURCE_FEATURE_COUNT,
    registry: MethodologyRegistry | None = None,
) -> FetchedEmergencyFood:
    """Fetch the exact ArcGIS query once, validate it, and preserve its response bytes."""

    methodology = registry or load_registry()
    parsed: ParsedEmergencyFoodResponse | None = None

    def validate(content: bytes) -> None:
        nonlocal parsed
        parsed = read_emergency_food_response(
            content,
            expected_feature_count=expected_feature_count,
        )

    if opener is None and sleeper is None:
        content = fetch_bytes(EMERGENCY_FOOD_QUERY_URL, validator=validate)
    elif opener is None:
        content = fetch_bytes(
            EMERGENCY_FOOD_QUERY_URL,
            sleeper=cast(Sleeper, sleeper),
            validator=validate,
        )
    elif sleeper is None:
        content = fetch_bytes(
            EMERGENCY_FOOD_QUERY_URL,
            opener=opener,
            validator=validate,
        )
    else:
        content = fetch_bytes(
            EMERGENCY_FOOD_QUERY_URL,
            opener=opener,
            sleeper=sleeper,
            validator=validate,
        )
    if parsed is None:
        raise AssertionError("emergency-food fetch validator did not parse the response")

    source = next(item for item in methodology.sources if item.key == SOURCE_KEY)
    snapshot = preserve_snapshot(
        root=root,
        pipeline_slug="food-equity",
        source_key=SOURCE_KEY,
        source_url=EMERGENCY_FOOD_QUERY_URL,
        dataset_version=source.vintage,
        content=content,
        schema={
            "fields": [
                {"alias": field.alias, "name": field.name, "type": field.type}
                for field in parsed.fields
            ],
            "geometry_type": parsed.geometry_type,
            "object_id_field": parsed.object_id_field_name,
            "spatial_reference_wkid": parsed.out_sr_wkid,
        },
        row_or_feature_count=len(parsed.features),
        license=source.license_notes,
        methodology_reference=methodology.methodology_version,
        request_metadata={
            "f": "json",
            "orderByFields": "ObjectID ASC",
            "outFields": list(EMERGENCY_FOOD_QUERY_FIELDS),
            "outSR": WGS84_WKID,
            "returnGeometry": True,
            "where": "1=1",
        },
        clock=clock,
    )
    return FetchedEmergencyFood(content=content, response=parsed, snapshot=snapshot)


__all__ = [
    "ARCGIS_ITEM_ID",
    "ArcGisField",
    "EMERGENCY_FOOD_FIELD_SCHEMA",
    "EMERGENCY_FOOD_LAYER_ID",
    "EMERGENCY_FOOD_QUERY_FIELDS",
    "EMERGENCY_FOOD_QUERY_PARAMETERS",
    "EMERGENCY_FOOD_QUERY_URL",
    "EMERGENCY_FOOD_SOURCE_URL",
    "EmergencyFoodRecord",
    "EmergencyFoodSourceError",
    "FetchedEmergencyFood",
    "OBSERVED_SOURCE_FEATURE_COUNT",
    "ParsedEmergencyFoodResponse",
    "RawEmergencyFoodFeature",
    "emergency_food_context_status",
    "fetch_and_preserve_emergency_food",
    "normalize_emergency_food",
    "read_emergency_food_response",
]
