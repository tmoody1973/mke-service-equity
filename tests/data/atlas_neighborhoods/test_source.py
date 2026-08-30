from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

from pipelines.atlas_neighborhoods import (
    DATASET_VERSION,
    NEIGHBORHOOD_QUERY_URL,
    SCHEMA_FINGERPRINT,
    SOURCE_KEY,
    NeighborhoodSourceError,
    fetch_neighborhood_snapshot,
    normalize_neighborhoods,
    validate_neighborhood_response,
)

FIXTURE = Path(__file__).parents[1] / "fixtures/atlas_neighborhoods/representative.geojson"
RETRIEVED_AT = datetime(2026, 8, 30, 12, tzinfo=UTC)


class FakeResponse:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self, amount: int = -1) -> bytes:
        return self.content if amount < 0 else self.content[:amount]


def test_fixture_validates_and_normalizes_polygon_types() -> None:
    content = FIXTURE.read_bytes()
    records = normalize_neighborhoods(content, expected_count=2)
    assert [record.nbhd_id for record in records] == [1, 2]
    assert records[0].geometry_geojson["type"] == "MultiPolygon"
    assert records[1].geometry_geojson["type"] == "MultiPolygon"
    assert [record.neighborhood for record in records] == ["North Example", "South Example"]
    assert all(record.geometry_wkb_hex.startswith("01060000") for record in records)


def test_locks_exact_query_and_source_identity() -> None:
    parsed = urlsplit(NEIGHBORHOOD_QUERY_URL)
    assert f"{parsed.scheme}://{parsed.netloc}{parsed.path}" == (
        "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/AGO/"
        "neighborhoods/MapServer/0/query"
    )
    assert parse_qs(parsed.query) == {
        "f": ["geojson"],
        "orderByFields": ["NBHD_ID"],
        "outFields": ["OBJECTID,NEIGHBORHD,NBHD_ID"],
        "outSR": ["4326"],
        "returnGeometry": ["true"],
        "where": ["1=1"],
    }
    assert SOURCE_KEY == "milwaukee_dcd_neighborhoods"
    assert DATASET_VERSION == "2000_reference_january_2007_catalog_update"
    assert len(SCHEMA_FINGERPRINT) == 64


@pytest.mark.parametrize(
    "change",
    ["count", "id", "properties", "geometry", "duplicate_nbhd_id", "invalid_coordinate"],
)
def test_schema_and_identity_drift_is_rejected(change: str) -> None:
    document = json.loads(FIXTURE.read_text())
    if change == "count":
        document["features"].pop()
    elif change == "id":
        document["features"][0]["id"] = 99
    elif change == "properties":
        document["features"][0]["properties"]["secret"] = "must not pass"
    elif change == "geometry":
        document["features"][0]["geometry"] = None
    elif change == "duplicate_nbhd_id":
        document["features"][0]["properties"]["NBHD_ID"] = 1
    else:
        document["features"][0]["geometry"]["coordinates"][0][0][0][0] = 999
    with pytest.raises(NeighborhoodSourceError):
        validate_neighborhood_response(json.dumps(document).encode(), expected_count=2)


def test_only_the_documented_land_bank_self_intersection_is_repaired() -> None:
    document = json.loads(FIXTURE.read_text())
    feature = document["features"][0]
    feature["properties"]["NBHD_ID"] = 30
    feature["properties"]["NEIGHBORHD"] = "LAND BANK"
    feature["geometry"] = {
        "type": "Polygon",
        "coordinates": [
            [
                [-88.00, 43.00],
                [-87.99, 43.00],
                [-87.99, 43.01],
                [-88.00, 43.01],
                [-88.00, 43.00],
                [-88.01, 43.00],
                [-88.01, 42.99],
                [-88.00, 42.99],
                [-88.00, 43.00],
            ]
        ],
    }
    content = json.dumps(document).encode()

    records = normalize_neighborhoods(content, expected_count=2)
    assert (
        next(record for record in records if record.nbhd_id == 30).geometry_geojson["type"]
        == "MultiPolygon"
    )

    feature["properties"]["NBHD_ID"] = 31
    with pytest.raises(NeighborhoodSourceError, match="geometry is empty or invalid"):
        normalize_neighborhoods(json.dumps(document).encode(), expected_count=2)


def test_fetch_preserves_exact_bytes_and_complete_sanitized_provenance(tmp_path: Path) -> None:
    content = FIXTURE.read_bytes()
    calls: list[str] = []

    def opener(request: object) -> FakeResponse:
        calls.append(request.full_url)  # type: ignore[attr-defined]
        return FakeResponse(content)

    first = fetch_neighborhood_snapshot(
        tmp_path,
        opener=opener,
        sleeper=lambda _seconds: None,
        clock=lambda: RETRIEVED_AT,
        expected_count=2,
    )
    second = fetch_neighborhood_snapshot(
        tmp_path,
        opener=opener,
        sleeper=lambda _seconds: None,
        clock=lambda: RETRIEVED_AT,
        expected_count=2,
    )

    assert calls == [NEIGHBORHOOD_QUERY_URL, NEIGHBORHOOD_QUERY_URL]
    assert first.content == content
    assert first.snapshot.raw_path.read_bytes() == content
    assert first.snapshot.manifest.row_or_feature_count == 2
    assert first.snapshot.manifest.schema_fingerprint == SCHEMA_FINGERPRINT
    assert first.snapshot.manifest.request_metadata["attribution"] == (
        "City of Milwaukee DCD and ITMD-GIS"
    )
    assert "not updated on an ongoing basis" in str(
        first.snapshot.manifest.request_metadata["limitations"]
    )
    assert first.snapshot.manifest.storage_uri.startswith(
        "data/raw/atlas_neighborhoods/milwaukee_dcd_neighborhoods/"
    )
    assert second.snapshot.reused is True
    serialized = first.snapshot.manifest_path.read_text()
    assert "secret" not in serialized.casefold()
    assert "token" not in serialized.casefold()
