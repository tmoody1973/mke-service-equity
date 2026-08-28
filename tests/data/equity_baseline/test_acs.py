from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from hypothesis import given, strategies as st

from pipelines.equity_baseline.acs import (
    ACS_2024_5_YEAR_ENDPOINT,
    APPROVED_ACS_GROUPS,
    AcsGeographyError,
    AcsSourceError,
    build_group_request,
    fetch_and_preserve_acs_groups,
    normalize_acs,
    validate_group_metadata,
)
from pipelines.equity_baseline.models import FormulaDefinition
from pipelines.equity_baseline.quality import (
    ReliabilityState,
    coefficient_of_variation,
    proportion_margin_of_error,
    sum_or_difference_margin_of_error,
)
from pipelines.equity_baseline.registry import load_registry


FIXTURE = Path(__file__).parents[1] / "fixtures/equity_baseline/acs/reviewed_formula_case.json"
REGISTRY = load_registry()
ACS_INDICATORS = tuple(item for item in REGISTRY.indicators if item.source == "acs")


def required_estimates_by_group() -> dict[str, set[str]]:
    grouped: dict[str, set[str]] = {group: set() for group in APPROVED_ACS_GROUPS}
    grouped["B01003"].add(REGISTRY.geography.population_variable)
    for indicator in ACS_INDICATORS:
        for variable in indicator.formula.estimate_variables:
            grouped[variable.split("_", 1)[0]].add(variable)
    return grouped


REQUIRED = required_estimates_by_group()


def make_group_response(
    group: str,
    rows: Iterable[tuple[str, Mapping[str, tuple[str | None, str | None]]]],
    *,
    drop_headers: Iterable[str] = (),
    annotations: Mapping[tuple[str, str], tuple[str | None, str | None]] | None = None,
) -> bytes:
    variables = sorted(REQUIRED[group])
    headers = ["NAME"]
    for estimate in variables:
        base = estimate[:-1]
        headers.extend([estimate, f"{base}M", f"{base}EA", f"{base}MA"])
    headers.extend(["state", "county", "tract"])
    dropped = set(drop_headers)
    kept = [header for header in headers if header not in dropped]
    output: list[list[str | None]] = [kept]
    for geoid, values in rows:
        source: dict[str, str | None] = {
            "NAME": f"Census Tract {geoid[-6:-2]}",
            "state": geoid[:2],
            "county": geoid[2:5],
            "tract": geoid[5:],
        }
        for estimate in variables:
            value, moe = values.get(estimate[:-1], ("0", "0"))
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
        output.append([source[header] for header in kept])
    return json.dumps(output, separators=(",", ":")).encode()


def reviewed_responses() -> tuple[dict[str, bytes], dict[str, object]]:
    case = json.loads(FIXTURE.read_text(encoding="utf-8"))
    geoid = case["geoid"]
    responses: dict[str, bytes] = {}
    for group in APPROVED_ACS_GROUPS:
        sparse = {variable: (pair[0], pair[1]) for variable, pair in case["groups"][group].items()}
        responses[group] = make_group_response(group, [(geoid, sparse)])
    return responses, case


def replace_cell(
    responses: Mapping[str, bytes], group: str, variable: str, replacement: object
) -> dict[str, bytes]:
    changed = dict(responses)
    payload = json.loads(responses[group])
    column = payload[0].index(variable)
    payload[1][column] = replacement
    changed[group] = json.dumps(payload, separators=(",", ":")).encode()
    return changed


def observation(result: object, slug: str) -> object:
    return next(item for item in result.observations if item.indicator_slug == slug)  # type: ignore[attr-defined]


class FakeResponse:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.content


def test_builds_one_bounded_group_only_request_without_duplicate_name_or_leaking_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CENSUS_API_KEY", "private-census-key")

    requests = [build_group_request(group) for group in APPROVED_ACS_GROUPS]

    assert len(requests) == len(APPROVED_ACS_GROUPS) == 8
    assert all(request.url.startswith(ACS_2024_5_YEAR_ENDPOINT) for request in requests)
    for group, request in zip(APPROVED_ACS_GROUPS, requests, strict=True):
        query = parse_qs(urlparse(request.url).query)
        assert query == {
            "get": [f"group({group})"],
            "for": ["tract:*"],
            "in": ["state:55 county:079"],
            "key": ["private-census-key"],
        }
        assert request.manifest_metadata == {
            "get": f"group({group})",
            "for": "tract:*",
            "in": "state:55 county:079",
            "group": group,
        }
        assert "key" not in json.dumps(dict(request.manifest_metadata)).lower()


def test_api_key_is_read_only_when_request_is_built(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CENSUS_API_KEY", raising=False)
    without_key = build_group_request("B01003")
    monkeypatch.setenv("CENSUS_API_KEY", "later-key")
    with_key = build_group_request("B01003")

    assert "key=" not in without_key.url
    assert parse_qs(urlparse(with_key.url).query)["key"] == ["later-key"]


def test_fetches_each_group_once_and_preserves_exact_raw_bytes_without_key(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    responses, _case = reviewed_responses()
    requested_groups: list[str] = []
    monkeypatch.setenv("CENSUS_API_KEY", "do-not-store")

    def opener(request: object) -> FakeResponse:
        query = parse_qs(urlparse(request.full_url).query)  # type: ignore[attr-defined]
        group = query["get"][0].removeprefix("group(").removesuffix(")")
        requested_groups.append(group)
        return FakeResponse(responses[group])

    fetched = fetch_and_preserve_acs_groups(
        tmp_path,
        clock=lambda: datetime(2026, 8, 28, 12, tzinfo=UTC),
        registry=REGISTRY,
        opener=opener,
        sleeper=lambda _seconds: None,
    )

    assert requested_groups == list(APPROVED_ACS_GROUPS)
    assert [item.content for item in fetched] == [responses[group] for group in APPROVED_ACS_GROUPS]
    for item in fetched:
        assert item.snapshot.raw_path.read_bytes() == responses[item.group]
        manifest = item.snapshot.manifest_path.read_text(encoding="utf-8")
        assert "do-not-store" not in manifest
        assert '"key"' not in manifest


def test_validates_official_group_metadata_variables_and_group_identity() -> None:
    required = ("B05002_001E", "B05002_013E")
    variables = {
        header: {"group": "B05002"}
        for header in {
            "B05002_001E",
            "B05002_001M",
            "B05002_001EA",
            "B05002_001MA",
            "B05002_013E",
            "B05002_013M",
            "B05002_013EA",
            "B05002_013MA",
        }
    }

    validate_group_metadata("B05002", {"variables": variables}, required_estimates=required)

    variables["B05002_013M"] = {"group": "B01003"}
    with pytest.raises(AcsSourceError, match="unexpected group"):
        validate_group_metadata("B05002", {"variables": variables}, required_estimates=required)


@pytest.mark.parametrize("group", ["B01001", "b01003", "B01003&key=bad"])
def test_rejects_unapproved_groups(group: str) -> None:
    with pytest.raises(AcsSourceError, match="approved ACS group"):
        build_group_request(group)


def test_reviewed_fixture_produces_all_exact_formulas_and_uncertainty() -> None:
    responses, case = reviewed_responses()

    result = normalize_acs(responses, expected_geoids=(case["geoid"],), registry=REGISTRY)

    assert result.populations[0].value == Decimal("1000")
    assert len(result.observations) == 7
    assert {item.indicator_slug: item.value for item in result.observations} == {
        slug: Decimal(value) for slug, value in case["expected_percentages"].items()
    }
    assert {item.margin_of_error for item in result.observations} == {
        Decimal(case["expected_margin_of_error"])
    }
    assert all(item.quality_status == "verified" for item in result.observations)
    assert all(item.reliability is ReliabilityState.RELIABLE for item in result.observations)


@pytest.mark.parametrize(
    ("missing_group", "message"),
    [("B01003", "missing groups"), ("B05002", "missing groups")],
)
def test_rejects_missing_groups(missing_group: str, message: str) -> None:
    responses, case = reviewed_responses()
    responses.pop(missing_group)

    with pytest.raises(AcsSourceError, match=message):
        normalize_acs(responses, expected_geoids=(case["geoid"],), registry=REGISTRY)


def test_rejects_extra_groups() -> None:
    responses, case = reviewed_responses()
    responses["B99999"] = b"[]"

    with pytest.raises(AcsSourceError, match="extra groups"):
        normalize_acs(responses, expected_geoids=(case["geoid"],), registry=REGISTRY)


@pytest.mark.parametrize(
    "header",
    ["state", "county", "tract", "B05002_013E", "B05002_013M", "B05002_013EA", "B05002_013MA"],
)
def test_rejects_missing_geography_variable_or_annotation_headers(header: str) -> None:
    responses, case = reviewed_responses()
    group = "B05002"
    values = {variable: (pair[0], pair[1]) for variable, pair in case["groups"][group].items()}
    responses[group] = make_group_response(group, [(case["geoid"], values)], drop_headers=[header])

    with pytest.raises(AcsSourceError, match="missing required headers"):
        normalize_acs(responses, expected_geoids=(case["geoid"],), registry=REGISTRY)


@pytest.mark.parametrize(
    ("geoids", "expected", "message"),
    [
        (("55079000100",), ("55079000100", "55079000200"), "missing=.*55079000200"),
        (("55079000100", "55079000200"), ("55079000100",), "extra=.*55079000200"),
        (("55079000100", "55079000100"), ("55079000100",), "duplicate=.*55079000100"),
    ],
)
def test_reports_missing_extra_and_duplicate_geoids(
    geoids: tuple[str, ...], expected: tuple[str, ...], message: str
) -> None:
    responses, case = reviewed_responses()
    group = "B01003"
    values = {variable: (pair[0], pair[1]) for variable, pair in case["groups"][group].items()}
    responses[group] = make_group_response(group, [(geoid, values) for geoid in geoids])

    with pytest.raises(AcsGeographyError, match=message):
        normalize_acs(responses, expected_geoids=expected, registry=REGISTRY)


@pytest.mark.parametrize(
    ("replacement", "reason"),
    [
        (None, "missing_estimate"),
        ("", "missing_estimate"),
        ("-666666666", "jam_value"),
        ("-555555555", "jam_value"),
    ],
)
def test_missing_and_census_jam_values_are_null_never_zero(
    replacement: object, reason: str
) -> None:
    responses, case = reviewed_responses()
    responses = replace_cell(responses, "B05002", "B05002_013E", replacement)

    item = observation(
        normalize_acs(responses, expected_geoids=(case["geoid"],), registry=REGISTRY),
        "foreign_born",
    )

    assert item.value is None
    assert item.margin_of_error is None
    assert item.quality_status == "missing"
    assert reason in item.quality_reason


@pytest.mark.parametrize("annotation_header", ["B05002_013EA", "B05002_013MA"])
def test_nonempty_census_annotations_make_component_unusable(annotation_header: str) -> None:
    responses, case = reviewed_responses()
    responses = replace_cell(responses, "B05002", annotation_header, "(X)")

    item = observation(
        normalize_acs(responses, expected_geoids=(case["geoid"],), registry=REGISTRY),
        "foreign_born",
    )

    assert item.value is None
    assert "annotation" in item.quality_reason


def test_missing_margin_of_error_does_not_synthesize_uncertainty() -> None:
    responses, case = reviewed_responses()
    responses = replace_cell(responses, "B05002", "B05002_013M", None)

    item = observation(
        normalize_acs(responses, expected_geoids=(case["geoid"],), registry=REGISTRY),
        "foreign_born",
    )

    assert item.value is None
    assert item.margin_of_error is None
    assert "missing_margin_of_error" in item.quality_reason


@pytest.mark.parametrize("denominator", ["0", "-1"])
def test_nonpositive_denominator_is_explicitly_missing(denominator: str) -> None:
    responses, case = reviewed_responses()
    responses = replace_cell(responses, "B05002", "B05002_001E", denominator)

    item = observation(
        normalize_acs(responses, expected_geoids=(case["geoid"],), registry=REGISTRY),
        "foreign_born",
    )

    assert item.value is None
    assert item.quality_reason == "nonpositive_denominator"


@pytest.mark.parametrize(("numerator", "expected"), [("0", Decimal("0")), ("1000", Decimal("100"))])
def test_zero_and_one_hundred_percent_boundaries_are_valid(
    numerator: str, expected: Decimal
) -> None:
    responses, case = reviewed_responses()
    responses = replace_cell(responses, "B05002", "B05002_013E", numerator)

    item = observation(
        normalize_acs(responses, expected_geoids=(case["geoid"],), registry=REGISTRY),
        "foreign_born",
    )

    assert item.value == expected
    assert item.quality_status == "verified"


def test_percentage_above_one_hundred_is_missing() -> None:
    responses, case = reviewed_responses()
    responses = replace_cell(responses, "B05002", "B05002_013E", "1001")

    item = observation(
        normalize_acs(responses, expected_geoids=(case["geoid"],), registry=REGISTRY),
        "foreign_born",
    )

    assert item.value is None
    assert item.quality_reason == "out_of_range"


def test_sum_and_difference_margin_of_error_use_root_sum_of_squares() -> None:
    assert sum_or_difference_margin_of_error((Decimal("3"), Decimal("4"))) == Decimal("5")


def test_proportion_margin_of_error_uses_approved_formula_and_negative_radicand_fallback() -> None:
    normal = proportion_margin_of_error(
        numerator=Decimal("50"),
        denominator=Decimal("100"),
        numerator_moe=Decimal("10"),
        denominator_moe=Decimal("6"),
    )
    fallback = proportion_margin_of_error(
        numerator=Decimal("50"),
        denominator=Decimal("100"),
        numerator_moe=Decimal("1"),
        denominator_moe=Decimal("10"),
    )

    assert normal == Decimal("91").sqrt() / Decimal("100") * Decimal("100")
    assert fallback == Decimal("26").sqrt() / Decimal("100") * Decimal("100")


@pytest.mark.parametrize(
    ("moe", "state"),
    [
        ("24.675", ReliabilityState.RELIABLE),
        ("24.6750001", ReliabilityState.USE_WITH_CAUTION),
        ("49.35", ReliabilityState.USE_WITH_CAUTION),
        ("49.3500001", ReliabilityState.HIGH_UNCERTAINTY),
    ],
)
def test_cv_thresholds_are_inclusive_at_fifteen_and_thirty(
    moe: str, state: ReliabilityState
) -> None:
    result = coefficient_of_variation(Decimal("100"), Decimal(moe), REGISTRY.reliability)
    assert result.state is state


def test_zero_estimate_has_noncomputable_cv_but_remains_valid() -> None:
    result = coefficient_of_variation(Decimal("0"), Decimal("1"), REGISTRY.reliability)
    assert result.cv is None
    assert result.state is ReliabilityState.CV_NOT_COMPUTABLE


@given(
    denominator=st.integers(min_value=1, max_value=10**9),
    numerator=st.integers(min_value=0, max_value=10**9),
)
def test_valid_source_counts_never_yield_percentage_outside_zero_to_one_hundred(
    denominator: int, numerator: int
) -> None:
    bounded_numerator = numerator % (denominator + 1)
    formula = FormulaDefinition(
        kind=ACS_INDICATORS[2].formula.kind,
        numerator=("X_001E",),
        denominator=("X_002E",),
    )
    from pipelines.equity_baseline.acs import derive_percentage

    value, _numerator, _denominator = derive_percentage(
        formula,
        {"X_001E": Decimal(bounded_numerator), "X_002E": Decimal(denominator)},
    )
    assert Decimal("0") <= value <= Decimal("100")


@given(order=st.permutations(("55079000100", "55079000200", "55079000300")))
def test_source_row_order_never_changes_normalized_output(order: tuple[str, ...]) -> None:
    responses, case = reviewed_responses()
    expected = tuple(sorted(order))
    for group in APPROVED_ACS_GROUPS:
        values = {variable: (pair[0], pair[1]) for variable, pair in case["groups"][group].items()}
        responses[group] = make_group_response(group, [(geoid, values) for geoid in order])

    result = normalize_acs(responses, expected_geoids=expected, registry=REGISTRY)

    assert [item.geoid for item in result.populations] == list(expected)
    assert [(item.geoid, item.indicator_slug) for item in result.observations] == sorted(
        (geoid, indicator.slug) for geoid in expected for indicator in ACS_INDICATORS
    )
