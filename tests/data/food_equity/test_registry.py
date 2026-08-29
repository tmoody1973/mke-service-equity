from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from pipelines.food_equity.errors import RegistryValidationError
from pipelines.food_equity.models import (
    BandLabel,
    Domain,
    MetricTreatment,
    ResourceCategory,
    SourceRole,
)
from pipelines.food_equity.registry import REGISTRY_PATH, load_registry, registry_sha256


def _mutated_registry(tmp_path: Path, old: str, new: str, *, count: int = 1) -> Path:
    content = REGISTRY_PATH.read_text(encoding="utf-8")
    assert content.count(old) >= count
    path = tmp_path / "registry.toml"
    path.write_text(content.replace(old, new, count), encoding="utf-8")
    return path


def test_registry_locks_the_approved_sources_and_roles() -> None:
    registry = load_registry()
    sources = {source.key: source for source in registry.sources}

    assert registry.methodology_version == "food-equity-v1"
    assert set(sources) == {
        "acs_vehicle",
        "emergency_food_context",
        "equity_baseline",
        "mcts_gtfs",
        "snap_retailers",
        "sram",
        "tract_origins",
        "walking_network",
    }
    assert sources["sram"].dataset_identifier == "2025-sram"
    assert sources["snap_retailers"].vintage == "current through 2025-12-31"
    assert sources["walking_network"].published_checksum == ("md5:87c18ce0608499afd91ed0f2a5ee8eef")
    assert sources["mcts_gtfs"].freshness_policy == "service_dates"
    assert sources["emergency_food_context"].role is SourceRole.CONTEXTUAL
    assert sources["emergency_food_context"].max_age_days == 90
    assert all(
        source.role is SourceRole.SCORING
        for key, source in sources.items()
        if key != "emergency_food_context"
    )


def test_registry_locks_taxonomy_metrics_weights_and_directions() -> None:
    registry = load_registry()
    metrics = {metric.slug: metric for metric in registry.metrics}
    classifications = {item.source_value: item for item in registry.classifications}

    assert set(metrics) == {
        "emergency_food_access_context",
        "full_service_grocery_counts_context",
        "full_service_grocery_walk_access",
        "households_no_vehicle",
        "scheduled_transit_service_intensity",
        "sram_snap_low_access_share_1mi",
    }
    assert registry.domain_weights == {
        Domain.RETAIL_ACCESS: Decimal("0.5"),
        Domain.TRANSPORTATION_CONSTRAINT: Decimal("0.5"),
    }
    assert metrics["sram_snap_low_access_share_1mi"].weight == Decimal("0.5")
    assert metrics["sram_snap_low_access_share_1mi"].higher_is_worse is True
    assert metrics["full_service_grocery_walk_access"].weight == Decimal("0.5")
    assert metrics["households_no_vehicle"].weight == Decimal("0.5")
    assert metrics["scheduled_transit_service_intensity"].weight == Decimal("0.5")
    assert metrics["scheduled_transit_service_intensity"].higher_is_worse is False
    assert metrics["emergency_food_access_context"].treatment is MetricTreatment.CONTEXTUAL
    assert metrics["emergency_food_access_context"].domain is None
    assert classifications["Supermarket"].category is ResourceCategory.FULL_SERVICE_GROCERY
    assert classifications["Large Grocery Store"].category is (
        ResourceCategory.FULL_SERVICE_GROCERY
    )
    assert classifications["Super Store/Chain Store"].requires_override is True
    assert classifications["Military Commissary"].scoring_eligible is False


def test_registry_locks_access_completeness_bands_and_priority_matrix() -> None:
    registry = load_registry()

    assert registry.completeness_rule == "all_required"
    assert registry.tie_method == "average"
    assert registry.single_geography_percentile == Decimal("50")
    assert registry.access.origin_source == "tract_origins"
    assert registry.access.projected_crs == "EPSG:3071"
    assert registry.access.review_buffer_miles == Decimal("2")
    assert registry.access.snap_tolerance_m == Decimal("200")
    assert registry.access.walk_speed_m_per_minute == Decimal("80.4672")
    assert registry.access.walk_threshold_minutes == (10, 15, 20)
    assert registry.access.transit_window_start == "10:00:00"
    assert registry.access.transit_window_end == "14:00:00"
    assert registry.access.transit_weekdays == ("tuesday", "saturday")
    assert tuple(band.label for band in registry.bands) == tuple(BandLabel)
    assert len(registry.priority_matrix) == 25
    assert registry.priority(BandLabel.VERY_HIGH, BandLabel.VERY_HIGH) == 1
    assert registry.priority(BandLabel.VERY_HIGH, BandLabel.HIGH) == 1
    assert registry.priority(BandLabel.HIGH, BandLabel.HIGH) == 2
    assert registry.priority(BandLabel.VERY_LOW, BandLabel.VERY_LOW) == 5


def test_registry_sha256_hashes_exact_committed_bytes() -> None:
    registry = load_registry()

    assert registry.sha256 == registry_sha256()
    assert registry.sha256 == registry_sha256(REGISTRY_PATH)
    assert len(registry.sha256) == 64


@pytest.mark.parametrize(
    ("old", "new", "message"),
    [
        ('key = "sram"', 'key = "snap_retailers"', "duplicate source key"),
        ('source = "sram"', 'source = "not_approved"', "unknown source"),
        ('category = "full_service_grocery"', 'category = "invented"', "unknown category"),
        ('weight = "0.5"', 'weight = "0.6"', "weights must sum to 1"),
        ('minimum = "20"', 'minimum = "21"', "bands have a gap"),
        (
            'slug = "sram_snap_low_access_share_1mi"',
            'slug = "public_investment"',
            "public investment cannot be a scoring metric",
        ),
        ('treatment = "scoring"', 'treatment = "contextual"', "scoring domain"),
    ],
)
def test_registry_rejects_invalid_contract_mutations(
    tmp_path: Path, old: str, new: str, message: str
) -> None:
    path = _mutated_registry(tmp_path, old, new)

    with pytest.raises(RegistryValidationError, match=message):
        load_registry(path)


def test_registry_rejects_incomplete_priority_matrix(tmp_path: Path) -> None:
    content = REGISTRY_PATH.read_text(encoding="utf-8")
    marker = "\n[[priority_matrix]]\n"
    head, _separator, tail = content.rpartition(marker)
    assert head and tail
    path = tmp_path / "registry.toml"
    path.write_text(head + "\n", encoding="utf-8")

    with pytest.raises(RegistryValidationError, match="all 25 band combinations"):
        load_registry(path)
