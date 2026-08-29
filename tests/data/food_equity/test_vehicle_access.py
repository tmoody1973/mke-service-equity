from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from hypothesis import given, strategies as st

from pipelines.equity_baseline.quality import ReliabilityState
from pipelines.food_equity.registry import load_registry
from pipelines.food_equity.vehicle_access import (
    ACS_2024_5_YEAR_ENDPOINT,
    ACS_GROUP,
    APPROVED_ESTIMATES,
    CANONICAL_TRACT_COUNT,
    VehicleAccessGeographyError,
    VehicleAccessSourceError,
    build_vehicle_access_request,
    fetch_and_preserve_vehicle_access,
    normalize_vehicle_access,
    validate_group_metadata,
)


FIXTURE = Path(__file__).parents[1] / "fixtures/food_equity/vehicle_access/reviewed.json"
RESPONSE_FIXTURE = (
    Path(__file__).parents[1] / "fixtures/food_equity/vehicle_access/reviewed-response.json"
)
EXPECTED_GEOIDS = ("55079000101", "55079000202", "55079990000")
ESTIMATE_VARIABLES = ("B08201_001E", "B08201_002E")


def make_response(
    rows: Iterable[tuple[str, Mapping[str, tuple[str | None, str | None]]]],
    *,
    drop_headers: Iterable[str] = (),
    annotations: Mapping[tuple[str, str], tuple[str | None, str | None]] | None = None,
    extra_headers: tuple[str, ...] = (),
) -> bytes:
    headers = ["NAME"]
    for estimate in ESTIMATE_VARIABLES:
        base = estimate[:-1]
        headers.extend((estimate, f"{base}M", f"{base}EA", f"{base}MA"))
    headers.extend(extra_headers)
    headers.extend(("state", "county", "tract"))
    dropped = set(drop_headers)
    kept = [header for header in headers if header not in dropped]
    payload: list[list[str | None]] = [kept]
    for geoid, values in rows:
        source: dict[str, str | None] = {
            "NAME": f"Census Tract {geoid[-6:]}",
            "state": geoid[:2],
            "county": geoid[2:5],
            "tract": geoid[5:],
        }
        for estimate in ESTIMATE_VARIABLES:
            value, moe = values[estimate]
            estimate_annotation, moe_annotation = (annotations or {}).get(
                (geoid, estimate), (None, None)
            )
            source.update(
                {
                    estimate: value,
                    f"{estimate[:-1]}M": moe,
                    f"{estimate[:-1]}EA": estimate_annotation,
                    f"{estimate[:-1]}MA": moe_annotation,
                }
            )
        for header in extra_headers:
            source[header] = "official-extra"
        payload.append([source[header] for header in kept])
    return json.dumps(payload, separators=(",", ":")).encode()


def values(
    *,
    denominator: str | None = "100",
    denominator_moe: str | None = "6",
    numerator: str | None = "50",
    numerator_moe: str | None = "10",
) -> dict[str, tuple[str | None, str | None]]:
    return {
        "B08201_001E": (denominator, denominator_moe),
        "B08201_002E": (numerator, numerator_moe),
    }


def response_for(
    geoids: Iterable[str] = EXPECTED_GEOIDS,
    **overrides: str | None,
) -> bytes:
    return make_response((geoid, values(**overrides)) for geoid in geoids)


class FakeResponse:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self, _amount: int = -1) -> bytes:
        return self.content


def test_locks_exact_approved_source_and_variable_contract() -> None:
    assert ACS_2024_5_YEAR_ENDPOINT == "https://api.census.gov/data/2024/acs/acs5"
    assert ACS_GROUP == "B08201"
    assert APPROVED_ESTIMATES == ("B08201_001E", "B08201_002E")
    assert CANONICAL_TRACT_COUNT == 302

    registry = load_registry()
    source = next(item for item in registry.sources if item.key == "acs_vehicle")
    metric = next(item for item in registry.metrics if item.slug == "households_no_vehicle")
    assert source.vintage == "2024 ACS 5-year"
    assert source.dataset_identifier == "acs/acs5/B08201"
    assert source.source_url == ACS_2024_5_YEAR_ENDPOINT
    assert metric.source_fields == (
        "B08201_001E",
        "B08201_001M",
        "B08201_002E",
        "B08201_002M",
    )
    assert metric.unit == "percent"
    assert metric.higher_is_worse is True
    assert all("economic" not in item.slug for item in registry.metrics)


def test_builds_bounded_request_and_never_puts_key_in_manifest_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CENSUS_API_KEY", "private-key")

    request = build_vehicle_access_request()

    assert request.group == ACS_GROUP
    assert request.url.startswith(ACS_2024_5_YEAR_ENDPOINT)
    assert parse_qs(urlparse(request.url).query) == {
        "get": ["group(B08201)"],
        "for": ["tract:*"],
        "in": ["state:55 county:079"],
        "key": ["private-key"],
    }
    assert request.manifest_metadata == {
        "get": "group(B08201)",
        "for": "tract:*",
        "in": "state:55 county:079",
        "group": "B08201",
    }
    assert "key" not in json.dumps(dict(request.manifest_metadata)).casefold()


def test_api_key_is_read_only_when_request_is_built(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CENSUS_API_KEY", raising=False)
    without_key = build_vehicle_access_request()
    monkeypatch.setenv("CENSUS_API_KEY", "later-key")
    with_key = build_vehicle_access_request()

    assert "key=" not in without_key.url
    assert parse_qs(urlparse(with_key.url).query)["key"] == ["later-key"]


def test_validates_official_metadata_for_estimates_moes_and_annotations() -> None:
    headers = {
        estimate
        for variable in ESTIMATE_VARIABLES
        for estimate in (variable, f"{variable[:-1]}M", f"{variable[:-1]}EA", f"{variable[:-1]}MA")
    }
    metadata = {"variables": {header: {"group": ACS_GROUP} for header in headers}}

    validate_group_metadata(metadata)

    del metadata["variables"]["B08201_002MA"]
    with pytest.raises(VehicleAccessSourceError, match="missing variables"):
        validate_group_metadata(metadata)


def test_rejects_metadata_variable_from_another_group() -> None:
    headers = {
        estimate
        for variable in ESTIMATE_VARIABLES
        for estimate in (variable, f"{variable[:-1]}M", f"{variable[:-1]}EA", f"{variable[:-1]}MA")
    }
    metadata = {"variables": {header: {"group": ACS_GROUP} for header in headers}}
    metadata["variables"]["B08201_002M"] = {"group": "B01001"}

    with pytest.raises(VehicleAccessSourceError, match="unexpected group"):
        validate_group_metadata(metadata)


def test_normalizes_reviewed_formula_moe_and_reliability_exactly() -> None:
    case = json.loads(FIXTURE.read_text(encoding="utf-8"))
    result = normalize_vehicle_access(
        make_response(
            [
                (
                    case["geoid"],
                    values(
                        denominator=case["denominator"][0],
                        denominator_moe=case["denominator"][1],
                        numerator=case["numerator"][0],
                        numerator_moe=case["numerator"][1],
                    ),
                )
            ]
        ),
        expected_geoids=(case["geoid"],),
        expected_count=1,
    )

    item = result[0]
    expected_moe = Decimal(case["expected_moe_radicand"]).sqrt()
    expected_cv = (expected_moe / Decimal("1.645")) / Decimal("50") * Decimal("100")
    assert item.geoid == case["geoid"]
    assert item.value == Decimal(case["expected_value"])
    assert item.margin_of_error == expected_moe
    assert item.coefficient_of_variation == expected_cv
    assert item.reliability is ReliabilityState.RELIABLE
    assert item.quality_status == "verified"
    assert item.quality_reason is None
    assert item.quality_metadata == {
        "cv_state": "reliable",
        "source_confidence_level": "90_percent",
    }
    assert item.metric_slug == "households_no_vehicle"
    assert item.unit == "percent"


def test_reviewed_response_fixture_is_sorted_and_preserves_valid_zero() -> None:
    expected_geoids = ("55079000100", "55079000200", "55079000300")

    result = normalize_vehicle_access(
        RESPONSE_FIXTURE.read_bytes(),
        expected_geoids=expected_geoids,
        expected_count=3,
    )

    assert [item.geoid for item in result] == list(expected_geoids)
    assert [item.value for item in result] == [Decimal("20"), Decimal("50"), Decimal("0")]
    assert result[1].margin_of_error == Decimal("26").sqrt()
    assert result[2].reliability is ReliabilityState.CV_NOT_COMPUTABLE


def test_uses_root_sum_fallback_for_negative_moe_radicand() -> None:
    item = normalize_vehicle_access(
        response_for((EXPECTED_GEOIDS[0],), denominator_moe="10", numerator_moe="1"),
        expected_geoids=(EXPECTED_GEOIDS[0],),
        expected_count=1,
    )[0]

    assert item.margin_of_error == Decimal("26").sqrt()


@pytest.mark.parametrize(
    ("moe", "expected_state"),
    [
        ("24.675", ReliabilityState.RELIABLE),
        ("24.6750001", ReliabilityState.USE_WITH_CAUTION),
        ("49.35", ReliabilityState.USE_WITH_CAUTION),
        ("49.3500001", ReliabilityState.HIGH_UNCERTAINTY),
    ],
)
def test_cv_thresholds_are_inclusive_and_high_uncertainty_keeps_value(
    moe: str, expected_state: ReliabilityState
) -> None:
    item = normalize_vehicle_access(
        response_for(
            (EXPECTED_GEOIDS[0],),
            denominator="100",
            denominator_moe="0",
            numerator="100",
            numerator_moe=moe,
        ),
        expected_geoids=(EXPECTED_GEOIDS[0],),
        expected_count=1,
    )[0]

    assert item.value == Decimal("100")
    assert item.reliability is expected_state
    assert item.quality_status == "verified"


def test_observed_zero_retains_moe_and_has_noncomputable_cv() -> None:
    item = normalize_vehicle_access(
        response_for((EXPECTED_GEOIDS[0],), numerator="0", numerator_moe="3"),
        expected_geoids=(EXPECTED_GEOIDS[0],),
        expected_count=1,
    )[0]

    assert item.value == 0
    assert item.margin_of_error == Decimal("3")
    assert item.coefficient_of_variation is None
    assert item.reliability is ReliabilityState.CV_NOT_COMPUTABLE
    assert item.quality_status == "verified"


@pytest.mark.parametrize(
    ("variable", "replacement", "reason"),
    [
        ("B08201_002E", None, "missing_estimate:B08201_002E"),
        ("B08201_002E", "", "missing_estimate:B08201_002E"),
        ("B08201_002E", "null", "missing_estimate:B08201_002E"),
        ("B08201_002E", "-666666666", "jam_value:B08201_002E"),
        ("B08201_002E", "not-a-number", "invalid_number:B08201_002E"),
        ("B08201_002M", None, "missing_margin_of_error:B08201_002E"),
        ("B08201_002M", "-1", "jam_value:B08201_002E"),
    ],
)
def test_unusable_cells_are_missing_never_zero(
    variable: str, replacement: str | None, reason: str
) -> None:
    payload = json.loads(response_for((EXPECTED_GEOIDS[0],)))
    payload[1][payload[0].index(variable)] = replacement

    item = normalize_vehicle_access(
        json.dumps(payload).encode(),
        expected_geoids=(EXPECTED_GEOIDS[0],),
        expected_count=1,
    )[0]

    assert item.value is None
    assert item.margin_of_error is None
    assert item.coefficient_of_variation is None
    assert item.reliability is None
    assert item.quality_status == "missing"
    assert item.quality_reason == reason


@pytest.mark.parametrize(
    ("header", "reason"),
    [
        ("B08201_001EA", "estimate_annotation:B08201_001E"),
        ("B08201_001MA", "margin_of_error_annotation:B08201_001E"),
        ("B08201_002EA", "estimate_annotation:B08201_002E"),
        ("B08201_002MA", "margin_of_error_annotation:B08201_002E"),
    ],
)
def test_annotations_make_the_observation_missing(header: str, reason: str) -> None:
    estimate = f"{header[:-2]}E"
    annotation_pair = ("(X)", None) if header.endswith("EA") else (None, "(X)")
    content = make_response(
        [(EXPECTED_GEOIDS[0], values())],
        annotations={(EXPECTED_GEOIDS[0], estimate): annotation_pair},
    )

    item = normalize_vehicle_access(
        content,
        expected_geoids=(EXPECTED_GEOIDS[0],),
        expected_count=1,
    )[0]

    assert item.value is None
    assert item.quality_reason == reason


@pytest.mark.parametrize(
    ("denominator", "numerator", "expected_value", "reason"),
    [
        ("0", "0", None, "nonpositive_denominator"),
        ("-1", "0", None, "nonpositive_denominator"),
        ("100", "-1", None, "out_of_range"),
        ("100", "101", None, "out_of_range"),
        ("100", "0", Decimal("0"), None),
        ("100", "100", Decimal("100"), None),
    ],
)
def test_denominator_and_percentage_bounds(
    denominator: str, numerator: str, expected_value: Decimal | None, reason: str | None
) -> None:
    item = normalize_vehicle_access(
        response_for((EXPECTED_GEOIDS[0],), denominator=denominator, numerator=numerator),
        expected_geoids=(EXPECTED_GEOIDS[0],),
        expected_count=1,
    )[0]

    assert item.value == expected_value
    assert item.quality_reason == reason


@given(
    denominator=st.integers(min_value=1, max_value=10**9),
    numerator=st.integers(min_value=0, max_value=10**9),
)
def test_valid_count_inputs_never_leave_percentage_bounds(denominator: int, numerator: int) -> None:
    bounded = numerator % (denominator + 1)
    item = normalize_vehicle_access(
        response_for(
            (EXPECTED_GEOIDS[0],),
            denominator=str(denominator),
            denominator_moe="0",
            numerator=str(bounded),
            numerator_moe="0",
        ),
        expected_geoids=(EXPECTED_GEOIDS[0],),
        expected_count=1,
    )[0]

    assert item.value is not None
    assert Decimal("0") <= item.value <= Decimal("100")


@pytest.mark.parametrize(
    "header",
    [
        "NAME",
        "state",
        "county",
        "tract",
        "B08201_001E",
        "B08201_001M",
        "B08201_001EA",
        "B08201_001MA",
        "B08201_002E",
        "B08201_002M",
        "B08201_002EA",
        "B08201_002MA",
    ],
)
def test_rejects_missing_required_headers_but_accepts_official_extras(header: str) -> None:
    with pytest.raises(VehicleAccessSourceError, match="missing required headers"):
        normalize_vehicle_access(
            make_response([(EXPECTED_GEOIDS[0], values())], drop_headers=(header,)),
            expected_geoids=(EXPECTED_GEOIDS[0],),
            expected_count=1,
        )

    result = normalize_vehicle_access(
        make_response([(EXPECTED_GEOIDS[0], values())], extra_headers=("B08201_003E",)),
        expected_geoids=(EXPECTED_GEOIDS[0],),
        expected_count=1,
    )
    assert len(result) == 1


@pytest.mark.parametrize(
    ("content", "message"),
    [
        (b"not json", "valid JSON"),
        (b"[]", "header and data rows"),
        (b'[["NAME"],[1]]', "strings or null"),
        (b'[["NAME",null],["x","y"]]', "null header"),
        (b'[["NAME","NAME"],["x","y"]]', "duplicate headers"),
    ],
)
def test_rejects_malformed_response_shapes(content: bytes, message: str) -> None:
    with pytest.raises(VehicleAccessSourceError, match=message):
        normalize_vehicle_access(
            content,
            expected_geoids=(EXPECTED_GEOIDS[0],),
            expected_count=1,
        )


def test_rejects_wrong_row_width_and_invalid_source_geoid() -> None:
    payload = json.loads(response_for((EXPECTED_GEOIDS[0],)))
    payload[1].pop()
    with pytest.raises(VehicleAccessSourceError, match="wrong width"):
        normalize_vehicle_access(
            json.dumps(payload).encode(),
            expected_geoids=(EXPECTED_GEOIDS[0],),
            expected_count=1,
        )

    with pytest.raises(VehicleAccessGeographyError, match="invalid GEOID"):
        normalize_vehicle_access(
            response_for(("bad",)),
            expected_geoids=(EXPECTED_GEOIDS[0],),
            expected_count=1,
        )


@pytest.mark.parametrize(
    ("source_geoids", "expected_geoids", "message"),
    [
        ((EXPECTED_GEOIDS[0],), EXPECTED_GEOIDS[:2], "missing=.*55079000202"),
        (EXPECTED_GEOIDS[:2], (EXPECTED_GEOIDS[0],), "extra=.*55079000202"),
        (
            (EXPECTED_GEOIDS[0], EXPECTED_GEOIDS[0]),
            (EXPECTED_GEOIDS[0],),
            "duplicate=.*55079000101",
        ),
    ],
)
def test_rejects_missing_extra_and_duplicate_source_geoids(
    source_geoids: tuple[str, ...], expected_geoids: tuple[str, ...], message: str
) -> None:
    with pytest.raises(VehicleAccessGeographyError, match=message):
        normalize_vehicle_access(
            response_for(source_geoids),
            expected_geoids=expected_geoids,
            expected_count=len(expected_geoids),
        )


@pytest.mark.parametrize(
    ("expected_geoids", "expected_count", "message"),
    [
        ((EXPECTED_GEOIDS[0],), 302, "exactly 302"),
        ((EXPECTED_GEOIDS[0], EXPECTED_GEOIDS[0]), 2, "duplicate canonical"),
        (("bad",), 1, "11 digits in Milwaukee County"),
        (("55059000100",), 1, "11 digits in Milwaukee County"),
    ],
)
def test_rejects_invalid_canonical_universe(
    expected_geoids: tuple[str, ...], expected_count: int, message: str
) -> None:
    with pytest.raises(VehicleAccessGeographyError, match=message):
        normalize_vehicle_access(
            response_for((EXPECTED_GEOIDS[0],)),
            expected_geoids=expected_geoids,
            expected_count=expected_count,
        )


def test_output_is_one_per_canonical_tract_and_source_order_invariant() -> None:
    first = normalize_vehicle_access(
        response_for(reversed(EXPECTED_GEOIDS)),
        expected_geoids=EXPECTED_GEOIDS,
        expected_count=3,
    )
    second = normalize_vehicle_access(
        response_for(EXPECTED_GEOIDS),
        expected_geoids=reversed(EXPECTED_GEOIDS),
        expected_count=3,
    )

    assert first == second
    assert [item.geoid for item in first] == list(EXPECTED_GEOIDS)
    assert {item.metric_slug for item in first} == {"households_no_vehicle"}


def test_fetches_once_and_preserves_exact_bytes_without_credential(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    content = response_for()
    calls: list[str] = []
    monkeypatch.setenv("CENSUS_API_KEY", "do-not-store")

    def opener(request: object) -> FakeResponse:
        calls.append(request.full_url)  # type: ignore[attr-defined]
        return FakeResponse(content)

    fetched = fetch_and_preserve_vehicle_access(
        tmp_path,
        clock=lambda: datetime(2026, 8, 29, 12, tzinfo=UTC),
        opener=opener,
        sleeper=lambda _seconds: None,
    )

    assert len(calls) == 1
    assert fetched.content == content
    assert fetched.snapshot.raw_path.read_bytes() == content
    assert "data/raw/food-equity/acs_vehicle/" in fetched.snapshot.manifest.storage_uri
    assert fetched.snapshot.manifest.source_key == "acs_vehicle"
    assert fetched.snapshot.manifest.dataset_version == "2024 ACS 5-year"
    assert fetched.snapshot.manifest.row_or_feature_count == 3
    assert fetched.snapshot.manifest.request_metadata == {
        "for": "tract:*",
        "get": "group(B08201)",
        "group": "B08201",
        "in": "state:55 county:079",
    }
    manifest = fetched.snapshot.manifest_path.read_text(encoding="utf-8")
    assert "do-not-store" not in manifest
    assert '"key"' not in manifest
