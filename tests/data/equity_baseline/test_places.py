from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from hypothesis import given, strategies as st

from pipelines.equity_baseline.places import (
    CDC_PLACES_DATASET_ID,
    CDC_PLACES_ENDPOINT,
    PLACES_QUERY_LIMIT,
    PlacesGeographyError,
    PlacesSourceError,
    build_places_request,
    fetch_and_preserve_places,
    normalize_places,
)
from pipelines.equity_baseline.registry import load_registry


FIXTURE = Path(__file__).parents[1] / "fixtures/equity_baseline/places/tracts.json"
REGISTRY = load_registry()
EXPECTED_GEOID = "55079000101"
MISSING_GEOID = "55079000201"
PLACES_INDICATORS = tuple(item for item in REGISTRY.indicators if item.source == "places")
MEASURE_TO_SLUG = {
    item.formula.measure_id: item.slug
    for item in PLACES_INDICATORS
    if item.formula.measure_id is not None
}
EXPECTED_MEASURES = tuple(MEASURE_TO_SLUG)


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.body


def fixture_bytes() -> bytes:
    return FIXTURE.read_bytes()


def fixture_rows() -> list[dict[str, str]]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def encoded(rows: object) -> bytes:
    return json.dumps(rows, separators=(",", ":")).encode()


def find(result: object, slug: str, geoid: str = EXPECTED_GEOID) -> object:
    return next(
        item
        for item in result.observations  # type: ignore[attr-defined]
        if item.geoid == geoid and item.indicator_slug == slug
    )


def test_builds_exact_bounded_socrata_query_and_secret_free_manifest() -> None:
    request = build_places_request(REGISTRY)
    query = parse_qs(urlparse(request.url).query)

    assert CDC_PLACES_DATASET_ID == "cwsq-ngmh"
    assert CDC_PLACES_ENDPOINT == "https://data.cdc.gov/resource/cwsq-ngmh.json"
    assert query == {
        "$select": [
            "year,countyfips,locationid,measureid,datavaluetypeid,data_value,"
            "low_confidence_limit,high_confidence_limit,data_value_footnote_symbol,"
            "data_value_footnote"
        ],
        "$where": [
            "countyfips='55079' AND "
            "measureid IN('DIABETES','OBESITY','CASTHMA','DISABILITY','MHLTH','LPA') "
            "AND datavaluetypeid='CrdPrv'"
        ],
        "$order": ["locationid,measureid"],
        "$limit": [str(PLACES_QUERY_LIMIT)],
    }
    assert PLACES_QUERY_LIMIT == 5000
    assert request.manifest_metadata == {
        "dataset_id": "cwsq-ngmh",
        "source_release": "December 2025 PLACES release (2023 estimates)",
        "measure_year": "2023",
        **{key: values[0] for key, values in query.items()},
    }


def test_fetches_once_preserves_exact_bytes_and_sanitized_soql(tmp_path: Path) -> None:
    raw = fixture_bytes()
    requested_urls: list[str] = []

    def opener(request: object) -> FakeResponse:
        requested_urls.append(request.full_url)  # type: ignore[attr-defined]
        return FakeResponse(raw)

    fetched = fetch_and_preserve_places(
        tmp_path,
        clock=lambda: datetime(2026, 8, 28, 12, tzinfo=UTC),
        registry=REGISTRY,
        opener=opener,
        sleeper=lambda _seconds: None,
    )

    assert requested_urls == [build_places_request(REGISTRY).url]
    assert fetched.content == raw
    assert fetched.snapshot.raw_path.read_bytes() == raw
    manifest = json.loads(fetched.snapshot.manifest_path.read_text(encoding="utf-8"))
    assert manifest["row_or_feature_count"] == 6
    assert manifest["request_metadata"]["$order"] == "locationid,measureid"
    assert manifest["request_metadata"]["source_release"].startswith("December 2025")


def test_normalizes_reviewed_live_fixture_with_exact_values_limits_and_provenance() -> None:
    result = normalize_places(
        fixture_bytes(),
        canonical_geoids=(EXPECTED_GEOID,),
        positive_population_geoids=(EXPECTED_GEOID,),
        registry=REGISTRY,
    )

    assert len(result.observations) == 6
    assert {
        item.indicator_slug: (
            item.value,
            item.low_confidence_limit,
            item.high_confidence_limit,
        )
        for item in result.observations
    } == {
        "current_asthma": (Decimal("14.5"), Decimal("13.0"), Decimal("16.0")),
        "diagnosed_diabetes": (Decimal("22.1"), Decimal("20.1"), Decimal("24.0")),
        "any_disability": (Decimal("45.8"), Decimal("42.3"), Decimal("49.2")),
        "no_leisure_time_physical_activity": (
            Decimal("44.2"),
            Decimal("40.1"),
            Decimal("48.0"),
        ),
        "frequent_mental_distress": (Decimal("21.0"), Decimal("18.8"), Decimal("23.1")),
        "obesity": (Decimal("48.8"), Decimal("45.3"), Decimal("52.2")),
    }
    assert all(item.quality_status == "verified" for item in result.observations)
    assert all(item.source_year == "2023" for item in result.observations)
    assert all(
        item.source_release == "December 2025 PLACES release (2023 estimates)"
        for item in result.observations
    )


@pytest.mark.parametrize(
    ("field", "replacement", "message"),
    [
        ("year", "2022", "measure year"),
        ("countyfips", "55025", "county FIPS"),
        ("locationid", "5507900101", "11-digit GEOID"),
        ("locationid", "55025000101", "Milwaukee County"),
        ("measureid", "BPHIGH", "approved measure"),
        ("datavaluetypeid", "AgeAdjPrv", "crude prevalence"),
    ],
)
def test_rejects_wrong_year_geography_measure_or_age_adjustment(
    field: str, replacement: str, message: str
) -> None:
    rows = fixture_rows()
    rows[0][field] = replacement

    with pytest.raises((PlacesSourceError, PlacesGeographyError), match=message):
        normalize_places(
            encoded(rows),
            canonical_geoids=(EXPECTED_GEOID,),
            positive_population_geoids=(EXPECTED_GEOID,),
            registry=REGISTRY,
        )


def test_rejects_duplicate_tract_measure_rows() -> None:
    rows = fixture_rows()
    rows.append(dict(rows[0]))

    with pytest.raises(PlacesSourceError, match="duplicate.*CASTHMA"):
        normalize_places(
            encoded(rows),
            canonical_geoids=(EXPECTED_GEOID,),
            positive_population_geoids=(EXPECTED_GEOID,),
            registry=REGISTRY,
        )


def test_missing_measure_becomes_explicit_missing_not_zero() -> None:
    rows = [row for row in fixture_rows() if row["measureid"] != "LPA"]

    item = find(
        normalize_places(
            encoded(rows),
            canonical_geoids=(EXPECTED_GEOID,),
            positive_population_geoids=(EXPECTED_GEOID,),
            registry=REGISTRY,
        ),
        "no_leisure_time_physical_activity",
    )

    assert item.value is None
    assert item.low_confidence_limit is None
    assert item.high_confidence_limit is None
    assert item.quality_status == "missing"
    assert item.quality_reason == "measure_not_reported"


@pytest.mark.parametrize(
    ("symbol", "footnote"),
    [("*", "Estimate suppressed"), (None, "Unstable estimate"), ("~", None)],
)
def test_footnoted_or_suppressed_values_are_explicitly_missing(
    symbol: str | None, footnote: str | None
) -> None:
    rows = fixture_rows()
    target = next(row for row in rows if row["measureid"] == "DIABETES")
    if symbol is not None:
        target["data_value_footnote_symbol"] = symbol
    if footnote is not None:
        target["data_value_footnote"] = footnote

    item = find(
        normalize_places(
            encoded(rows),
            canonical_geoids=(EXPECTED_GEOID,),
            positive_population_geoids=(EXPECTED_GEOID,),
            registry=REGISTRY,
        ),
        "diagnosed_diabetes",
    )

    assert item.value is None
    assert item.quality_status == "missing"
    assert item.quality_reason == "footnoted_or_suppressed"
    assert item.quality_metadata["footnote_symbol"] == symbol
    assert item.quality_metadata["footnote"] == footnote


@pytest.mark.parametrize(
    ("field", "replacement", "reason"),
    [
        ("data_value", "not-a-number", "invalid_number"),
        ("low_confidence_limit", "not-a-number", "invalid_number"),
        ("high_confidence_limit", "not-a-number", "invalid_number"),
        ("data_value", "-0.1", "value_out_of_range"),
        ("data_value", "100.1", "value_out_of_range"),
        ("low_confidence_limit", "-1", "confidence_interval_out_of_range"),
        ("low_confidence_limit", "101", "confidence_interval_out_of_range"),
        ("high_confidence_limit", "-1", "confidence_interval_out_of_range"),
        ("high_confidence_limit", "101", "confidence_interval_out_of_range"),
        ("low_confidence_limit", "30", "invalid_confidence_interval"),
        ("high_confidence_limit", "10", "invalid_confidence_interval"),
    ],
)
def test_nonnumeric_out_of_range_and_invalid_confidence_intervals_are_invalid(
    field: str, replacement: str, reason: str
) -> None:
    rows = fixture_rows()
    target = next(row for row in rows if row["measureid"] == "DIABETES")
    target[field] = replacement

    item = find(
        normalize_places(
            encoded(rows),
            canonical_geoids=(EXPECTED_GEOID,),
            positive_population_geoids=(EXPECTED_GEOID,),
            registry=REGISTRY,
        ),
        "diagnosed_diabetes",
    )

    assert item.value is None
    assert item.quality_status == "invalid"
    assert item.quality_reason == reason


def test_missing_value_without_footnote_is_missing_not_zero() -> None:
    rows = fixture_rows()
    target = next(row for row in rows if row["measureid"] == "DIABETES")
    target.pop("data_value")

    item = find(
        normalize_places(
            encoded(rows),
            canonical_geoids=(EXPECTED_GEOID,),
            positive_population_geoids=(EXPECTED_GEOID,),
            registry=REGISTRY,
        ),
        "diagnosed_diabetes",
    )

    assert item.value is None
    assert item.quality_status == "missing"
    assert item.quality_reason == "missing_value"


def test_rejects_source_geoids_outside_the_canonical_universe() -> None:
    rows = fixture_rows()
    extra = [dict(row, locationid="55079009999") for row in rows]

    with pytest.raises(PlacesGeographyError, match="extra GEOIDs.*55079009999"):
        normalize_places(
            encoded(rows + extra),
            canonical_geoids=(EXPECTED_GEOID,),
            positive_population_geoids=(EXPECTED_GEOID,),
            registry=REGISTRY,
        )


def test_absent_positive_population_tract_gets_all_six_missing_observations() -> None:
    result = normalize_places(
        fixture_bytes(),
        canonical_geoids=(EXPECTED_GEOID, MISSING_GEOID),
        positive_population_geoids=(EXPECTED_GEOID, MISSING_GEOID),
        registry=REGISTRY,
    )

    missing = [item for item in result.observations if item.geoid == MISSING_GEOID]
    assert len(missing) == 6
    assert all(item.value is None for item in missing)
    assert all(item.quality_status == "missing" for item in missing)
    assert {item.quality_reason for item in missing} == {"tract_not_reported_adult_threshold"}


def test_zero_population_canonical_tract_does_not_require_places_observations() -> None:
    result = normalize_places(
        fixture_bytes(),
        canonical_geoids=(EXPECTED_GEOID, MISSING_GEOID),
        positive_population_geoids=(EXPECTED_GEOID,),
        registry=REGISTRY,
    )

    assert {item.geoid for item in result.observations} == {EXPECTED_GEOID}


@given(order=st.permutations(tuple(range(6))))
def test_input_order_never_changes_output(order: tuple[int, ...]) -> None:
    rows = fixture_rows()
    shuffled = [rows[index] for index in order]

    result = normalize_places(
        encoded(shuffled),
        canonical_geoids=(EXPECTED_GEOID,),
        positive_population_geoids=(EXPECTED_GEOID,),
        registry=REGISTRY,
    )

    assert [(item.geoid, item.indicator_slug) for item in result.observations] == sorted(
        (EXPECTED_GEOID, slug) for slug in MEASURE_TO_SLUG.values()
    )
