from __future__ import annotations

import tomllib
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
    assert sources["snap_retailers"].published_checksum == (
        "sha256:872a6f814a63514a1f1b0c4517a90309a9fbb01d97d6e4dbb1e8b20421c08cce"
    )
    assert sources["walking_network"].published_checksum == ("md5:87c18ce0608499afd91ed0f2a5ee8eef")
    assert sources["mcts_gtfs"].freshness_policy == "service_dates"
    assert sources["emergency_food_context"].role is SourceRole.CONTEXTUAL
    assert sources["emergency_food_context"].vintage == (
        "data edited 2024-08-07; schema/layer edited 2024-08-27"
    )
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
    assert classifications["Super Store"].requires_override is True
    assert classifications["Military Commissary"].scoring_eligible is False


def test_registry_locks_exact_fns_artifact_and_historical_identity_contract() -> None:
    raw = tomllib.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    source = next(item for item in raw["sources"] if item["key"] == "snap_retailers")

    assert source["artifact_name"] == "snap-retailer-locator-data2005-2025.zip"
    assert source["archive_member"] == ("Historical SNAP Retailer Locator Data 2005-2025.csv")
    assert source["archive_sha256"] == (
        "872a6f814a63514a1f1b0c4517a90309a9fbb01d97d6e4dbb1e8b20421c08cce"
    )
    assert source["member_sha256"] == (
        "4af9a16811b7d906a2ad077eb59d3f1c7e99a32a87d2bca0900f8d14033c7b9e"
    )
    assert source["header_sha256"] == (
        "026cbfcafecc45d3159fa2e3f6d4b47da276d1f3cbd77419bc3187f1ee344aaa"
    )
    assert source["encoding"] == "utf-8-sig"
    assert source["bom_hex"] == "efbbbf"
    assert source["row_count"] == 703_441
    assert source["snapshot_date"] == "2025-12-31"
    assert source["header"] == [
        "Record ID",
        "Store Name",
        "Store Type",
        "Street Number",
        "Street Name",
        "Additional Address",
        "City",
        "State",
        "Zip Code",
        "Zip4",
        "County",
        "Latitude",
        "Longitude",
        "Authorization Date",
        "End Date",
    ]
    assert source["record_identity_fields"] == ["Record ID"]
    assert source["version_identity_fields"] == [
        "Record ID",
        "Authorization Date",
        "End Date",
    ]
    assert source["duplicate_version_policy"] == "fail"


def test_registry_maps_exact_observed_fns_store_type_values() -> None:
    classifications = {
        item.source_value: item
        for item in load_registry().classifications
        if item.source == "snap_retailers"
    }

    assert set(classifications) == {
        "Bakery Specialty",
        "Combination Grocery/Other",
        "Convenience Store",
        "Delivery Route",
        "Farmers' Market",
        "Food Buying Co-op",
        "Fruits/Veg Specialty",
        "Large Grocery Store",
        "Meat/Poultry Specialty",
        "Medium Grocery Store",
        "Military Commissary",
        "Seafood Specialty",
        "Small Grocery Store",
        "Super Store",
        "Supermarket",
        "Unknown",
        "Wholesaler",
    }
    assert classifications["Supermarket"].category is ResourceCategory.FULL_SERVICE_GROCERY
    assert classifications["Large Grocery Store"].category is (
        ResourceCategory.FULL_SERVICE_GROCERY
    )
    assert classifications["Super Store"].category is ResourceCategory.CANDIDATE_FULL_SERVICE
    assert classifications["Super Store"].requires_override is True
    assert classifications["Bakery Specialty"].category is ResourceCategory.SPECIALTY_BAKERY
    assert classifications["Fruits/Veg Specialty"].category is ResourceCategory.SPECIALTY_PRODUCE
    assert classifications["Meat/Poultry Specialty"].category is ResourceCategory.SPECIALTY_MEAT
    assert classifications["Seafood Specialty"].category is ResourceCategory.SPECIALTY_SEAFOOD
    assert classifications["Farmers' Market"].category is ResourceCategory.SEASONAL_OR_DIRECT
    for source_value in ("Food Buying Co-op", "Wholesaler", "Unknown"):
        assert classifications[source_value].category is ResourceCategory.UNVERIFIED
        assert classifications[source_value].scoring_eligible is False
        assert classifications[source_value].requires_override is False


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
