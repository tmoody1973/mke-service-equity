from __future__ import annotations

import io
import zipfile
from datetime import UTC, datetime
from decimal import Decimal, localcontext
from pathlib import Path

import pytest

from pipelines.food_equity.accessibility import (
    ACCESSIBILITY_CALCULATION_VERSION,
    GTFS_STOP_PROJECTION_VERSION,
    TEN_MINUTES_M,
    TWENTY_MINUTES_M,
    WALK_SPEED_M_PER_MINUTE,
    WALK_THRESHOLDS_M,
    FIFTEEN_MINUTES_M,
    AccessResource,
    AccessibilityError,
    TractOrigin,
    calculate_contextual_access as _calculate_contextual_access,
    calculate_grocery_access as _calculate_grocery_access,
    calculate_transit_access as _calculate_transit_access,
    project_gtfs_stops,
)
from pipelines.food_equity.gtfs import (
    read_gtfs_archive,
    normalize_gtfs,
    select_analysis_dates,
)
from pipelines.food_equity.models import ResourceCategory
from pipelines.food_equity.walking_network import (
    NetworkEdge,
    NetworkNode,
    build_walking_graph,
)


FIXTURE_ROOT = Path(__file__).parents[1] / "fixtures/food_equity/gtfs"
GTFS_MEMBERS = tuple(path.name for path in sorted(FIXTURE_ROOT.glob("*.txt")))
ORIGIN_SOURCE_SHA256 = "1" * 64
RESOURCE_SOURCE_SHA256 = "2" * 64


def calculate_grocery_access(*args, **kwargs):
    kwargs["allow_unapproved_graph"] = True
    return _calculate_grocery_access(*args, **kwargs)


def calculate_contextual_access(*args, **kwargs):
    kwargs["allow_unapproved_graph"] = True
    return _calculate_contextual_access(*args, **kwargs)


def calculate_transit_access(*args, **kwargs):
    kwargs["allow_unapproved_graph"] = True
    return _calculate_transit_access(*args, **kwargs)


def node(node_id: int, x: str, y: str) -> NetworkNode:
    return NetworkNode(node_id=node_id, x=Decimal(x), y=Decimal(y))


def edge(
    edge_id: str,
    way_id: int,
    source: int,
    target: int,
    length_m: str,
) -> NetworkEdge:
    return NetworkEdge(
        edge_id=edge_id,
        osm_way_id=way_id,
        source_node_id=source,
        target_node_id=target,
        length_m=Decimal(length_m),
    )


def bidirectional(
    way_id: int, source: int, target: int, length_m: str
) -> tuple[NetworkEdge, NetworkEdge]:
    return (
        edge(f"{way_id}:f", way_id, source, target, length_m),
        edge(f"{way_id}:r", way_id, target, source, length_m),
    )


def accessibility_graph():
    nodes = (
        node(1, "0", "0"),
        node(2, "804.672", "0"),
        node(3, "1207.008", "0"),
        node(4, "1609.344", "0"),
        node(5, "0", "804.672"),
        node(6, "100", "0"),
        node(7, "200", "0"),
    )
    edges = (
        *bidirectional(10, 1, 2, "804.672"),
        *bidirectional(11, 2, 3, "402.336"),
        *bidirectional(12, 3, 4, "402.336"),
        *bidirectional(13, 1, 5, "804.672"),
    )
    return build_walking_graph(nodes, edges, source_sha256="a" * 64)


def origin(*, geoid: str = "55079000101", x: str = "0", y: str = "0") -> TractOrigin:
    return TractOrigin(
        geoid=geoid,
        x=Decimal(x),
        y=Decimal(y),
        source_snapshot_sha256=ORIGIN_SOURCE_SHA256,
    )


def resource(
    resource_id: str,
    *,
    x: str | None,
    y: str | None,
    category: ResourceCategory = ResourceCategory.FULL_SERVICE_GROCERY,
    coordinate_state: str = "source_coordinate",
    quality_status: str = "verified",
    active: bool = True,
    scoring_eligible: bool | None = None,
) -> AccessResource:
    return AccessResource(
        resource_id=resource_id,
        category=category,
        x=Decimal(x) if x is not None else None,
        y=Decimal(y) if y is not None else None,
        coordinate_state=coordinate_state,
        source_key="synthetic_resources",
        source_snapshot_sha256=RESOURCE_SOURCE_SHA256,
        quality_status=quality_status,
        active=active,
        scoring_eligible=(
            category is ResourceCategory.FULL_SERVICE_GROCERY
            if scoring_eligible is None
            else scoring_eligible
        ),
    )


def gtfs_fixture():
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for member_name in GTFS_MEMBERS:
            archive.writestr(member_name, (FIXTURE_ROOT / member_name).read_bytes())
    parsed = read_gtfs_archive(
        output.getvalue(), service_area_contains=lambda _longitude, _latitude: True
    )
    feed = normalize_gtfs(parsed)
    dates = select_analysis_dates(feed, retrieved_at=datetime(2026, 9, 1, 1, tzinfo=UTC))
    return feed, dates


def transit_graph(feed):
    stops = {item.stop_id: item for item in project_gtfs_stops(feed)}
    first = stops["S1"]
    second = stops["S2"]
    outer = stops["S3"]
    disconnected_x = first.x + Decimal("5000")
    graph = build_walking_graph(
        (
            NetworkNode(101, first.x, first.y),
            NetworkNode(102, second.x, second.y),
            NetworkNode(103, outer.x, outer.y),
            NetworkNode(104, disconnected_x, first.y),
        ),
        bidirectional(100, 101, 102, "804.672"),
        source_sha256="f" * 64,
    )
    return (
        graph,
        origin(x=str(first.x), y=str(first.y)),
        origin(x=str(disconnected_x), y=str(first.y)),
    )


def approved_origin_area(geoid: str, x: Decimal, _y: Decimal) -> str | None:
    return geoid if x >= 0 else None


def inside_review_area(x: Decimal, _y: Decimal) -> bool:
    return x >= 0


def test_locks_exact_walk_speed_and_inclusive_thresholds() -> None:
    assert ACCESSIBILITY_CALCULATION_VERSION == "food-accessibility-v1"
    assert WALK_SPEED_M_PER_MINUTE == Decimal("80.4672")
    assert TEN_MINUTES_M == Decimal("804.672")
    assert FIFTEEN_MINUTES_M == Decimal("1207.008")
    assert TWENTY_MINUTES_M == Decimal("1609.344")
    assert WALK_THRESHOLDS_M == {
        10: Decimal("804.672"),
        15: Decimal("1207.008"),
        20: Decimal("1609.344"),
    }


def test_origin_on_approved_area_boundary_is_canonical_and_accepted() -> None:
    result = calculate_grocery_access(
        accessibility_graph(),
        origins=(origin(x="0"),),
        resources=(resource("A", x="804.672", y="0"),),
        resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
        approved_area_for_origin=approved_origin_area,
        resource_in_review_area=inside_review_area,
    )[0]

    assert result.geoid == "55079000101"
    assert result.approved_area_id == "55079000101"
    assert result.quality_status == "verified"


def test_metrics_reject_a_graph_without_the_production_topology_gate() -> None:
    unapproved = build_walking_graph((node(1, "0", "0"),), (), source_sha256="7" * 64)

    with pytest.raises(AccessibilityError, match="graph.*not approved"):
        _calculate_grocery_access(
            unapproved,
            origins=(origin(),),
            resources=(),
            resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
            approved_area_for_origin=approved_origin_area,
            resource_in_review_area=inside_review_area,
        )


def test_canonical_origins_require_unique_geoids_and_results_sort_by_geoid() -> None:
    graph = accessibility_graph()
    kwargs = {
        "graph": graph,
        "resources": (resource("A", x="804.672", y="0"),),
        "resource_snapshot_sha256": RESOURCE_SOURCE_SHA256,
        "approved_area_for_origin": approved_origin_area,
        "resource_in_review_area": inside_review_area,
    }

    with pytest.raises(AccessibilityError, match="duplicate.*GEOID|duplicate.*origin"):
        calculate_grocery_access(
            origins=(origin(), origin()),
            **kwargs,
        )

    ordered = calculate_grocery_access(
        origins=(
            origin(geoid="55079000200"),
            origin(geoid="55079000100"),
        ),
        **kwargs,
    )
    assert tuple(item.geoid for item in ordered) == ("55079000100", "55079000200")


def test_duplicate_resource_ids_fail_before_area_or_category_filtering() -> None:
    resources = (
        resource("DUP", x="804.672", y="0"),
        resource(
            "DUP",
            x="-1",
            y="0",
            category=ResourceCategory.EMERGENCY_FOOD_PANTRY,
        ),
    )

    with pytest.raises(AccessibilityError, match="duplicate.*resource"):
        calculate_grocery_access(
            accessibility_graph(),
            origins=(origin(),),
            resources=resources,
            resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
            approved_area_for_origin=approved_origin_area,
            resource_in_review_area=inside_review_area,
        )


def test_inactive_or_upstream_ineligible_groceries_are_explicitly_excluded() -> None:
    result = calculate_grocery_access(
        accessibility_graph(),
        origins=(origin(),),
        resources=(
            resource("INACTIVE", x="0", y="0", active=False),
            resource("INELIGIBLE", x="0", y="0", scoring_eligible=False),
            resource("ACTIVE", x="804.672", y="0"),
        ),
        resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
        approved_area_for_origin=approved_origin_area,
        resource_in_review_area=inside_review_area,
    )[0]

    assert result.nearest_resource_id == "ACTIVE"
    assert result.excluded_resource_ids == ("INACTIVE", "INELIGIBLE")


def test_outside_resources_are_explicitly_excluded_and_never_affect_nearest() -> None:
    result = calculate_grocery_access(
        accessibility_graph(),
        origins=(origin(),),
        resources=(
            resource("OUTSIDE", x="-1", y="0"),
            resource("INSIDE", x="804.672", y="0"),
        ),
        resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
        approved_area_for_origin=approved_origin_area,
        resource_in_review_area=inside_review_area,
    )[0]

    assert result.nearest_resource_id == "INSIDE"
    assert result.excluded_resource_ids == ("OUTSIDE",)
    assert "OUTSIDE" not in result.contributing_resource_ids


@pytest.mark.parametrize(
    "invalid",
    [
        resource("BAD", x=None, y=None, coordinate_state="missing"),
        resource("BAD", x="NaN", y="0", coordinate_state="invalid"),
        resource("BAD", x="5000", y="5000"),
    ],
)
def test_in_area_full_service_grocery_invalid_or_unsnapped_fails(invalid: AccessResource) -> None:
    with pytest.raises(AccessibilityError, match="full-service|coordinate|snap"):
        calculate_grocery_access(
            accessibility_graph(),
            origins=(origin(),),
            resources=(invalid,),
            resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
            approved_area_for_origin=approved_origin_area,
            resource_in_review_area=lambda _x, _y: True,
        )


def test_contextual_resource_may_be_retained_as_unroutable_without_score_effect() -> None:
    result = calculate_contextual_access(
        accessibility_graph(),
        origins=(origin(),),
        resources=(
            resource(
                "PANTRY",
                x="5000",
                y="5000",
                category=ResourceCategory.EMERGENCY_FOOD_PANTRY,
                quality_status="stale_unverified_context",
            ),
        ),
        resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
        resource_snapshot_quality_status="stale_unverified_context",
        approved_area_for_origin=approved_origin_area,
        resource_in_review_area=lambda _x, _y: True,
    )[0]

    assert result.scoring_eligible is False
    assert result.unroutable_resource_ids == ("PANTRY",)
    assert result.contributing_resource_ids == ()
    assert result.quality_status == "stale_unverified_context"
    assert result.quality_reason == "unroutable_context"
    assert result.count_within_10_minutes == 0
    assert result.count_within_15_minutes == 0
    assert result.count_within_20_minutes == 0


def test_empty_context_inventory_retains_dataset_quality_instead_of_becoming_verified() -> None:
    result = calculate_contextual_access(
        accessibility_graph(),
        origins=(origin(),),
        resources=(),
        resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
        resource_snapshot_quality_status="stale_unverified_context",
        approved_area_for_origin=approved_origin_area,
        resource_in_review_area=inside_review_area,
    )[0]

    assert result.quality_status == "stale_unverified_context"
    assert result.quality_reason == "no_qualifying_resource"
    assert result.resource_source_sha256 == RESOURCE_SOURCE_SHA256


def test_nearest_tie_uses_lowest_resource_id_and_all_ties_count() -> None:
    result = calculate_grocery_access(
        accessibility_graph(),
        origins=(origin(),),
        resources=(
            resource("B", x="804.672", y="0"),
            resource("A", x="0", y="804.672"),
            resource("C", x="1207.008", y="0"),
            resource("D", x="1609.344", y="0"),
        ),
        resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
        approved_area_for_origin=approved_origin_area,
        resource_in_review_area=inside_review_area,
    )[0]

    assert result.nearest_resource_id == "A"
    assert result.network_distance_m == Decimal("804.672")
    assert result.walk_minutes == Decimal("10")
    assert result.count_within_10_minutes == 2
    assert result.count_within_15_minutes == 3
    assert result.count_within_20_minutes == 4
    assert result.contributing_resource_ids == ("A", "B", "C", "D")


def test_no_resource_and_disconnected_resource_are_unreachable_not_missing() -> None:
    graph = accessibility_graph()
    no_resource = calculate_grocery_access(
        graph,
        origins=(origin(),),
        resources=(),
        resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
        approved_area_for_origin=approved_origin_area,
        resource_in_review_area=inside_review_area,
    )[0]
    disconnected = calculate_grocery_access(
        graph,
        origins=(origin(),),
        resources=(resource("NEAR-BUT-DISCONNECTED", x="100", y="0"),),
        resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
        approved_area_for_origin=approved_origin_area,
        resource_in_review_area=inside_review_area,
    )[0]

    assert (
        no_resource.quality_status,
        no_resource.quality_reason,
        no_resource.network_distance_m,
    ) == ("unreachable", "no_qualifying_resource", None)
    assert no_resource.resource_source_sha256 == RESOURCE_SOURCE_SHA256
    assert disconnected.quality_status == "unreachable"
    assert disconnected.quality_reason == "disconnected_network"
    assert disconnected.network_distance_m is None
    assert disconnected.walk_minutes is None
    # The resource is only 100 straight-line meters away; no Euclidean route is invented.
    assert disconnected.nearest_resource_id is None


def test_unsnapped_origin_is_missing_never_zero_or_unreachable() -> None:
    result = calculate_grocery_access(
        accessibility_graph(),
        origins=(origin(x="5000", y="5000"),),
        resources=(resource("A", x="804.672", y="0"),),
        resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
        approved_area_for_origin=approved_origin_area,
        resource_in_review_area=inside_review_area,
    )[0]

    assert result.quality_status == "missing"
    assert result.quality_reason == "origin_unsnapped"
    assert result.nearest_resource_id is None
    assert result.network_distance_m is None
    assert result.count_within_10_minutes is None


def test_grocery_result_carries_source_graph_and_calculation_lineage() -> None:
    graph = accessibility_graph()
    result = calculate_grocery_access(
        graph,
        origins=(origin(),),
        resources=(resource("A", x="804.672", y="0"),),
        resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
        approved_area_for_origin=approved_origin_area,
        resource_in_review_area=inside_review_area,
    )[0]

    assert result.origin_source_sha256 == ORIGIN_SOURCE_SHA256
    assert result.resource_source_sha256 == RESOURCE_SOURCE_SHA256
    assert result.graph_sha256 == graph.graph_sha256
    assert result.graph_version == graph.version
    assert result.graph_approved_for_scoring is False
    assert result.calculation_version == ACCESSIBILITY_CALCULATION_VERSION
    assert result.resource_categories == (ResourceCategory.FULL_SERVICE_GROCERY,)
    assert result.thresholds_m == tuple(WALK_THRESHOLDS_M.items())
    assert (result.distance_unit, result.duration_unit) == ("meters", "minutes")
    assert result.contributing_resource_ids == ("A",)
    assert result.contributing_resource_distances_m == (("A", Decimal("804.672")),)


def test_walk_minutes_are_independent_of_the_callers_decimal_context() -> None:
    graph = build_walking_graph(
        (node(1, "0", "0"), node(2, "1", "0")),
        (edge("a", 1, 1, 2, "1"),),
        source_sha256="8" * 64,
    )
    observed = []
    for precision in (6, 28, 50):
        with localcontext() as context:
            context.prec = precision
            observed.append(
                calculate_grocery_access(
                    graph,
                    origins=(origin(),),
                    resources=(resource("A", x="1", y="0"),),
                    resource_snapshot_sha256=RESOURCE_SOURCE_SHA256,
                    approved_area_for_origin=approved_origin_area,
                    resource_in_review_area=inside_review_area,
                )[0].walk_minutes
            )

    assert observed[0] == observed[1] == observed[2]


def test_transit_uses_stops_within_inclusive_ten_minute_network_walk() -> None:
    feed, dates = gtfs_fixture()
    graph, routed_origin, _disconnected_origin = transit_graph(feed)
    result = calculate_transit_access(
        graph,
        origins=(routed_origin,),
        gtfs=feed,
        analysis_dates=dates,
        approved_area_for_origin=approved_origin_area,
    )[0]

    assert result.reachable_stop_ids == ("S1", "S2")
    assert result.reachable_stop_distances_m == (
        ("S1", Decimal("0")),
        ("S2", Decimal("804.672")),
    )
    assert result.tuesday_departures == 2
    assert result.saturday_departures == 1
    assert result.scheduled_service_intensity == Decimal("0.25")
    assert result.quality_status == "verified"
    assert result.gtfs_source_sha256 == feed.archive_sha256
    assert len(result.projected_stops_sha256) == 64
    assert result.stop_projection_version == GTFS_STOP_PROJECTION_VERSION
    assert result.analysis_dates == (dates.tuesday, dates.saturday)
    assert result.walk_threshold_m == TEN_MINUTES_M
    assert (result.distance_unit, result.service_intensity_unit) == (
        "meters",
        "unique_trips_per_hour",
    )


def test_no_reachable_stops_is_valid_zero_but_origin_missing_is_not_zero() -> None:
    feed, dates = gtfs_fixture()
    graph, _routed_origin, disconnected_origin = transit_graph(feed)
    common = {
        "graph": graph,
        "gtfs": feed,
        "analysis_dates": dates,
        "approved_area_for_origin": approved_origin_area,
    }

    inaccessible = calculate_transit_access(origins=(disconnected_origin,), **common)[0]
    missing = calculate_transit_access(origins=(origin(x="0", y="0"),), **common)[0]

    assert inaccessible.reachable_stop_ids == ()
    assert inaccessible.scheduled_service_intensity == Decimal("0")
    assert inaccessible.quality_status == "verified"
    assert missing.reachable_stop_ids is None
    assert missing.scheduled_service_intensity is None
    assert missing.quality_status == "missing"
    assert missing.quality_reason == "origin_unsnapped"


def test_transit_output_is_frequency_only_without_travel_time_or_realtime_fields() -> None:
    feed, dates = gtfs_fixture()
    graph, routed_origin, _disconnected_origin = transit_graph(feed)
    result = calculate_transit_access(
        graph,
        origins=(routed_origin,),
        gtfs=feed,
        analysis_dates=dates,
        approved_area_for_origin=approved_origin_area,
    )[0]

    fields = result.__dataclass_fields__
    assert "transit_travel_time" not in fields
    assert "grocery_destination_id" not in fields
    assert "realtime" not in fields
    assert "reliability" not in fields
