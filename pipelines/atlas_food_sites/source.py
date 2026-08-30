from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

SOURCE_EXPERIENCE_URL = (
    "https://experience.arcgis.com/experience/4883a0957d124294aa236d9e9cc696a5"
)
SOURCE_LAYER_URL = (
    "https://services5.arcgis.com/3kr3fkJcIf6EOY6g/arcgis/rest/services/"
    "Pantries_2026/FeatureServer/57"
)
SOURCE_LAST_EDITED_AT = "2026-03-05T19:55:13Z"
TERMS_URL = "https://doc.arcgis.com/en/arcgis-online/reference/terms-of-use.htm"
ATTRIBUTION = (
    "Data You Can Use, Milwaukee Food Council, and UWM Institute for Systems Change "
    "and Peacebuilding"
)

_TYPE_MAP = {
    "Food Pantry": "food_pantry",
    "Meal Program": "meal_program",
    "Food Bank": "food_bank",
}


class FoodSiteSourceError(ValueError):
    """Raised when the source cannot become the approved display snapshot."""


def _clean_text(value: object, *, field: str, required: bool = False) -> str | None:
    if value is None:
        if required:
            raise FoodSiteSourceError(f"{field} is required")
        return None
    if not isinstance(value, str):
        raise FoodSiteSourceError(f"{field} must be text")
    cleaned = " ".join(value.split())
    if not cleaned:
        if required:
            raise FoodSiteSourceError(f"{field} is required")
        return None
    return cleaned


def _website(value: object) -> str | None:
    cleaned = _clean_text(value, field="website")
    if cleaned is None:
        return None
    parsed = urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise FoodSiteSourceError("website must be an absolute HTTP(S) URL")
    return cleaned


def _phone(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise FoodSiteSourceError("phone must be numeric")
    digits = str(int(value))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if not re.fullmatch(r"\d{10}", digits):
        raise FoodSiteSourceError("phone must contain ten digits, optionally after country code 1")
    return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"


def _zip_code(value: object) -> str:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise FoodSiteSourceError("ZIP code must be numeric")
    digits = str(int(value))
    if not re.fullmatch(r"\d{5}", digits):
        raise FoodSiteSourceError("ZIP code must contain five digits")
    return digits


def _coordinates(value: object) -> list[float]:
    if not isinstance(value, list) or len(value) != 2:
        raise FoodSiteSourceError("coordinates must be one longitude/latitude pair")
    longitude, latitude = value
    if (
        not isinstance(longitude, (int, float))
        or isinstance(longitude, bool)
        or not isinstance(latitude, (int, float))
        or isinstance(latitude, bool)
        or not -180 <= longitude <= 180
        or not -90 <= latitude <= 90
    ):
        raise FoodSiteSourceError("coordinates are outside longitude/latitude bounds")
    return [float(longitude), float(latitude)]


def _normalize_feature(feature: object) -> dict[str, object]:
    if not isinstance(feature, dict) or feature.get("type") != "Feature":
        raise FoodSiteSourceError("each source row must be a GeoJSON Feature")
    geometry = feature.get("geometry")
    properties = feature.get("properties")
    if not isinstance(geometry, dict) or geometry.get("type") != "Point":
        raise FoodSiteSourceError("each food site must have Point geometry")
    if not isinstance(properties, dict):
        raise FoodSiteSourceError("each food site must have properties")

    object_id = properties.get("OBJECTID")
    if not isinstance(object_id, int) or isinstance(object_id, bool) or object_id < 1:
        raise FoodSiteSourceError("OBJECTID must be a positive integer")
    source_type = properties.get("USER_Type")
    if source_type not in _TYPE_MAP:
        raise FoodSiteSourceError(f"unsupported food-site type: {source_type!r}")

    site_id = f"data-you-can-use:pantries-2026:{object_id}"
    return {
        "type": "Feature",
        "id": site_id,
        "geometry": {"type": "Point", "coordinates": _coordinates(geometry.get("coordinates"))},
        "properties": {
            "id": site_id,
            "name": _clean_text(
                properties.get("USER_Company_Business_Name"), field="name", required=True
            ),
            "siteType": _TYPE_MAP[source_type],
            "address": _clean_text(
                properties.get("USER_Address"), field="address", required=True
            ),
            "city": _clean_text(properties.get("USER_City"), field="city", required=True),
            "zipCode": _zip_code(properties.get("USER_ZIP_Code")),
            "phone": _phone(properties.get("USER_Phone_Number")),
            "website": _website(properties.get("USER_Website")),
            "details": _clean_text(properties.get("USER_Notes"), field="details"),
            "serviceArea": _clean_text(
                properties.get("USER_Service_Area"), field="service area"
            ),
            "verificationStatus": "source_listed_check_before_visiting",
        },
    }


def normalize_source_snapshot(
    content: bytes,
    *,
    retrieved_at: datetime | None = None,
) -> dict[str, Any]:
    """Validate and normalize one immutable ArcGIS GeoJSON response for browser display."""
    try:
        source = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise FoodSiteSourceError("source is not valid UTF-8 JSON") from error
    if not isinstance(source, dict) or source.get("type") != "FeatureCollection":
        raise FoodSiteSourceError("source must be a GeoJSON FeatureCollection")
    raw_features = source.get("features")
    if not isinstance(raw_features, list) or not raw_features:
        raise FoodSiteSourceError("source must contain food-site features")

    features = [_normalize_feature(feature) for feature in raw_features]
    ids = [feature["id"] for feature in features]
    if len(set(ids)) != len(ids):
        raise FoodSiteSourceError("source contains a duplicate OBJECTID")

    captured_at = retrieved_at or datetime.now(timezone.utc)
    if captured_at.tzinfo is None:
        raise FoodSiteSourceError("retrieved_at must be timezone-aware")

    return {
        "state": "available",
        "layerId": "food_sites",
        "title": "Food pantries and meal sites",
        "description": (
            "Community food sites listed in the Milwaukee Food Environment Map. "
            "Call or check the provider website before visiting."
        ),
        "affectsScores": False,
        "qualityStatus": "source_listed_check_before_visiting",
        "scoreRunRelationship": "display_context_only_not_part_of_score_run",
        "features": {"type": "FeatureCollection", "features": features},
        "source": {
            "sourceName": "Milwaukee Food Environment Map — Food Pantries and Meal Sites",
            "publisher": "Data You Can Use",
            "collaborators": [
                "Milwaukee Food Council",
                "UWM Institute for Systems Change and Peacebuilding",
            ],
            "datasetVersion": "Pantries 2026, ArcGIS FeatureServer layer 57",
            "sourceUrl": SOURCE_EXPERIENCE_URL,
            "layerUrl": SOURCE_LAYER_URL,
            "retrievedAt": captured_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "sourceLastEditedAt": SOURCE_LAST_EDITED_AT,
            "termsUrl": TERMS_URL,
            "attribution": ATTRIBUTION,
            "sourceSnapshotSha256": hashlib.sha256(content).hexdigest(),
            "featureCount": len(features),
            "limitation": (
                "These are source-listed locations, not independently verified current hours or "
                "availability. Details may have changed; check before visiting. This display layer "
                "does not change Food Access Need, Equity Baseline, or Food Equity Priority."
            ),
        },
    }
