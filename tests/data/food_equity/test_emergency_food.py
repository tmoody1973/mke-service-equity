from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

from pipelines.food_equity.emergency_food import (
    ARCGIS_ITEM_ID,
    EMERGENCY_FOOD_LAYER_ID,
    EMERGENCY_FOOD_QUERY_FIELDS,
    EMERGENCY_FOOD_QUERY_PARAMETERS,
    EMERGENCY_FOOD_QUERY_URL,
    EMERGENCY_FOOD_SOURCE_URL,
    OBSERVED_SOURCE_FEATURE_COUNT,
    EmergencyFoodSourceError,
    fetch_and_preserve_emergency_food,
    normalize_emergency_food,
    read_emergency_food_response,
)
from pipelines.food_equity.models import ResourceCategory
from pipelines.food_equity.registry import load_registry


FIXTURE_ROOT = Path(__file__).parents[1] / "fixtures/food_equity/emergency_food"
QUERY_FIXTURE = FIXTURE_ROOT / "query-response.json"
RETRIEVED_AT = datetime(2026, 8, 29, 12, tzinfo=UTC)


def fixture_bytes() -> bytes:
    return QUERY_FIXTURE.read_bytes()


def fixture_json() -> dict[str, object]:
    parsed = json.loads(fixture_bytes())
    assert isinstance(parsed, dict)
    return parsed


def encoded_fixture(value: dict[str, object]) -> bytes:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()


def parse_fixture(content: bytes | None = None):
    return read_emergency_food_response(
        content or fixture_bytes(),
        expected_feature_count=8,
    )


def normalize(
    content: bytes | None = None,
    *,
    reuse_terms_confirmed: bool = False,
    verification_date: date | None = None,
):
    return normalize_emergency_food(
        parse_fixture(content),
        retrieved_at=RETRIEVED_AT,
        reuse_terms_confirmed=reuse_terms_confirmed,
        verification_date=verification_date,
    )


def by_object_id(records, object_id: int):
    matches = [record for record in records if record.object_id == object_id]
    assert len(matches) == 1
    return matches[0]


class FakeResponse:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.content


def test_locks_exact_arcgis_endpoint_query_schema_and_observed_count() -> None:
    assert ARCGIS_ITEM_ID == "303b7e4385a6450fa7d36d76a1ba5a67"
    assert EMERGENCY_FOOD_LAYER_ID == 0
    assert EMERGENCY_FOOD_SOURCE_URL == (
        "https://services5.arcgis.com/3kr3fkJcIf6EOY6g/ArcGIS/rest/services/"
        "EmergencyFood_MKE/FeatureServer/0"
    )
    assert EMERGENCY_FOOD_QUERY_FIELDS == (
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
    assert EMERGENCY_FOOD_QUERY_PARAMETERS == {
        "f": "json",
        "orderByFields": "ObjectID ASC",
        "outFields": ",".join(EMERGENCY_FOOD_QUERY_FIELDS),
        "outSR": "4326",
        "returnGeometry": "true",
        "where": "1=1",
    }
    parsed_url = urlsplit(EMERGENCY_FOOD_QUERY_URL)
    assert f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}" == (
        f"{EMERGENCY_FOOD_SOURCE_URL}/query"
    )
    assert parse_qs(parsed_url.query) == {
        key: [value] for key, value in EMERGENCY_FOOD_QUERY_PARAMETERS.items()
    }
    assert OBSERVED_SOURCE_FEATURE_COUNT == 75


def test_requires_exact_field_names_types_point_geometry_and_wgs84_response() -> None:
    parsed = parse_fixture()

    assert parsed.object_id_field_name == "ObjectID"
    assert parsed.geometry_type == "esriGeometryPoint"
    assert parsed.out_sr_wkid == 4326
    assert [(field.name, field.type, field.alias) for field in parsed.fields] == [
        ("ObjectID", "esriFieldTypeOID", "ObjectID"),
        (
            "USER_Company_Business_Name",
            "esriFieldTypeString",
            "Company/Business Name",
        ),
        ("USER_Address", "esriFieldTypeString", "Address"),
        ("USER_City", "esriFieldTypeString", "City"),
        ("USER_Zip_Code", "esriFieldTypeDouble", "Zip Code"),
        ("USER_Phone_Number", "esriFieldTypeString", "Phone Number"),
        ("USER_Type", "esriFieldTypeString", "Type"),
        ("USER_Notes", "esriFieldTypeString", "Notes"),
        ("USER_Website", "esriFieldTypeString", "Website"),
        ("USER_Service_Area", "esriFieldTypeString", "Service Area"),
    ]


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda value: value["fields"][6].update(name="USER_Category"),
            "schema|field",
        ),
        (
            lambda value: value["fields"][4].update(type="esriFieldTypeString"),
            "schema|type",
        ),
        (
            lambda value: value["fields"][1].update(alias="Company / Business Name"),
            "alias|schema",
        ),
        (
            lambda value: value.update(objectIdFieldName="OID"),
            "ObjectID|object ID|schema",
        ),
        (
            lambda value: value["features"][0]["attributes"].pop("USER_Website"),
            "attributes|schema|USER_Website",
        ),
        (
            lambda value: value.update(geometryType="esriGeometryPolygon"),
            "point|geometry",
        ),
        (
            lambda value: value["spatialReference"].update(wkid=3857, latestWkid=3857),
            "4326|spatial reference",
        ),
        (
            lambda value: value.update(exceededTransferLimit=True),
            "transfer|partial|complete",
        ),
    ],
)
def test_rejects_arcgis_schema_geometry_crs_or_partial_response_drift(mutate, message: str) -> None:
    value = fixture_json()
    mutate(value)

    with pytest.raises(EmergencyFoodSourceError, match=message):
        read_emergency_food_response(encoded_fixture(value), expected_feature_count=8)


def test_accepts_complete_arcgis_response_when_transfer_limit_flag_is_omitted() -> None:
    value = fixture_json()
    value.pop("exceededTransferLimit")

    parsed = read_emergency_food_response(encoded_fixture(value), expected_feature_count=8)

    assert len(parsed.features) == 8


def test_uses_object_id_as_stable_source_identity_and_rejects_duplicates() -> None:
    records = normalize()
    first = by_object_id(records, 101)

    assert first.source_record_id == f"{ARCGIS_ITEM_ID}/{EMERGENCY_FOOD_LAYER_ID}/101"
    assert first.source_key == "emergency_food_context"
    assert first.source_vintage == "data edited 2024-08-07; schema/layer edited 2024-08-27"

    value = fixture_json()
    features = value["features"]
    assert isinstance(features, list)
    duplicate = features[-1]
    assert isinstance(duplicate, dict)
    duplicate_attributes = duplicate["attributes"]
    assert isinstance(duplicate_attributes, dict)
    duplicate_attributes["ObjectID"] = 101
    with pytest.raises(EmergencyFoodSourceError, match="duplicate.*ObjectID|ObjectID.*duplicate"):
        normalize(encoded_fixture(value))


def test_maps_only_exact_allowed_types_via_the_methodology_registry() -> None:
    records = normalize()
    assert {
        by_object_id(records, 101).source_type: by_object_id(records, 101).category,
        by_object_id(records, 102).source_type: by_object_id(records, 102).category,
        by_object_id(records, 103).source_type: by_object_id(records, 103).category,
        by_object_id(records, 104).source_type: by_object_id(records, 104).category,
    } == {
        "Food Bank": ResourceCategory.EMERGENCY_FOOD_BANK,
        "Food Pantry": ResourceCategory.EMERGENCY_FOOD_PANTRY,
        "Food Pantry and Recovery": ResourceCategory.EMERGENCY_PANTRY_RECOVERY,
        "Meal Program": ResourceCategory.EMERGENCY_MEAL_PROGRAM,
    }

    registry = load_registry()
    rules = tuple(
        replace(rule, category=ResourceCategory.UNVERIFIED)
        if rule.source == "emergency_food_context" and rule.source_value == "Food Bank"
        else rule
        for rule in registry.classifications
    )
    synthetic_registry = replace(registry, classifications=rules)
    remapped = normalize_emergency_food(
        parse_fixture(),
        retrieved_at=RETRIEVED_AT,
        reuse_terms_confirmed=False,
        verification_date=None,
        registry=synthetic_registry,
    )
    assert by_object_id(remapped, 101).category is ResourceCategory.UNVERIFIED

    value = fixture_json()
    features = value["features"]
    assert isinstance(features, list)
    feature = features[0]
    assert isinstance(feature, dict)
    attributes = feature["attributes"]
    assert isinstance(attributes, dict)
    attributes["USER_Type"] = "Mobile Pantry"
    with pytest.raises(EmergencyFoodSourceError, match="type|category"):
        normalize(encoded_fixture(value))


@pytest.mark.parametrize("missing_type", [None, ""])
def test_blank_or_null_type_is_retained_as_unverified(missing_type: str | None) -> None:
    value = fixture_json()
    features = value["features"]
    assert isinstance(features, list)
    feature = features[-1]
    assert isinstance(feature, dict)
    attributes = feature["attributes"]
    assert isinstance(attributes, dict)
    attributes["USER_Type"] = missing_type

    record = by_object_id(normalize(encoded_fixture(value)), 108)

    assert record.source_type is None
    assert record.category is ResourceCategory.UNVERIFIED
    assert record.scoring_eligible is False


def test_preserves_source_text_missing_values_and_zip_zero_as_missing() -> None:
    records = normalize()
    pantry = by_object_id(records, 102)
    mobile = by_object_id(records, 105)
    sparse = by_object_id(records, 108)

    assert pantry.zip_code == "53204"
    assert pantry.notes == ("Open Mondays 9 a.m.-noon; bring identification and proof of address.")
    assert pantry.service_area == "Residents of ZIP codes 53204 and 53215"
    assert pantry.website is None
    assert mobile.address is None
    assert mobile.city is None
    assert mobile.zip_code is None
    assert mobile.phone is None
    assert mobile.website is None
    assert mobile.service_area is None
    assert sparse.name is None
    assert sparse.zip_code is None
    assert sparse.source_type is None
    assert sparse.category is ResourceCategory.UNVERIFIED
    assert sparse.notes is None


def test_whitespace_only_partner_text_is_missing_without_rewriting_substantive_text() -> None:
    value = fixture_json()
    features = value["features"]
    assert isinstance(features, list)
    feature = features[0]
    assert isinstance(feature, dict)
    attributes = feature["attributes"]
    assert isinstance(attributes, dict)
    attributes["USER_Notes"] = "   "
    attributes["USER_Service_Area"] = "\n"

    record = by_object_id(normalize(encoded_fixture(value)), 101)

    assert record.notes is None
    assert record.service_area is None


def test_missing_or_invalid_geometry_is_retained_as_unroutable_context() -> None:
    records = normalize()
    fixed = by_object_id(records, 101)
    missing = by_object_id(records, 105)
    invalid = by_object_id(records, 108)

    assert fixed.longitude == Decimal("-87.9065")
    assert fixed.latitude == Decimal("43.0601")
    assert fixed.coordinate_status == "source_coordinate"
    assert fixed.fixed_location is True
    assert missing.longitude is None
    assert missing.latitude is None
    assert missing.coordinate_status == "missing"
    assert missing.fixed_location is False
    assert missing.routing_status == "unroutable_context"
    assert invalid.longitude is None
    assert invalid.latitude is None
    assert invalid.coordinate_status == "invalid"
    assert invalid.fixed_location is False
    assert invalid.routing_status == "unroutable_context"


def test_source_has_unknown_active_and_verification_states_and_no_structured_hours() -> None:
    records = normalize()
    pantry = by_object_id(records, 102)

    assert pantry.active_status == "unknown"
    assert pantry.active is None
    assert pantry.verification_date is None
    assert pantry.operating_hours is None
    assert pantry.hours_status == "missing"
    assert pantry.notes.startswith("Open Mondays")
    assert all(record.scoring_eligible is False for record in records)
    assert all(record.public_redistribution_allowed is False for record in records)
    assert all(record.context_status == "stale_unverified_context" for record in records)


@pytest.mark.parametrize(
    ("reuse_terms_confirmed", "verification_date", "expected"),
    [
        (True, date(2026, 8, 29), "verified_context"),
        (True, date(2026, 5, 31), "verified_context"),
        (True, date(2026, 5, 30), "stale_unverified_context"),
        (True, date(2026, 8, 30), "stale_unverified_context"),
        (True, None, "stale_unverified_context"),
        (False, date(2026, 8, 29), "stale_unverified_context"),
        (False, None, "stale_unverified_context"),
    ],
)
def test_verified_context_requires_confirmed_reuse_and_verification_within_90_days(
    reuse_terms_confirmed: bool,
    verification_date: date | None,
    expected: str,
) -> None:
    records = normalize(
        reuse_terms_confirmed=reuse_terms_confirmed,
        verification_date=verification_date,
    )

    assert {record.context_status for record in records} == {expected}
    assert {record.verification_date for record in records} == {verification_date}


def test_marks_category_conflicts_and_retains_both_records() -> None:
    records = normalize()
    pantry = by_object_id(records, 106)
    meal = by_object_id(records, 107)

    assert pantry.name == "Shared Service Site"
    assert meal.name == "shared service site"
    assert pantry.address == "900 W Center St"
    assert meal.address == "900 w center st"
    assert pantry.category is ResourceCategory.EMERGENCY_FOOD_PANTRY
    assert meal.category is ResourceCategory.EMERGENCY_MEAL_PROGRAM
    assert pantry.conflict_status == "conflicting"
    assert meal.conflict_status == "conflicting"


def test_normalization_is_independent_of_input_order() -> None:
    parsed = parse_fixture()
    forward = normalize_emergency_food(
        parsed,
        retrieved_at=RETRIEVED_AT,
        reuse_terms_confirmed=False,
        verification_date=None,
    )
    reverse = normalize_emergency_food(
        replace(parsed, features=tuple(reversed(parsed.features))),
        retrieved_at=RETRIEVED_AT,
        reuse_terms_confirmed=False,
        verification_date=None,
    )

    assert forward == reverse
    assert [record.object_id for record in forward] == sorted(
        record.object_id for record in forward
    )


def test_fetches_once_preserves_exact_bytes_and_sanitized_query_metadata(tmp_path: Path) -> None:
    content = fixture_bytes()
    calls: list[str] = []

    def opener(request: object) -> FakeResponse:
        calls.append(request.full_url)  # type: ignore[attr-defined]
        return FakeResponse(content)

    fetched = fetch_and_preserve_emergency_food(
        tmp_path,
        clock=lambda: RETRIEVED_AT,
        opener=opener,
        sleeper=lambda _seconds: None,
        expected_feature_count=8,
    )

    assert calls == [EMERGENCY_FOOD_QUERY_URL]
    assert fetched.content == content
    assert fetched.snapshot.raw_path.read_bytes() == content
    assert fetched.snapshot.manifest.row_or_feature_count == 8
    assert fetched.snapshot.manifest.request_metadata == {
        "f": "json",
        "orderByFields": "ObjectID ASC",
        "outFields": list(EMERGENCY_FOOD_QUERY_FIELDS),
        "outSR": 4326,
        "returnGeometry": True,
        "where": "1=1",
    }
    assert fetched.snapshot.manifest.storage_uri.startswith(
        "data/raw/food-equity/emergency_food_context/"
    )
