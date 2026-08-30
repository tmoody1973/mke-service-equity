from __future__ import annotations

import hashlib
import inspect
import json
from dataclasses import replace
from decimal import Decimal
from fractions import Fraction
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from hypothesis import given, strategies as st

from pipelines.food_equity.models import BandLabel, Domain
from pipelines.food_equity.registry import load_registry
from pipelines.food_equity.scoring import (
    BaselineRunInput,
    BaselineScoreInput,
    FoodScoringResult,
    MetricInput,
    ScoreInputProvenance,
    ScoringError,
    average_rank_percentiles,
    build_scoring_metric_inputs,
    classify_food_need_band,
    score_food_equity,
)


FIXTURES = Path(__file__).parents[1] / "fixtures/food_equity/golden"
PINNED_RUN_ID = "502e2a04-b013-53cd-8b09-c9144862701a"
PINNED_OUTPUT_HASH = "19069c257e8f51fb4370b1ec8d04c6f823bd85e133846cf504866404c2c4e946"
PINNED_REGISTRY_HASH = "8e31bf6f2d89963d24bb76f2074cafc8848a69ca147e6015cc83716ce5fcbfc2"
PINNED_RUN_FINGERPRINT = "125f23262552c9179d6dae2be69b44b30042ee5bdfdc9c5188087d73b6d531e8"
METRIC_SLUGS = (
    "sram_snap_low_access_share_1mi",
    "full_service_grocery_walk_access",
    "households_no_vehicle",
    "scheduled_transit_service_intensity",
)
SOURCE_KEYS = {
    "acs_vehicle",
    "mcts_gtfs",
    "snap_retailers",
    "sram",
    "tract_origins",
    "walking_network",
}
QUANTUM = Decimal("0.000000000001")


def pinned_baseline_run() -> BaselineRunInput:
    return BaselineRunInput(
        run_id=PINNED_RUN_ID,
        output_hash=PINNED_OUTPUT_HASH,
        methodology_version="equity-baseline-v1",
        registry_hash=PINNED_REGISTRY_HASH,
        run_fingerprint=PINNED_RUN_FINGERPRINT,
        status="validated",
        verified=True,
    )


def valid_provenance() -> ScoreInputProvenance:
    return ScoreInputProvenance(
        source_snapshot_sha256s={
            "acs_vehicle": "1" * 64,
            "mcts_gtfs": "2" * 64,
            "snap_retailers": "3" * 64,
            "sram": "4" * 64,
            "tract_origins": "5" * 64,
            "walking_network": "6" * 64,
        },
        full_service_classification_sha256="7" * 64,
        walking_graph_sha256="8" * 64,
        walking_graph_version="walking-network-v1",
        accessibility_calculation_version="food-accessibility-v1",
        gtfs_projected_stops_sha256="9" * 64,
        gtfs_stop_projection_version="gtfs-stops-epsg3071-v1",
        gtfs_analysis_dates=("2026-09-01", "2026-09-05"),
        gtfs_feed_validity_dates=("2026-08-30", "2026-09-30"),
        gtfs_window_start="10:00:00",
        gtfs_window_end="14:00:00",
    )


def baseline_score(
    geoid: str,
    *,
    score_id: str | None = None,
    population: str = "100",
    status: str = "complete",
    band: str | None = "Moderate",
) -> BaselineScoreInput:
    return BaselineScoreInput(
        geoid=geoid,
        score_id=score_id or f"00000000-0000-0000-0000-0{geoid}",
        population=Decimal(population),
        status=status,
        band=band,
    )


def tract_metrics(
    geoid: str,
    *,
    value: str = "10",
    transit: str = "10",
    grocery_value: str | None = "10",
    grocery_state: str = "observed",
    quality_status: str = "verified",
) -> list[MetricInput]:
    values = {
        "sram_snap_low_access_share_1mi": value,
        "full_service_grocery_walk_access": grocery_value,
        "households_no_vehicle": value,
        "scheduled_transit_service_intensity": transit,
    }
    return [
        MetricInput(
            geoid=geoid,
            metric_slug=slug,
            value=Decimal(raw) if raw is not None else None,
            state=grocery_state if slug == "full_service_grocery_walk_access" else "observed",
            quality_status=quality_status,
            quality_metadata={"source_metric": slug},
        )
        for slug, raw in values.items()
    ]


def score(
    baseline_scores: list[BaselineScoreInput],
    metrics: list[MetricInput],
    *,
    baseline_run: BaselineRunInput | None = None,
    provenance: ScoreInputProvenance | None = None,
) -> FoodScoringResult:
    return score_food_equity(
        baseline_run or pinned_baseline_run(),
        baseline_scores,
        metrics,
        provenance or valid_provenance(),
    )


def golden_inputs() -> tuple[
    BaselineRunInput,
    list[BaselineScoreInput],
    list[MetricInput],
    ScoreInputProvenance,
    dict[str, Any],
]:
    fixture: dict[str, Any] = json.loads((FIXTURES / "input.json").read_text(encoding="utf-8"))
    run = BaselineRunInput(**fixture["baseline_run"])
    provenance = ScoreInputProvenance(
        source_snapshot_sha256s=fixture["provenance"]["source_snapshot_sha256s"],
        full_service_classification_sha256=fixture["provenance"][
            "full_service_classification_sha256"
        ],
        walking_graph_sha256=fixture["provenance"]["walking_graph_sha256"],
        walking_graph_version=fixture["provenance"]["walking_graph_version"],
        accessibility_calculation_version=fixture["provenance"][
            "accessibility_calculation_version"
        ],
        gtfs_projected_stops_sha256=fixture["provenance"]["gtfs_projected_stops_sha256"],
        gtfs_stop_projection_version=fixture["provenance"]["gtfs_stop_projection_version"],
        gtfs_analysis_dates=tuple(fixture["provenance"]["gtfs_analysis_dates"]),
        gtfs_feed_validity_dates=tuple(fixture["provenance"]["gtfs_feed_validity_dates"]),
        gtfs_window_start=fixture["provenance"]["gtfs_window_start"],
        gtfs_window_end=fixture["provenance"]["gtfs_window_end"],
    )
    baseline_scores: list[BaselineScoreInput] = []
    metrics: list[MetricInput] = []
    for tract in fixture["tracts"]:
        baseline_scores.append(
            BaselineScoreInput(
                geoid=tract["geoid"],
                score_id=tract["score_id"],
                population=Decimal(tract["population"]),
                status=tract["baseline_status"],
                band=tract["baseline_band"],
            )
        )
        for slug, (raw, state, quality_status) in tract["metrics"].items():
            metrics.append(
                MetricInput(
                    geoid=tract["geoid"],
                    metric_slug=slug,
                    value=Decimal(raw) if raw is not None else None,
                    state=state,
                    quality_status=quality_status,
                    quality_metadata={"source_metric": slug},
                )
            )
    return run, baseline_scores, metrics, provenance, fixture


def test_api_is_closed_to_scoring_inputs_and_excludes_context_and_investment() -> None:
    assert tuple(inspect.signature(score_food_equity).parameters) == (
        "baseline_run",
        "baseline_scores",
        "metrics",
        "provenance",
        "registry",
    )
    assert set(ScoreInputProvenance.__dataclass_fields__) == {
        "source_snapshot_sha256s",
        "full_service_classification_sha256",
        "walking_graph_sha256",
        "walking_graph_version",
        "accessibility_calculation_version",
        "gtfs_projected_stops_sha256",
        "gtfs_stop_projection_version",
        "gtfs_analysis_dates",
        "gtfs_feed_validity_dates",
        "gtfs_window_start",
        "gtfs_window_end",
    }


def test_source_adapter_splits_reachability_from_quality_and_preserves_transit_zero() -> None:
    geoid = "55079000100"
    unavailable_geoid = "55079000200"
    adapted = build_scoring_metric_inputs(
        [
            SimpleNamespace(
                geoid=geoid,
                population_share_beyond_one_mile=Decimal("12.5"),
                population_beyond_one_mile=125,
                quality_status="verified",
                quality_reason=None,
                source_method="driving_network_based",
                unit="percent",
            )
        ],
        [
            SimpleNamespace(
                geoid=geoid,
                reachable=False,
                walk_minutes=None,
                network_distance_m=None,
                nearest_resource_id=None,
                quality_status="unreachable",
                quality_reason="disconnected_network",
                graph_sha256="8" * 64,
                graph_version="walking-network-v1",
                graph_approved_for_scoring=True,
                thresholds_m=((10, Decimal("804.672")),),
                calculation_version="food-accessibility-v1",
            ),
            SimpleNamespace(
                geoid=unavailable_geoid,
                reachable=None,
                walk_minutes=None,
                network_distance_m=None,
                nearest_resource_id=None,
                quality_status="missing",
                quality_reason="origin_unsnapped",
                graph_sha256="8" * 64,
                graph_version="walking-network-v1",
                graph_approved_for_scoring=True,
                thresholds_m=((10, Decimal("804.672")),),
                calculation_version="food-accessibility-v1",
            ),
        ],
        [
            SimpleNamespace(
                geoid=geoid,
                value=Decimal("21"),
                margin_of_error=Decimal("2"),
                coefficient_of_variation=Decimal("5"),
                reliability="high",
                quality_status="provisional",
                quality_reason="high_uncertainty",
                quality_metadata={"denominator": 100},
            )
        ],
        [
            SimpleNamespace(
                geoid=geoid,
                scheduled_service_intensity=Decimal(0),
                quality_status="verified",
                quality_reason=None,
                analysis_dates=("2026-09-01", "2026-09-05"),
                feed_validity_dates=("2026-08-30", "2026-09-30"),
                gtfs_source_sha256="2" * 64,
                projected_stops_sha256="9" * 64,
                graph_sha256="8" * 64,
                graph_version="walking-network-v1",
                graph_approved_for_scoring=True,
                walk_threshold_m=Decimal("804.672"),
                stop_projection_version="gtfs-stops-epsg3071-v1",
                calculation_version="food-accessibility-v1",
                reachable_stop_ids=(),
            )
        ],
    )

    by_key = {(item.geoid, item.metric_slug): item for item in adapted}
    unreachable = by_key[(geoid, "full_service_grocery_walk_access")]
    missing = by_key[(unavailable_geoid, "full_service_grocery_walk_access")]
    transit = by_key[(geoid, "scheduled_transit_service_intensity")]
    assert unreachable.state == "unreachable"
    assert unreachable.value is None
    assert unreachable.quality_status == "verified"
    assert unreachable.quality_metadata["upstream_access_status"] == "unreachable"
    assert missing.state == "missing"
    assert transit.state == "observed"
    assert transit.value == 0
    assert tuple(inspect.signature(build_scoring_metric_inputs).parameters) == (
        "sram",
        "grocery_access",
        "vehicle_access",
        "transit_access",
    )


def test_average_rank_percentiles_preserve_ties_reverse_direction_and_singletons() -> None:
    values = {
        "a": Decimal("10"),
        "b": Decimal("20"),
        "c": Decimal("20"),
        "d": Decimal("40"),
    }

    assert average_rank_percentiles(values) == {
        "a": Fraction(0),
        "b": Fraction(50),
        "c": Fraction(50),
        "d": Fraction(100),
    }
    assert average_rank_percentiles(values, reverse=True) == {
        "a": Fraction(100),
        "b": Fraction(50),
        "c": Fraction(50),
        "d": Fraction(0),
    }
    assert average_rank_percentiles({"only": Decimal("7")}) == {"only": Fraction(50)}
    assert average_rank_percentiles({}) == {}


@given(values=st.lists(st.integers(-(10**6), 10**6), min_size=1, max_size=25))
def test_rank_percentiles_are_exact_bounded_monotonic_and_permutation_independent(
    values: list[int],
) -> None:
    source = {str(index): Decimal(value) for index, value in enumerate(values)}
    ranked = average_rank_percentiles(source)
    reversed_input = dict(reversed(tuple(source.items())))

    assert ranked == average_rank_percentiles(reversed_input)
    assert all(isinstance(value, Fraction) and 0 <= value <= 100 for value in ranked.values())
    for left_key, left_value in source.items():
        for right_key, right_value in source.items():
            if left_value == right_value:
                assert ranked[left_key] == ranked[right_key]
            elif left_value < right_value:
                assert ranked[left_key] <= ranked[right_key]


@pytest.mark.parametrize(
    ("percentile", "expected"),
    [
        (Fraction(0), "Very Low"),
        (Fraction(19999999999999, 1000000000000), "Very Low"),
        (Fraction(20), "Low"),
        (Fraction(40), "Moderate"),
        (Fraction(60), "High"),
        (Fraction(80), "Very High"),
        (Fraction(100), "Very High"),
    ],
)
def test_food_need_band_boundaries_are_fixed(percentile: Fraction, expected: str) -> None:
    assert classify_food_need_band(percentile) == expected


@pytest.mark.parametrize("percentile", [Fraction(-1), Fraction(101)])
def test_food_need_band_rejects_out_of_bounds(percentile: Fraction) -> None:
    with pytest.raises(ScoringError, match="0 through 100"):
        classify_food_need_band(percentile)


def test_exact_direction_normalization_domains_priority_and_unreachable_ordering() -> None:
    geoids = ("55079000100", "55079000200", "55079000300")
    baseline_scores = [
        baseline_score(geoids[0], band="Very Low"),
        baseline_score(geoids[1], band="Moderate"),
        baseline_score(geoids[2], band="Very High"),
    ]
    metrics = [
        *tract_metrics(geoids[0], value="10", grocery_value="5", transit="10"),
        *tract_metrics(geoids[1], value="20", grocery_value="10", transit="5"),
        *tract_metrics(
            geoids[2],
            value="30",
            grocery_value=None,
            grocery_state="unreachable",
            transit="0",
        ),
    ]

    result = score(baseline_scores, metrics)

    assert [item.geoid for item in result.scores] == list(geoids)
    for geoid, expected_percentile, expected_band, expected_priority in (
        (geoids[0], Decimal("0.000000000000"), "Very Low", 5),
        (geoids[1], Decimal("50.000000000000"), "Moderate", 3),
        (geoids[2], Decimal("100.000000000000"), "Very High", 1),
    ):
        tract = next(item for item in result.scores if item.geoid == geoid)
        assert tract.equity_baseline_score_id == f"00000000-0000-0000-0000-0{geoid}"
        assert tract.status == "complete"
        assert set(tract.domains) == {Domain.RETAIL_ACCESS, Domain.TRANSPORTATION_CONSTRAINT}
        assert set(tract.domains.values()) == {expected_percentile}
        assert tract.raw_food_access_need == expected_percentile
        assert tract.food_access_need_percentile == expected_percentile
        assert tract.food_access_need_band == expected_band
        assert tract.priority == expected_priority

    disconnected = next(
        item
        for item in result.components
        if item.geoid == geoids[2] and item.metric_slug == "full_service_grocery_walk_access"
    )
    transit = {
        item.geoid: item.percentile
        for item in result.components
        if item.metric_slug == "scheduled_transit_service_intensity"
    }
    assert disconnected.raw_value is None
    assert disconnected.state == "unreachable"
    assert disconnected.percentile == Decimal("100.000000000000")
    assert transit == {
        geoids[0]: Decimal("0.000000000000"),
        geoids[1]: Decimal("50.000000000000"),
        geoids[2]: Decimal("100.000000000000"),
    }
    assert {item.effective_weight for item in result.components} == {Decimal("0.250000000000")}


def test_golden_complete_tied_missing_stale_zero_population_and_disconnected_traces() -> None:
    run, baseline_scores, metrics, provenance, fixture = golden_inputs()
    expected = json.loads((FIXTURES / "expected.json").read_text(encoding="utf-8"))

    result = score(baseline_scores, metrics, baseline_run=run, provenance=provenance)

    assert result.score_input_fingerprint == expected["score_input_fingerprint"]
    assert result.canonical_output_hash == expected["canonical_output_hash"]
    assert len(result.components) == expected["component_count"]
    input_by_geoid = {item["geoid"]: item for item in fixture["tracts"]}
    expected_domains = {
        "sram_snap_low_access_share_1mi": Domain.RETAIL_ACCESS,
        "full_service_grocery_walk_access": Domain.RETAIL_ACCESS,
        "households_no_vehicle": Domain.TRANSPORTATION_CONSTRAINT,
        "scheduled_transit_service_intensity": Domain.TRANSPORTATION_CONSTRAINT,
    }
    for geoid, trace in expected["complete"].items():
        tract = next(item for item in result.scores if item.geoid == geoid)
        components = [item for item in result.components if item.geoid == geoid]
        assert [item.metric_slug for item in components] == list(METRIC_SLUGS)
        assert {format(item.percentile, "f") for item in components} == {
            trace["indicator_percentile"]
        }
        for component in components:
            raw, state, quality_status = input_by_geoid[geoid]["metrics"][component.metric_slug]
            assert (
                format(component.raw_value, "f") if component.raw_value is not None else None
            ) == (format(Decimal(raw).quantize(QUANTUM), "f") if raw is not None else None)
            assert component.state == state
            assert component.quality_status == quality_status
            assert component.domain is expected_domains[component.metric_slug]
            assert component.effective_weight == Decimal("0.250000000000")
        assert {domain.value: format(value, "f") for domain, value in tract.domains.items()} == {
            "retail_access": trace["retail_access"],
            "transportation_constraint": trace["transportation_constraint"],
        }
        assert format(tract.raw_food_access_need, "f") == trace["raw_food_access_need"]
        assert (
            format(tract.food_access_need_percentile, "f") == trace["food_access_need_percentile"]
        )
        assert tract.food_access_need_band == trace["food_access_need_band"]
        assert tract.equity_baseline_band == trace["equity_baseline_band"]
        assert tract.priority == trace["priority"]

    assert {
        item.geoid: list(item.exclusion_reasons) for item in result.scores if item.exclusion_reasons
    } == expected["excluded"]
    tied = [item for item in result.scores if item.geoid in {"55079000200", "55079000300"}]
    assert {item.food_access_need_percentile for item in tied} == {Decimal("37.500000000000")}
    stale = next(
        item
        for item in result.components
        if item.geoid == "55079000500" and item.metric_slug == "sram_snap_low_access_share_1mi"
    )
    assert stale.quality_status == "stale"
    disconnected = next(
        item
        for item in result.components
        if item.geoid == "55079000700" and item.metric_slug == "full_service_grocery_walk_access"
    )
    assert disconnected.state == "unreachable"
    assert disconnected.raw_value is None


def test_asymmetric_components_use_exact_registry_domain_and_composite_weights() -> None:
    geoids = tuple(f"55079{index:06d}" for index in range(1, 5))
    values = (
        ("0", "30", "10", "20"),
        ("10", "20", "30", "30"),
        ("20", "10", "20", "0"),
        ("30", "0", "0", "10"),
    )
    metrics = [
        MetricInput(
            geoid=geoid,
            metric_slug=slug,
            value=Decimal(value),
            state="observed",
            quality_status="verified",
            quality_metadata={},
        )
        for geoid, row in zip(geoids, values, strict=True)
        for slug, value in zip(METRIC_SLUGS, row, strict=True)
    ]

    result = score([baseline_score(geoid) for geoid in geoids], metrics)
    expected = {
        geoids[0]: ("50.000000000000", "33.333333333333", "41.666666666667"),
        geoids[1]: ("50.000000000000", "50.000000000000", "50.000000000000"),
        geoids[2]: ("50.000000000000", "83.333333333333", "66.666666666667"),
        geoids[3]: ("50.000000000000", "33.333333333333", "41.666666666667"),
    }
    for tract in result.scores:
        retail, transportation, composite = expected[tract.geoid]
        assert format(tract.domains[Domain.RETAIL_ACCESS], "f") == retail
        assert format(tract.domains[Domain.TRANSPORTATION_CONSTRAINT], "f") == transportation
        assert format(tract.raw_food_access_need, "f") == composite


def test_missing_does_not_become_zero_or_redistribute_weight_and_retains_equity_band() -> None:
    geoid = "55079000100"
    metrics = tract_metrics(geoid)
    metrics[-1] = replace(
        metrics[-1],
        value=None,
        state="missing",
        quality_status="missing",
    )

    result = score([baseline_score(geoid, band="High")], metrics)
    tract = result.scores[0]

    assert result.components == ()
    assert tract.status == "insufficient_data"
    assert tract.exclusion_reasons == ("missing_metric:scheduled_transit_service_intensity",)
    assert tract.domains == {}
    assert tract.raw_food_access_need is None
    assert tract.food_access_need_percentile is None
    assert tract.food_access_need_band is None
    assert tract.equity_baseline_band == "High"
    assert tract.priority is None


def test_zero_population_is_ineligible_and_cannot_enter_any_rank() -> None:
    positive = baseline_score("55079000100", band="Low")
    zero = baseline_score(
        "55079000200",
        population="0",
        status="ineligible_zero_population",
        band=None,
    )
    result = score(
        [positive, zero],
        [*tract_metrics(positive.geoid), *tract_metrics(zero.geoid, value="100", transit="0")],
    )

    complete = next(item for item in result.scores if item.geoid == positive.geoid)
    excluded = next(item for item in result.scores if item.geoid == zero.geoid)
    assert complete.food_access_need_percentile == Decimal("50.000000000000")
    assert excluded.status == "ineligible_zero_population"
    assert excluded.exclusion_reasons == ("ineligible_zero_population",)
    assert all(item.geoid != zero.geoid for item in result.components)


def test_all_25_priority_matrix_cells_are_applied_by_the_scorer() -> None:
    bands = tuple(BandLabel)
    baseline_scores: list[BaselineScoreInput] = []
    metrics: list[MetricInput] = []
    expected_pairs: dict[str, tuple[BandLabel, BandLabel]] = {}
    for index in range(25):
        geoid = f"55079{index + 1:06d}"
        equity_band = bands[index % 5]
        expected_food_band = bands[index // 5]
        baseline_scores.append(baseline_score(geoid, band=equity_band.value))
        metrics.extend(
            tract_metrics(
                geoid,
                value=str(index),
                grocery_value=str(index),
                transit=str(24 - index),
            )
        )
        expected_pairs[geoid] = (equity_band, expected_food_band)

    result = score(baseline_scores, metrics)
    registry = load_registry()

    assert len(result.scores) == 25
    assert {(item.equity_baseline_band, item.food_access_need_band) for item in result.scores} == {
        (equity.value, food.value) for equity in bands for food in bands
    }
    for item in result.scores:
        equity_band, food_band = expected_pairs[item.geoid]
        assert item.priority == registry.priority(equity_band, food_band)


def test_outputs_are_quantized_to_12_places_but_ranks_stay_exact_until_output() -> None:
    geoids = tuple(f"55079000{index}00" for index in range(1, 5))
    result = score(
        [baseline_score(geoid) for geoid in geoids],
        [
            metric
            for index, geoid in enumerate(geoids)
            for metric in tract_metrics(
                geoid,
                value=str(index),
                grocery_value=str(index),
                transit=str(3 - index),
            )
        ],
    )

    assert average_rank_percentiles({geoid: Decimal(index) for index, geoid in enumerate(geoids)})[
        geoids[1]
    ] == Fraction(100, 3)
    decimals = [
        *(item.percentile for item in result.components),
        *(item.effective_weight for item in result.components),
        *(value for item in result.scores for value in item.domains.values()),
        *(item.raw_food_access_need for item in result.scores),
        *(item.food_access_need_percentile for item in result.scores),
    ]
    assert all(
        isinstance(value, Decimal) and value.as_tuple().exponent == -12 for value in decimals
    )
    assert Decimal("33.333333333333") in decimals
    assert Decimal("66.666666666667") in decimals


def test_canonical_output_hash_and_score_input_fingerprint_are_order_invariant() -> None:
    run, baseline_scores, metrics, provenance, _fixture = golden_inputs()
    first = score(baseline_scores, metrics, baseline_run=run, provenance=provenance)
    second = score(
        list(reversed(baseline_scores)),
        list(reversed(metrics)),
        baseline_run=run,
        provenance=provenance,
    )

    assert first == second
    assert first.canonical_output == second.canonical_output
    assert first.canonical_output_hash == hashlib.sha256(first.canonical_output).hexdigest()
    assert first.canonical_output_hash == second.canonical_output_hash
    assert first.score_input_fingerprint == second.score_input_fingerprint
    document = json.loads(first.canonical_output)
    assert document["methodology_version"] == "food-equity-v1"
    assert document["baseline_run"]["run_id"] == PINNED_RUN_ID
    assert [item["geoid"] for item in document["scores"]] == sorted(
        item.geoid for item in first.scores
    )
    serialized = first.canonical_output.decode()
    assert "public_invest" not in serialized
    assert "emergency_food" not in serialized
    assert "retrieved_at" not in serialized


def test_every_score_bearing_input_changes_the_fingerprint() -> None:
    geoid = "55079000100"
    baseline_scores = [baseline_score(geoid)]
    metrics = tract_metrics(geoid)
    provenance = valid_provenance()
    baseline = score(baseline_scores, metrics, provenance=provenance)

    changed_metric = score(
        baseline_scores,
        [replace(metrics[0], value=Decimal("11")), *metrics[1:]],
        provenance=provenance,
    )
    changed_baseline = score(
        [replace(baseline_scores[0], population=Decimal("101"))],
        metrics,
        provenance=provenance,
    )
    changed_sources = dict(provenance.source_snapshot_sha256s)
    changed_sources["sram"] = "a" * 64
    changed_provenance = score(
        baseline_scores,
        metrics,
        provenance=replace(provenance, source_snapshot_sha256s=changed_sources),
    )
    changed_classification = score(
        baseline_scores,
        metrics,
        provenance=replace(provenance, full_service_classification_sha256="b" * 64),
    )
    changed_graph = score(
        baseline_scores,
        metrics,
        provenance=replace(provenance, walking_graph_sha256="c" * 64),
    )
    changed_dates = score(
        baseline_scores,
        metrics,
        provenance=replace(provenance, gtfs_analysis_dates=("2026-09-08", "2026-09-12")),
    )
    changed_projected_stops = score(
        baseline_scores,
        metrics,
        provenance=replace(provenance, gtfs_projected_stops_sha256="d" * 64),
    )
    changed_feed_validity = score(
        baseline_scores,
        metrics,
        provenance=replace(
            provenance,
            gtfs_feed_validity_dates=("2026-08-01", "2026-10-31"),
        ),
    )
    fingerprints = {
        item.score_input_fingerprint
        for item in (
            baseline,
            changed_metric,
            changed_baseline,
            changed_provenance,
            changed_classification,
            changed_graph,
            changed_dates,
            changed_projected_stops,
            changed_feed_validity,
        )
    }
    assert len(fingerprints) == 9


def test_exact_decimal_canonicalization_cannot_collapse_distinct_scoring_inputs() -> None:
    geoids = ("55079000100", "55079000200")
    first_value = Decimal("1.00000000000000000000000000001")
    second_value = Decimal("1.00000000000000000000000000002")
    baseline_scores = [baseline_score(geoid) for geoid in geoids]

    def inputs(left: Decimal, right: Decimal) -> list[MetricInput]:
        rows = [*tract_metrics(geoids[0]), *tract_metrics(geoids[1])]
        rows[1] = replace(rows[1], value=left)
        rows[5] = replace(rows[5], value=right)
        return rows

    first = score(baseline_scores, inputs(first_value, second_value))
    swapped = score(baseline_scores, inputs(second_value, first_value))

    assert first.score_input_fingerprint != swapped.score_input_fingerprint
    assert first.canonical_output_hash != swapped.canonical_output_hash


def test_rejects_forged_registry_rules_even_when_cached_hash_is_retained() -> None:
    registry = load_registry()
    forged = replace(
        registry,
        domain_weights={
            Domain.RETAIL_ACCESS: Decimal("0.75"),
            Domain.TRANSPORTATION_CONSTRAINT: Decimal("0.25"),
        },
    )
    geoid = "55079000100"

    with pytest.raises(ScoringError, match="registry differs"):
        score_food_equity(
            pinned_baseline_run(),
            [baseline_score(geoid)],
            tract_metrics(geoid),
            valid_provenance(),
            forged,
        )


def test_context_and_public_investment_changes_cannot_change_scores_or_fingerprints() -> None:
    run, baseline_scores, metrics, provenance, fixture = golden_inputs()
    before = score(baseline_scores, metrics, baseline_run=run, provenance=provenance)
    fixture["context"]["emergency_food_resource_count"] = 999
    fixture["context"]["public_investments"] = []
    after = score(baseline_scores, metrics, baseline_run=run, provenance=provenance)

    assert before == after
    assert before.score_input_fingerprint == after.score_input_fingerprint
    contextual = MetricInput(
        geoid=baseline_scores[0].geoid,
        metric_slug="emergency_food_count_10_min_context",
        value=Decimal("999"),
        state="observed",
        quality_status="stale_unverified_context",
        quality_metadata={},
    )
    with pytest.raises(ScoringError, match="unknown|contextual|not a scoring metric"):
        score(baseline_scores, [*metrics, contextual], baseline_run=run, provenance=provenance)
    contaminated = replace(
        metrics[0],
        quality_metadata={"public_investment_amount": "500000"},
    )
    with pytest.raises(ScoringError, match="contextual field.*prohibited"):
        score(
            baseline_scores,
            [contaminated, *metrics[1:]],
            baseline_run=run,
            provenance=provenance,
        )


@pytest.mark.parametrize(
    ("field", "replacement", "message"),
    [
        ("run_id", "00000000-0000-0000-0000-000000000000", "pinned.*run"),
        ("output_hash", "0" * 64, "output hash"),
        ("methodology_version", "equity-baseline-v2", "methodology"),
        ("registry_hash", "0" * 64, "registry hash"),
        ("run_fingerprint", "0" * 64, "run fingerprint"),
        ("status", "published", "validated"),
        ("verified", False, "verified"),
    ],
)
def test_rejects_any_mismatch_from_the_pinned_validated_verified_baseline(
    field: str, replacement: object, message: str
) -> None:
    run = replace(pinned_baseline_run(), **{field: replacement})
    geoid = "55079000100"

    with pytest.raises(ScoringError, match=message):
        score([baseline_score(geoid)], tract_metrics(geoid), baseline_run=run)


@pytest.mark.parametrize(
    ("baseline", "message"),
    [
        (baseline_score("55079000100", population="0"), "complete.*positive"),
        (baseline_score("55079000100", band=None), "complete.*band"),
        (baseline_score("55079000100", band="Invented"), "band"),
        (
            baseline_score(
                "55079000100", population="1", status="ineligible_zero_population", band=None
            ),
            "zero.population",
        ),
    ],
)
def test_rejects_inconsistent_baseline_score_states(
    baseline: BaselineScoreInput, message: str
) -> None:
    with pytest.raises(ScoringError, match=message):
        score([baseline], tract_metrics(baseline.geoid))


def test_rejects_duplicate_unknown_and_nonfinite_inputs() -> None:
    geoid = "55079000100"
    baseline = baseline_score(geoid)
    metrics = tract_metrics(geoid)

    with pytest.raises(ScoringError, match="duplicate.*baseline"):
        score([baseline, baseline], metrics)
    with pytest.raises(ScoringError, match="duplicate baseline score ID"):
        score(
            [baseline, baseline_score("55079000200", score_id=baseline.score_id)],
            metrics,
        )
    with pytest.raises(ScoringError, match="score ID.*UUID"):
        score([replace(baseline, score_id="not-a-uuid")], metrics)
    with pytest.raises(ScoringError, match="duplicate.*metric"):
        score([baseline], [*metrics, metrics[0]])
    with pytest.raises(ScoringError, match="unknown GEOID"):
        score([baseline], [*metrics, *tract_metrics("55079009900")])
    with pytest.raises(ScoringError, match="unknown.*metric|not a scoring metric"):
        score(
            [baseline],
            [*metrics, replace(metrics[0], metric_slug="public_investment")],
        )
    with pytest.raises(ScoringError, match="finite"):
        score([replace(baseline, population=Decimal("NaN"))], metrics)
    with pytest.raises(ScoringError, match="finite"):
        score([baseline], [replace(metrics[0], value=Decimal("Infinity")), *metrics[1:]])


@pytest.mark.parametrize(
    ("metric_slug", "value", "message"),
    [
        ("sram_snap_low_access_share_1mi", Decimal("101"), "0 through 100"),
        ("households_no_vehicle", Decimal("-1"), "0 through 100"),
        ("full_service_grocery_walk_access", Decimal("-1"), "nonnegative"),
        ("scheduled_transit_service_intensity", Decimal("-1"), "nonnegative"),
    ],
)
def test_rejects_metric_values_outside_their_exact_units(
    metric_slug: str, value: Decimal, message: str
) -> None:
    geoid = "55079000100"
    metrics = tract_metrics(geoid)
    position = METRIC_SLUGS.index(metric_slug)
    metrics[position] = replace(metrics[position], value=value)

    with pytest.raises(ScoringError, match=message):
        score([baseline_score(geoid)], metrics)


@pytest.mark.parametrize(
    ("metric_slug", "value", "state"),
    [
        ("full_service_grocery_walk_access", Decimal("10"), "unreachable"),
        ("full_service_grocery_walk_access", None, "observed"),
        ("households_no_vehicle", None, "unreachable"),
    ],
)
def test_rejects_impossible_metric_value_state_pairs(
    metric_slug: str, value: Decimal | None, state: str
) -> None:
    geoid = "55079000100"
    metrics = tract_metrics(geoid)
    position = METRIC_SLUGS.index(metric_slug)
    metrics[position] = replace(metrics[position], value=value, state=state)

    with pytest.raises(ScoringError, match="state|unreachable|value"):
        score([baseline_score(geoid)], metrics)


@pytest.mark.parametrize(
    ("state", "quality_status"),
    [("observed", "missing"), ("missing", "suppressed")],
)
def test_rejects_impossible_metric_state_quality_pairs(state: str, quality_status: str) -> None:
    geoid = "55079000100"
    metrics = tract_metrics(geoid)
    metrics[0] = replace(
        metrics[0],
        value=Decimal("10") if state == "observed" else None,
        state=state,
        quality_status=quality_status,
    )

    with pytest.raises(ScoringError, match="quality status"):
        score([baseline_score(geoid)], metrics)


@pytest.mark.parametrize(
    ("source_hashes", "message"),
    [
        ({key: "1" * 64 for key in SOURCE_KEYS - {"sram"}}, "six|missing|source"),
        (
            {**{key: "1" * 64 for key in SOURCE_KEYS}, "emergency_food_context": "2" * 64},
            "six|extra|source",
        ),
        ({**{key: "1" * 64 for key in SOURCE_KEYS}, "sram": "not-a-hash"}, "SHA-256|hash"),
    ],
)
def test_provenance_requires_exactly_six_valid_scoring_source_hashes(
    source_hashes: dict[str, str], message: str
) -> None:
    provenance = replace(valid_provenance(), source_snapshot_sha256s=source_hashes)
    geoid = "55079000100"

    with pytest.raises(ScoringError, match=message):
        score([baseline_score(geoid)], tract_metrics(geoid), provenance=provenance)


@pytest.mark.parametrize(
    ("field", "replacement", "message"),
    [
        ("full_service_classification_sha256", "bad", "SHA-256|hash"),
        ("full_service_classification_sha256", "A" * 64, "SHA-256|hash"),
        ("walking_graph_sha256", "bad", "SHA-256|hash"),
        ("gtfs_projected_stops_sha256", "bad", "SHA-256|hash"),
        ("walking_graph_version", "walking-network-v2", "walking graph version"),
        (
            "accessibility_calculation_version",
            "food-accessibility-v2",
            "accessibility calculation version",
        ),
        (
            "gtfs_stop_projection_version",
            "gtfs-stops-epsg3071-v2",
            "GTFS stop projection version",
        ),
        ("gtfs_analysis_dates", ("2026-09-01",), "Tuesday.*Saturday|dates"),
        (
            "gtfs_analysis_dates",
            ("2026-09-01", "2026-09-12"),
            "same week",
        ),
        (
            "gtfs_feed_validity_dates",
            ("2026-09-02", "2026-09-30"),
            "cover the analysis week",
        ),
        ("gtfs_window_start", "09:00:00", "10:00:00"),
        ("gtfs_window_end", "14:00:01", "14:00:00"),
    ],
)
def test_provenance_locks_classification_graph_and_gtfs_contract(
    field: str, replacement: object, message: str
) -> None:
    provenance = replace(valid_provenance(), **{field: replacement})
    geoid = "55079000100"

    with pytest.raises(ScoringError, match=message):
        score([baseline_score(geoid)], tract_metrics(geoid), provenance=provenance)
