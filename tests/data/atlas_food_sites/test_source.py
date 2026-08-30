from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone

import pytest

from pipelines.atlas_food_sites.source import FoodSiteSourceError, normalize_source_snapshot


def _source_feature(**property_overrides: object) -> dict[str, object]:
    properties: dict[str, object] = {
        "OBJECTID": 18,
        "Loc_name": "Local",
        "USER_Company_Business_Name": " All Saints Catholic Church ",
        "USER_Notes": " Pantry: Tuesday and Thursday\r\n ",
        "USER_Type": "Food Pantry",
        "USER_Phone_Number": 4144445610,
        "USER_Address": "4060 N. 26th St.",
        "USER_City": "Milwaukee",
        "USER_ZIP_Code": 53209,
        "USER_Website": "https://example.org/pantry\r\n",
        "USER_Service_Area": None,
    }
    properties.update(property_overrides)
    return {
        "type": "Feature",
        "id": 18,
        "geometry": {"type": "Point", "coordinates": [-87.947, 43.09]},
        "properties": properties,
    }


def _source_bytes(features: list[dict[str, object]]) -> bytes:
    return json.dumps({"type": "FeatureCollection", "features": features}).encode()


def test_normalizes_a_strict_browser_safe_snapshot_with_provenance() -> None:
    content = _source_bytes([_source_feature()])

    result = normalize_source_snapshot(
        content,
        retrieved_at=datetime(2026, 8, 30, 19, 17, 48, tzinfo=timezone.utc),
    )

    assert result["affectsScores"] is False
    assert result["scoreRunRelationship"] == "display_context_only_not_part_of_score_run"
    assert result["qualityStatus"] == "source_listed_check_before_visiting"
    assert result["source"]["sourceSnapshotSha256"] == hashlib.sha256(content).hexdigest()
    assert result["source"]["attribution"] == (
        "Data You Can Use, Milwaukee Food Council, and UWM Institute for Systems Change "
        "and Peacebuilding"
    )
    assert result["features"] == {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "data-you-can-use:pantries-2026:18",
                "geometry": {"type": "Point", "coordinates": [-87.947, 43.09]},
                "properties": {
                    "id": "data-you-can-use:pantries-2026:18",
                    "name": "All Saints Catholic Church",
                    "siteType": "food_pantry",
                    "address": "4060 N. 26th St.",
                    "city": "Milwaukee",
                    "zipCode": "53209",
                    "phone": "414-444-5610",
                    "website": "https://example.org/pantry",
                    "details": "Pantry: Tuesday and Thursday",
                    "serviceArea": None,
                    "verificationStatus": "source_listed_check_before_visiting",
                },
            }
        ],
    }


def test_normalizes_a_leading_us_country_code_in_the_numeric_phone_field() -> None:
    content = _source_bytes([_source_feature(USER_Phone_Number=14144445610)])

    result = normalize_source_snapshot(content)

    assert result["features"]["features"][0]["properties"]["phone"] == "414-444-5610"


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"OBJECTID": None}, "OBJECTID"),
        ({"USER_Company_Business_Name": " "}, "name"),
        ({"USER_Type": "Grocery"}, "type"),
        ({"USER_Website": "javascript:alert(1)"}, "website"),
    ],
)
def test_rejects_invalid_source_values(overrides: dict[str, object], message: str) -> None:
    content = _source_bytes([_source_feature(**overrides)])

    with pytest.raises(FoodSiteSourceError, match=message):
        normalize_source_snapshot(content)


def test_rejects_duplicate_object_ids_and_invalid_coordinates() -> None:
    duplicate = _source_feature()
    with pytest.raises(FoodSiteSourceError, match="duplicate"):
        normalize_source_snapshot(_source_bytes([duplicate, duplicate]))

    invalid = _source_feature()
    invalid["geometry"] = {"type": "Point", "coordinates": [-200, 43.09]}
    with pytest.raises(FoodSiteSourceError, match="coordinates"):
        normalize_source_snapshot(_source_bytes([invalid]))
