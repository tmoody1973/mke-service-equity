from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from pipelines.common.artifacts import SnapshotManifest
from pipelines.equity_baseline.quality import ReliabilityState
from pipelines.food_equity.accessibility import TransitAccessResult, WalkingAccessResult
from pipelines.food_equity.emergency_food import EmergencyFoodRecord
from pipelines.food_equity.models import ResourceCategory
from pipelines.food_equity.origins import NormalizedTractOrigin
from pipelines.food_equity.persistence import build_persistence_inputs
from pipelines.food_equity.registry import load_registry
from pipelines.food_equity.retail import RetailerRecord
from pipelines.food_equity.sram import SramRecord
from pipelines.food_equity.vehicle_access import VehicleAccessObservation

NOW = datetime(2026, 8, 29, 12, tzinfo=UTC)
GEOID = "55079000101"
SOURCE_KEYS = (
    "acs_vehicle",
    "emergency_food_context",
    "mcts_gtfs",
    "snap_retailers",
    "sram",
    "tract_origins",
    "walking_network",
)


def _manifests() -> dict[str, SnapshotManifest]:
    return {
        key: SnapshotManifest(
            source_key=key,
            source_url=f"https://example.test/{key}",
            dataset_version=f"v{index}",
            retrieved_at=NOW.isoformat(),
            checksum_sha256=f"{index:x}" * 64,
            byte_size=index,
            storage_uri=f"data/raw/food-equity/{key}.bin",
            row_or_feature_count=1,
            schema_fingerprint=f"{index + 7:x}" * 64,
            request_metadata={"source": key},
            license="approved source terms",
            methodology_reference="docs/data/food-equity-source-registry.md",
        )
        for index, key in enumerate(SOURCE_KEYS, start=1)
    }


def _retailer() -> RetailerRecord:
    return RetailerRecord(
        source_record_id="retailer-1",
        name="Example Grocery",
        source_store_type="Supermarket",
        street_number="1",
        street_name="Market St",
        additional_address=None,
        city="Milwaukee",
        state="WI",
        zip_code="53202",
        zip4=None,
        county="Milwaukee",
        address="1 Market St",
        latitude=Decimal("43.04"),
        longitude=Decimal("-87.91"),
        coordinate_status="source_coordinate",
        in_review_buffer=True,
        authorization_date=date(2025, 1, 1),
        end_date=None,
        status_as_of=date(2025, 12, 31),
        authorization_status="active_as_of_cutoff",
        status_reason=None,
        snap_authorized=True,
        active=True,
        category=ResourceCategory.FULL_SERVICE_GROCERY,
        full_service_grocery=True,
        scoring_eligible=True,
        verification_status="source_verified",
        classification_reason="approved source rule",
        classification_evidence=None,
    )


def _emergency_resource() -> EmergencyFoodRecord:
    return EmergencyFoodRecord(
        object_id=1,
        source_record_id="emergency-1",
        name=None,
        address=None,
        city="Milwaukee",
        zip_code=None,
        zip_status="missing",
        phone=None,
        source_type="Food Pantry",
        category=ResourceCategory.EMERGENCY_FOOD_PANTRY,
        notes=None,
        website=None,
        service_area=None,
        longitude=Decimal("-87.92"),
        latitude=Decimal("43.05"),
        coordinate_status="source_coordinate",
        fixed_location=True,
        routing_status="context_only",
        active_status="unknown",
        active=None,
        verification_date=None,
        operating_hours=None,
        hours_status="unknown",
        scoring_eligible=False,
        reuse_terms_confirmed=False,
        public_redistribution_allowed=False,
        context_status="stale_unverified_context",
        conflict_status="none",
        conflict_group_id=None,
    )


def _walking(*, emergency: bool = False) -> WalkingAccessResult:
    return WalkingAccessResult(
        geoid=GEOID,
        approved_area_id=GEOID,
        nearest_resource_id=None if emergency else "retailer-1",
        reachable=None if emergency else True,
        network_distance_m=None if emergency else Decimal("804.672"),
        walk_minutes=None if emergency else Decimal("10"),
        count_within_10_minutes=None if emergency else 1,
        count_within_15_minutes=None if emergency else 1,
        count_within_20_minutes=None if emergency else 1,
        scoring_eligible=not emergency,
        resource_categories=(
            ResourceCategory.EMERGENCY_FOOD_PANTRY
            if emergency
            else ResourceCategory.FULL_SERVICE_GROCERY,
        ),
        contributing_resource_ids=() if emergency else ("retailer-1",),
        contributing_resource_distances_m=(
            () if emergency else (("retailer-1", Decimal("804.672")),)
        ),
        excluded_resource_ids=(),
        unroutable_resource_ids=(),
        quality_status="stale_unverified_context" if emergency else "verified",
        quality_reason="resource_activity_unknown" if emergency else None,
        origin_source_sha256="6" * 64,
        resource_source_sha256="2" * 64 if emergency else "4" * 64,
        graph_sha256="7" * 64,
        graph_version="walking-network-v1",
        graph_approved_for_scoring=True,
        thresholds_m=((10, Decimal("804.672")),),
    )


def _transit() -> TransitAccessResult:
    return TransitAccessResult(
        geoid=GEOID,
        approved_area_id=GEOID,
        reachable_stop_ids=("stop-1",),
        reachable_stop_distances_m=(("stop-1", Decimal("100")),),
        tuesday_departures=10,
        saturday_departures=8,
        scheduled_service_intensity=Decimal("0.5625"),
        quality_status="verified",
        quality_reason=None,
        origin_source_sha256="6" * 64,
        gtfs_source_sha256="3" * 64,
        projected_stops_sha256="a" * 64,
        graph_sha256="7" * 64,
        graph_version="walking-network-v1",
        graph_approved_for_scoring=True,
        analysis_dates=(date(2026, 8, 25), date(2026, 8, 29)),
        feed_validity_dates=(date(2026, 8, 1), date(2026, 12, 31)),
    )


def test_builds_lossless_deterministic_persistence_inputs() -> None:
    manifests = _manifests()
    inputs = build_persistence_inputs(
        registry=load_registry(),
        manifests=manifests,
        retailers=(_retailer(),),
        emergency_resources=(_emergency_resource(),),
        origins=(
            NormalizedTractOrigin(
                geoid=GEOID,
                population=100,
                latitude=Decimal("43.04"),
                longitude=Decimal("-87.91"),
                x=Decimal("690000"),
                y=Decimal("290000"),
                source_snapshot_sha256="6" * 64,
            ),
        ),
        sram=(SramRecord(GEOID, 10, Decimal("10"), "verified", None),),
        vehicle=(
            VehicleAccessObservation(
                geoid=GEOID,
                value=Decimal("20"),
                margin_of_error=Decimal("1"),
                coefficient_of_variation=Decimal("0.1"),
                reliability=ReliabilityState.RELIABLE,
                quality_status="verified",
                quality_reason=None,
                quality_metadata={"denominator": 100},
            ),
        ),
        grocery_access=(_walking(),),
        emergency_access=(_walking(emergency=True),),
        transit_access=(_transit(),),
        geography_ids={GEOID: "10000000-0000-0000-0000-000000000001"},
        calculated_at=NOW,
    )

    assert len(inputs.sources) == 7
    assert len(inputs.snapshots) == 7
    assert len(inputs.resources) == 2
    assert len(inputs.resource_versions) == 2
    assert len(inputs.access_metrics) == 10
    assert len(inputs.metric_snapshot_links) == 26
    assert [manifest["source_key"] for manifest in inputs.manifests] == list(SOURCE_KEYS)

    emergency_version = next(
        item
        for item in inputs.resource_versions
        if item.category == ResourceCategory.EMERGENCY_FOOD_PANTRY.value
    )
    assert emergency_version.name is None
    assert emergency_version.active is None
    assert emergency_version.verified_at is None

    emergency_metrics = [
        item for item in inputs.access_metrics if item.key.metric_slug.startswith("emergency_food")
    ]
    assert len(emergency_metrics) == 3
    assert all(item.state == "missing" and item.value is None for item in emergency_metrics)

    grocery_context = [
        item
        for item in inputs.access_metrics
        if item.key.metric_slug.startswith("full_service_grocery_count")
    ]
    assert len(grocery_context) == 3
    assert all(item.state == "observed" for item in grocery_context)
