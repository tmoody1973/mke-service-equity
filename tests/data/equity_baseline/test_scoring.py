from __future__ import annotations

import json
from decimal import Decimal
from fractions import Fraction
from pathlib import Path

import pytest
from hypothesis import given, strategies as st

from pipelines.equity_baseline.models import Domain
from pipelines.equity_baseline.registry import load_registry
from pipelines.equity_baseline.scoring import (
    IndicatorInput,
    PopulationInput,
    ScoringError,
    average_rank_percentiles,
    classify_priority_band,
    score_equity_baseline,
)


FIXTURES = Path(__file__).parents[1] / "fixtures/equity_baseline/golden"
REGISTRY = load_registry()
INDICATORS = tuple(REGISTRY.indicators)
SLUGS = tuple(item.slug for item in INDICATORS)


def complete_inputs(
    tract_values: dict[str, Decimal],
) -> tuple[list[PopulationInput], list[IndicatorInput]]:
    populations = [PopulationInput(geoid, Decimal("100")) for geoid in tract_values]
    observations = [
        IndicatorInput(geoid, indicator.slug, value, "verified", {})
        for geoid, value in tract_values.items()
        for indicator in INDICATORS
    ]
    return populations, observations


def golden_inputs() -> tuple[list[PopulationInput], list[IndicatorInput], dict[str, object]]:
    fixture = json.loads((FIXTURES / "input.json").read_text(encoding="utf-8"))
    populations: list[PopulationInput] = []
    observations: list[IndicatorInput] = []
    for tract in fixture["tracts"]:
        geoid = tract["geoid"]
        populations.append(PopulationInput(geoid, Decimal(tract["population"])))
        if "default_value" not in tract:
            continue
        missing = set(tract.get("missing", []))
        quality_overrides = tract.get("quality_overrides", {})
        for indicator in INDICATORS:
            if indicator.slug in missing:
                continue
            observations.append(
                IndicatorInput(
                    geoid,
                    indicator.slug,
                    Decimal(tract["default_value"]),
                    "verified",
                    quality_overrides.get(indicator.slug, {}),
                )
            )
    return populations, observations, fixture


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        ({"a": "1", "b": "2", "c": "3"}, {"a": 0, "b": 50, "c": 100}),
        ({"a": "1", "b": "1", "c": "2"}, {"a": 25, "b": 25, "c": 100}),
        (
            {"a": "1", "b": "2", "c": "2", "d": "3"},
            {"a": 0, "b": 50, "c": 50, "d": 100},
        ),
        (
            {"a": "1", "b": "2", "c": "3", "d": "3"},
            {"a": 0, "b": Fraction(100, 3), "c": Fraction(250, 3), "d": Fraction(250, 3)},
        ),
        ({"a": "4", "b": "4", "c": "4"}, {"a": 50, "b": 50, "c": 50}),
        ({"only": "9"}, {"only": 50}),
    ],
)
def test_average_rank_percentiles_cover_ties_and_singleton(
    values: dict[str, str], expected: dict[str, int | Fraction]
) -> None:
    actual = average_rank_percentiles({key: Decimal(value) for key, value in values.items()})
    assert actual == {key: Fraction(value) for key, value in expected.items()}


def test_rank_is_independent_of_input_order_and_never_uses_geoid_to_break_ties() -> None:
    forward = {"55079000999": Decimal("2"), "55079000001": Decimal("2"), "x": Decimal("1")}
    reverse = dict(reversed(tuple(forward.items())))

    assert average_rank_percentiles(forward) == average_rank_percentiles(reverse)
    assert (
        average_rank_percentiles(forward)["55079000999"]
        == average_rank_percentiles(forward)["55079000001"]
    )


@pytest.mark.parametrize(
    ("percentile", "band"),
    [
        ("0", "Very Low"),
        ("19.999", "Very Low"),
        ("20", "Low"),
        ("39.999", "Low"),
        ("40", "Moderate"),
        ("59.999", "Moderate"),
        ("60", "High"),
        ("79.999", "High"),
        ("80", "Very High"),
        ("100", "Very High"),
    ],
)
def test_exact_fixed_band_boundaries(percentile: str, band: str) -> None:
    assert classify_priority_band(Fraction(Decimal(percentile)), REGISTRY) == band


@pytest.mark.parametrize("percentile", ["-0.0001", "100.0001"])
def test_rejects_percentiles_outside_band_contract(percentile: str) -> None:
    with pytest.raises(ScoringError, match="0 through 100"):
        classify_priority_band(Fraction(Decimal(percentile)), REGISTRY)


def test_strict_completeness_excludes_null_without_redistributing_weights() -> None:
    populations, observations = complete_inputs(
        {"55079000101": Decimal("10"), "55079000102": Decimal("20")}
    )
    observations = [
        item
        for item in observations
        if not (item.geoid == "55079000102" and item.indicator_slug == "people_of_color")
    ]

    with_incomplete = score_equity_baseline(populations, observations, REGISTRY)
    complete_only = score_equity_baseline(populations[:1], observations[:13], REGISTRY)

    excluded = next(score for score in with_incomplete.scores if score.geoid == "55079000102")
    included = next(score for score in with_incomplete.scores if score.geoid == "55079000101")
    assert excluded.exclusion_reasons == ("missing_indicator:people_of_color",)
    assert excluded.status == "insufficient_data"
    assert excluded.composite_score is None
    assert included.final_percentile == Decimal("50.000000000000")
    assert with_incomplete.components == complete_only.components


def test_zero_population_is_ineligible_and_does_not_require_observations() -> None:
    result = score_equity_baseline([PopulationInput("55079000101", Decimal("0"))], [], REGISTRY)
    score = result.scores[0]
    assert score.status == "ineligible_zero_population"
    assert score.exclusion_reasons == ("ineligible_zero_population",)
    assert score.final_percentile is None
    assert result.components == ()


def test_high_uncertainty_valid_value_remains_in_scoring() -> None:
    populations, observations = complete_inputs({"55079000101": Decimal("10")})
    observations[0] = IndicatorInput(
        observations[0].geoid,
        observations[0].indicator_slug,
        observations[0].value,
        "verified",
        {"reliability": "high_uncertainty"},
    )

    result = score_equity_baseline(populations, observations, REGISTRY)

    assert result.scores[0].final_percentile == Decimal("50.000000000000")
    assert result.scores[0].status == "complete"
    assert result.scores[0].band == "Moderate"
    assert result.components[0].quality_metadata["reliability"] == "high_uncertainty"


@pytest.mark.parametrize("quality_status", ["verified", "provisional", "stale"])
def test_database_usable_quality_states_remain_eligible(quality_status: str) -> None:
    populations, observations = complete_inputs({"55079000101": Decimal("10")})
    first = observations[0]
    observations[0] = IndicatorInput(
        first.geoid,
        first.indicator_slug,
        first.value,
        quality_status,
        {},
    )

    result = score_equity_baseline(populations, observations, REGISTRY)

    assert result.scores[0].status == "complete"
    assert result.components[0].quality_status == quality_status


def test_domain_means_use_exact_three_four_six_and_one_third_aggregation() -> None:
    geoids = ("55079000101", "55079000102")
    populations = [PopulationInput(geoid, Decimal("100")) for geoid in geoids]
    observations: list[IndicatorInput] = []
    for indicator in INDICATORS:
        first = Decimal("100") if indicator.domain is Domain.DEMOGRAPHIC else Decimal("0")
        second = Decimal("0") if indicator.domain is Domain.DEMOGRAPHIC else Decimal("100")
        observations.extend(
            [
                IndicatorInput(geoids[0], indicator.slug, first, "verified", {}),
                IndicatorInput(geoids[1], indicator.slug, second, "verified", {}),
            ]
        )

    result = score_equity_baseline(populations, observations, REGISTRY)
    first = next(score for score in result.scores if score.geoid == geoids[0])
    second = next(score for score in result.scores if score.geoid == geoids[1])

    assert first.subindices == {
        Domain.DEMOGRAPHIC: Decimal("100.000000000000"),
        Domain.SOCIOECONOMIC: Decimal("0.000000000000"),
        Domain.HEALTH: Decimal("0.000000000000"),
    }
    assert first.composite_score == Decimal("33.333333333333")
    assert second.composite_score == Decimal("66.666666666667")
    assert (first.final_percentile, second.final_percentile) == (
        Decimal("0.000000000000"),
        Decimal("100.000000000000"),
    )
    assert len([item for item in result.components if item.domain is Domain.DEMOGRAPHIC]) == 6
    assert len([item for item in result.components if item.domain is Domain.SOCIOECONOMIC]) == 8
    assert len([item for item in result.components if item.domain is Domain.HEALTH]) == 12


def test_tied_composites_get_same_final_percentile_and_band() -> None:
    populations, observations = complete_inputs(
        {
            "55079000101": Decimal("10"),
            "55079000102": Decimal("20"),
            "55079000201": Decimal("20"),
        }
    )
    result = score_equity_baseline(populations, observations, REGISTRY)
    tied = [score for score in result.scores if score.geoid != "55079000101"]

    assert {score.final_percentile for score in tied} == {Decimal("75.000000000000")}
    assert {score.band for score in tied} == {"High"}


def test_golden_fixture_exact_trace_and_canonical_hash() -> None:
    populations, observations, _fixture = golden_inputs()
    expected = json.loads((FIXTURES / "expected.json").read_text(encoding="utf-8"))

    result = score_equity_baseline(populations, observations, REGISTRY)

    assert len(result.components) == expected["component_count"]
    for geoid, trace in expected["eligible"].items():
        score = next(item for item in result.scores if item.geoid == geoid)
        tract_components = [item for item in result.components if item.geoid == geoid]
        assert {format(item.percentile, "f") for item in tract_components} == {
            trace["indicator_percentile"]
        }
        assert {domain.value: format(value, "f") for domain, value in score.subindices.items()} == {
            "demographic": trace["demographic"],
            "socioeconomic": trace["socioeconomic"],
            "health": trace["health"],
        }
        for domain in Domain:
            assert {
                format(item.effective_weight, "f")
                for item in tract_components
                if item.domain is domain
            } == {trace[f"{domain.value}_effective_weight"]}
        assert format(score.composite_score, "f") == trace["composite"]
        assert format(score.final_percentile, "f") == trace["final_percentile"]
        assert score.band == trace["band"]
    assert {
        score.geoid: list(score.exclusion_reasons)
        for score in result.scores
        if score.exclusion_reasons
    } == expected["excluded"]
    assert result.canonical_output_hash == expected["canonical_output_hash"]


@given(values=st.lists(st.integers(-(10**6), 10**6), min_size=1, max_size=30))
def test_percentiles_are_bounded_equal_and_monotonic(values: list[int]) -> None:
    source = {str(index): Decimal(value) for index, value in enumerate(values)}
    ranked = average_rank_percentiles(source)

    assert all(Fraction(0) <= value <= Fraction(100) for value in ranked.values())
    for left_key, left_value in source.items():
        for right_key, right_value in source.items():
            if left_value == right_value:
                assert ranked[left_key] == ranked[right_key]
            elif left_value < right_value:
                assert ranked[left_key] <= ranked[right_key]


@given(
    population_order=st.permutations(("55079000101", "55079000102", "55079000201")),
    reverse_observations=st.booleans(),
)
def test_input_permutations_preserve_canonical_output(
    population_order: tuple[str, ...], reverse_observations: bool
) -> None:
    populations, observations = complete_inputs(
        {
            "55079000101": Decimal("10"),
            "55079000102": Decimal("20"),
            "55079000201": Decimal("30"),
        }
    )
    by_geoid = {item.geoid: item for item in populations}
    ordered_populations = [by_geoid[geoid] for geoid in population_order]
    ordered_observations = list(reversed(observations)) if reverse_observations else observations

    actual = score_equity_baseline(ordered_populations, ordered_observations, REGISTRY)
    baseline = score_equity_baseline(populations, observations, REGISTRY)

    assert actual.canonical_output == baseline.canonical_output
    assert actual.canonical_output_hash == baseline.canonical_output_hash
