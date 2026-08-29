"""Deterministic walking and scheduled-transit access metrics for Food Equity v1."""

from __future__ import annotations

import hashlib
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Context, Decimal, ROUND_HALF_EVEN

from pyproj import Transformer

from pipelines.common.artifacts import canonical_json_bytes
from pipelines.food_equity.errors import SourceValidationError
from pipelines.food_equity.gtfs import (
    GtfsAnalysisDates,
    NormalizedGtfs,
    summarize_scheduled_service,
)
from pipelines.food_equity.models import ResourceCategory
from pipelines.food_equity.walking_network import (
    WalkingGraph,
    graph_is_approved_for_scoring,
    nearest_target_distances,
    shortest_distances,
    snap_point,
)

ACCESSIBILITY_CALCULATION_VERSION = "food-accessibility-v1"
GTFS_STOP_PROJECTION_VERSION = "gtfs-stops-epsg3071-v1"
WALK_SPEED_M_PER_MINUTE = Decimal("80.4672")
TEN_MINUTES_M = Decimal("804.672")
FIFTEEN_MINUTES_M = Decimal("1207.008")
TWENTY_MINUTES_M = Decimal("1609.344")
WALK_THRESHOLDS_M = {
    10: TEN_MINUTES_M,
    15: FIFTEEN_MINUTES_M,
    20: TWENTY_MINUTES_M,
}
_CALCULATION_CONTEXT = Context(prec=50, rounding=ROUND_HALF_EVEN)
_GTFS_TRANSFORMER = Transformer.from_crs("EPSG:4326", "EPSG:3071", always_xy=True)

ApprovedAreaForOrigin = Callable[[str, Decimal, Decimal], str | None]
ResourceInReviewArea = Callable[[Decimal, Decimal], bool]

_EMERGENCY_CATEGORIES = frozenset(
    {
        ResourceCategory.EMERGENCY_FOOD_BANK,
        ResourceCategory.EMERGENCY_FOOD_PANTRY,
        ResourceCategory.EMERGENCY_PANTRY_RECOVERY,
        ResourceCategory.EMERGENCY_MEAL_PROGRAM,
    }
)
_COORDINATE_STATES = frozenset(
    {"source_coordinate", "authoritative_geocode", "manually_verified", "invalid", "missing"}
)
_ROUTABLE_COORDINATE_STATES = frozenset(
    {"source_coordinate", "authoritative_geocode", "manually_verified"}
)


class AccessibilityError(SourceValidationError):
    """Raised when canonical access inputs violate the approved contract."""


@dataclass(frozen=True, slots=True)
class TractOrigin:
    geoid: str
    x: Decimal
    y: Decimal
    source_snapshot_sha256: str


@dataclass(frozen=True, slots=True)
class AccessResource:
    resource_id: str
    category: ResourceCategory
    x: Decimal | None
    y: Decimal | None
    coordinate_state: str
    source_key: str
    source_snapshot_sha256: str
    quality_status: str
    active: bool
    scoring_eligible: bool


@dataclass(frozen=True, slots=True)
class GtfsStopAccess:
    stop_id: str
    x: Decimal
    y: Decimal


@dataclass(frozen=True, slots=True)
class WalkingAccessResult:
    geoid: str
    approved_area_id: str
    nearest_resource_id: str | None
    reachable: bool | None
    network_distance_m: Decimal | None
    walk_minutes: Decimal | None
    count_within_10_minutes: int | None
    count_within_15_minutes: int | None
    count_within_20_minutes: int | None
    scoring_eligible: bool
    resource_categories: tuple[ResourceCategory, ...]
    contributing_resource_ids: tuple[str, ...]
    contributing_resource_distances_m: tuple[tuple[str, Decimal], ...]
    excluded_resource_ids: tuple[str, ...]
    unroutable_resource_ids: tuple[str, ...]
    quality_status: str
    quality_reason: str | None
    origin_source_sha256: str
    resource_source_sha256: str
    graph_sha256: str
    graph_version: str
    graph_approved_for_scoring: bool
    thresholds_m: tuple[tuple[int, Decimal], ...]
    distance_unit: str = "meters"
    duration_unit: str = "minutes"
    calculation_version: str = ACCESSIBILITY_CALCULATION_VERSION


@dataclass(frozen=True, slots=True)
class TransitAccessResult:
    geoid: str
    approved_area_id: str
    reachable_stop_ids: tuple[str, ...] | None
    reachable_stop_distances_m: tuple[tuple[str, Decimal], ...] | None
    tuesday_departures: int | None
    saturday_departures: int | None
    scheduled_service_intensity: Decimal | None
    quality_status: str
    quality_reason: str | None
    origin_source_sha256: str
    gtfs_source_sha256: str
    projected_stops_sha256: str
    graph_sha256: str
    graph_version: str
    graph_approved_for_scoring: bool
    analysis_dates: tuple[date, date]
    feed_validity_dates: tuple[date, date]
    walk_threshold_m: Decimal = TEN_MINUTES_M
    distance_unit: str = "meters"
    service_intensity_unit: str = "unique_trips_per_hour"
    stop_projection_version: str = GTFS_STOP_PROJECTION_VERSION
    calculation_version: str = ACCESSIBILITY_CALCULATION_VERSION


@dataclass(frozen=True, slots=True)
class _PreparedResource:
    resource: AccessResource
    node_id: int | None


def _finite(value: Decimal | None) -> bool:
    return value is not None and value.is_finite()


def _valid_sha256(value: str) -> bool:
    return len(value) == 64 and all(character in "0123456789abcdef" for character in value)


def _validate_origins(
    origins: Sequence[TractOrigin], approved_area_for_origin: ApprovedAreaForOrigin
) -> tuple[tuple[TractOrigin, str], ...]:
    geoids = [item.geoid for item in origins]
    if len(geoids) != len(set(geoids)):
        raise AccessibilityError("duplicate tract origin GEOID")

    prepared: list[tuple[TractOrigin, str]] = []
    for item in sorted(origins, key=lambda value: value.geoid):
        if not item.geoid:
            raise AccessibilityError("tract origin GEOID cannot be empty")
        if not _valid_sha256(item.source_snapshot_sha256):
            raise AccessibilityError(f"tract origin {item.geoid} has an invalid source SHA-256")
        if not _finite(item.x) or not _finite(item.y):
            raise AccessibilityError(f"tract origin {item.geoid} has an invalid coordinate")
        approved_area_id = approved_area_for_origin(item.geoid, item.x, item.y)
        if approved_area_id is None:
            raise AccessibilityError(
                f"tract origin {item.geoid} is outside its approved canonical area"
            )
        prepared.append((item, approved_area_id))
    return tuple(prepared)


def _validate_unique_resources(resources: Sequence[AccessResource]) -> None:
    resource_ids = [item.resource_id for item in resources]
    if len(resource_ids) != len(set(resource_ids)):
        raise AccessibilityError("duplicate resource ID")
    if any(not item.resource_id for item in resources):
        raise AccessibilityError("resource ID cannot be empty")
    if any(not item.source_key for item in resources):
        raise AccessibilityError("resource source key cannot be empty")
    if any(not _valid_sha256(item.source_snapshot_sha256) for item in resources):
        raise AccessibilityError("resource source SHA-256 is invalid")
    if any(not item.quality_status for item in resources):
        raise AccessibilityError("resource quality status cannot be empty")


def _single_resource_source(resources: Sequence[AccessResource], *, expected_sha256: str) -> str:
    if not _valid_sha256(expected_sha256):
        raise AccessibilityError("validated resource snapshot SHA-256 is invalid")
    sources = sorted({item.source_snapshot_sha256 for item in resources})
    if not sources:
        return expected_sha256
    if len(sources) != 1 or sources[0] != expected_sha256:
        raise AccessibilityError("one access calculation cannot mix resource source snapshots")
    return expected_sha256


def _prepare_resources(
    graph: WalkingGraph,
    resources: Sequence[AccessResource],
    *,
    categories: frozenset[ResourceCategory],
    resource_in_review_area: ResourceInReviewArea,
    require_snap: bool,
    require_scoring_eligibility: bool,
) -> tuple[tuple[_PreparedResource, ...], tuple[str, ...], tuple[str, ...]]:
    selected: list[_PreparedResource] = []
    excluded: list[str] = []
    unroutable: list[str] = []

    for item in sorted(resources, key=lambda value: value.resource_id):
        if item.category not in categories:
            continue
        if not item.active:
            excluded.append(item.resource_id)
            continue
        if require_scoring_eligibility and not item.scoring_eligible:
            excluded.append(item.resource_id)
            continue
        if not require_scoring_eligibility and item.scoring_eligible:
            raise AccessibilityError(
                f"contextual resource {item.resource_id} cannot be scoring eligible"
            )
        if item.coordinate_state not in _COORDINATE_STATES:
            raise AccessibilityError(
                f"resource {item.resource_id} has an unsupported coordinate state"
            )
        if (
            item.coordinate_state not in _ROUTABLE_COORDINATE_STATES
            or not _finite(item.x)
            or not _finite(item.y)
        ):
            if require_snap:
                raise AccessibilityError(
                    f"full-service grocery {item.resource_id} has an invalid coordinate"
                )
            selected.append(_PreparedResource(item, None))
            unroutable.append(item.resource_id)
            continue
        assert item.x is not None and item.y is not None
        if not resource_in_review_area(item.x, item.y):
            excluded.append(item.resource_id)
            continue
        snapped = snap_point(graph, x=item.x, y=item.y)
        if snapped is None:
            if require_snap:
                raise AccessibilityError(
                    f"full-service grocery {item.resource_id} is outside the snap tolerance"
                )
            selected.append(_PreparedResource(item, None))
            unroutable.append(item.resource_id)
            continue
        selected.append(_PreparedResource(item, snapped.node_id))
    return tuple(selected), tuple(excluded), tuple(unroutable)


def _context_quality(resources: Sequence[AccessResource], *, snapshot_quality_status: str) -> str:
    if not snapshot_quality_status:
        raise AccessibilityError("context resource snapshot quality status cannot be empty")
    statuses = sorted({item.quality_status for item in resources})
    if not statuses:
        return snapshot_quality_status
    if statuses == ["verified"]:
        row_quality = "verified"
    elif len(statuses) == 1:
        row_quality = statuses[0]
    elif "stale_unverified_context" in statuses:
        row_quality = "stale_unverified_context"
    else:
        row_quality = "mixed_context_quality"
    if row_quality != snapshot_quality_status:
        raise AccessibilityError("context resource rows conflict with snapshot quality status")
    return snapshot_quality_status


def _missing_walking_result(
    *,
    origin: TractOrigin,
    approved_area_id: str,
    graph: WalkingGraph,
    resource_source_sha256: str,
    scoring_eligible: bool,
    resource_categories: tuple[ResourceCategory, ...],
    excluded_resource_ids: tuple[str, ...],
    unroutable_resource_ids: tuple[str, ...],
    quality_reason: str,
) -> WalkingAccessResult:
    return WalkingAccessResult(
        geoid=origin.geoid,
        approved_area_id=approved_area_id,
        nearest_resource_id=None,
        reachable=None,
        network_distance_m=None,
        walk_minutes=None,
        count_within_10_minutes=None,
        count_within_15_minutes=None,
        count_within_20_minutes=None,
        scoring_eligible=scoring_eligible,
        resource_categories=resource_categories,
        contributing_resource_ids=(),
        contributing_resource_distances_m=(),
        excluded_resource_ids=excluded_resource_ids,
        unroutable_resource_ids=unroutable_resource_ids,
        quality_status="missing",
        quality_reason=quality_reason,
        origin_source_sha256=origin.source_snapshot_sha256,
        resource_source_sha256=resource_source_sha256,
        graph_sha256=graph.graph_sha256,
        graph_version=graph.version,
        graph_approved_for_scoring=graph_is_approved_for_scoring(graph),
        thresholds_m=tuple(WALK_THRESHOLDS_M.items()),
    )


def _calculate_walking_access(
    graph: WalkingGraph,
    *,
    origins: Sequence[TractOrigin],
    resources: Sequence[AccessResource],
    resource_snapshot_sha256: str,
    approved_area_for_origin: ApprovedAreaForOrigin,
    resource_in_review_area: ResourceInReviewArea,
    categories: frozenset[ResourceCategory],
    scoring_eligible: bool,
    require_resource_snap: bool,
    allow_unapproved_graph: bool,
    context_snapshot_quality_status: str | None,
) -> tuple[WalkingAccessResult, ...]:
    if not graph_is_approved_for_scoring(graph) and not allow_unapproved_graph:
        raise AccessibilityError("walking graph is not approved for scoring calculations")
    _validate_unique_resources(resources)
    relevant_resources = tuple(item for item in resources if item.category in categories)
    resource_source_sha256 = _single_resource_source(
        relevant_resources, expected_sha256=resource_snapshot_sha256
    )
    prepared, excluded, initially_unroutable = _prepare_resources(
        graph,
        resources,
        categories=categories,
        resource_in_review_area=resource_in_review_area,
        require_snap=require_resource_snap,
        require_scoring_eligibility=scoring_eligible,
    )
    contextual_quality = (
        "verified"
        if scoring_eligible
        else _context_quality(
            relevant_resources,
            snapshot_quality_status=context_snapshot_quality_status or "",
        )
    )
    resource_categories = tuple(
        sorted({item.category for item in relevant_resources}, key=lambda item: item.value)
    )
    target_ids_by_node: dict[int, list[str]] = {}
    for item in prepared:
        if item.node_id is not None:
            target_ids_by_node.setdefault(item.node_id, []).append(item.resource.resource_id)
    nearest_by_node = nearest_target_distances(graph, targets_by_node=target_ids_by_node)
    results: list[WalkingAccessResult] = []

    for origin, approved_area_id in _validate_origins(origins, approved_area_for_origin):
        origin_snap = snap_point(graph, x=origin.x, y=origin.y)
        if origin_snap is None:
            results.append(
                _missing_walking_result(
                    origin=origin,
                    approved_area_id=approved_area_id,
                    graph=graph,
                    resource_source_sha256=resource_source_sha256,
                    scoring_eligible=scoring_eligible,
                    resource_categories=resource_categories,
                    excluded_resource_ids=excluded,
                    unroutable_resource_ids=initially_unroutable,
                    quality_reason="origin_unsnapped",
                )
            )
            continue

        local_distances = shortest_distances(
            graph,
            source_node_id=origin_snap.node_id,
            cutoff_m=TWENTY_MINUTES_M,
        )
        threshold_resources: list[tuple[Decimal, str]] = []
        for item in prepared:
            if item.node_id is not None and item.node_id in local_distances:
                threshold_resources.append(
                    (local_distances[item.node_id], item.resource.resource_id)
                )
        threshold_resources.sort(key=lambda item: (item[0], item[1]))

        counts = {
            minutes: sum(distance <= threshold for distance, _resource_id in threshold_resources)
            for minutes, threshold in WALK_THRESHOLDS_M.items()
        }
        nearest = nearest_by_node.get(origin_snap.node_id)
        if nearest is not None:
            nearest_distance, nearest_id = nearest
            contributing_distances = {
                resource_id: distance for distance, resource_id in threshold_resources
            }
            contributing_distances[nearest_id] = nearest_distance
            contributing = tuple(sorted(contributing_distances))
            quality_status = "verified" if scoring_eligible else contextual_quality
            quality_reason = None
            is_reachable = True
        else:
            nearest_distance = None
            nearest_id = None
            contributing = ()
            contributing_distances = {}
            quality_status = "unreachable" if scoring_eligible else contextual_quality
            if target_ids_by_node:
                quality_reason = "disconnected_network"
            elif initially_unroutable and not scoring_eligible:
                quality_reason = "unroutable_context"
            else:
                quality_reason = "no_qualifying_resource"
            is_reachable = False

        results.append(
            WalkingAccessResult(
                geoid=origin.geoid,
                approved_area_id=approved_area_id,
                nearest_resource_id=nearest_id,
                reachable=is_reachable,
                network_distance_m=nearest_distance,
                walk_minutes=(
                    _CALCULATION_CONTEXT.divide(nearest_distance, WALK_SPEED_M_PER_MINUTE)
                    if nearest_distance is not None
                    else None
                ),
                count_within_10_minutes=counts[10],
                count_within_15_minutes=counts[15],
                count_within_20_minutes=counts[20],
                scoring_eligible=scoring_eligible,
                resource_categories=resource_categories,
                contributing_resource_ids=contributing,
                contributing_resource_distances_m=tuple(
                    (resource_id, contributing_distances[resource_id])
                    for resource_id in contributing
                ),
                excluded_resource_ids=excluded,
                unroutable_resource_ids=initially_unroutable,
                quality_status=quality_status,
                quality_reason=quality_reason,
                origin_source_sha256=origin.source_snapshot_sha256,
                resource_source_sha256=resource_source_sha256,
                graph_sha256=graph.graph_sha256,
                graph_version=graph.version,
                graph_approved_for_scoring=graph_is_approved_for_scoring(graph),
                thresholds_m=tuple(WALK_THRESHOLDS_M.items()),
            )
        )
    return tuple(results)


def calculate_grocery_access(
    graph: WalkingGraph,
    *,
    origins: Sequence[TractOrigin],
    resources: Sequence[AccessResource],
    resource_snapshot_sha256: str,
    approved_area_for_origin: ApprovedAreaForOrigin,
    resource_in_review_area: ResourceInReviewArea,
    allow_unapproved_graph: bool = False,
) -> tuple[WalkingAccessResult, ...]:
    """Calculate scoring access to active, explicitly classified full-service groceries."""

    return _calculate_walking_access(
        graph,
        origins=origins,
        resources=resources,
        resource_snapshot_sha256=resource_snapshot_sha256,
        approved_area_for_origin=approved_area_for_origin,
        resource_in_review_area=resource_in_review_area,
        categories=frozenset({ResourceCategory.FULL_SERVICE_GROCERY}),
        scoring_eligible=True,
        require_resource_snap=True,
        allow_unapproved_graph=allow_unapproved_graph,
        context_snapshot_quality_status=None,
    )


def calculate_contextual_access(
    graph: WalkingGraph,
    *,
    origins: Sequence[TractOrigin],
    resources: Sequence[AccessResource],
    resource_snapshot_sha256: str,
    resource_snapshot_quality_status: str,
    approved_area_for_origin: ApprovedAreaForOrigin,
    resource_in_review_area: ResourceInReviewArea,
    allow_unapproved_graph: bool = False,
) -> tuple[WalkingAccessResult, ...]:
    """Calculate non-scoring emergency-resource access with source quality attached."""

    return _calculate_walking_access(
        graph,
        origins=origins,
        resources=resources,
        resource_snapshot_sha256=resource_snapshot_sha256,
        approved_area_for_origin=approved_area_for_origin,
        resource_in_review_area=resource_in_review_area,
        categories=_EMERGENCY_CATEGORIES,
        scoring_eligible=False,
        require_resource_snap=False,
        allow_unapproved_graph=allow_unapproved_graph,
        context_snapshot_quality_status=resource_snapshot_quality_status,
    )


def project_gtfs_stops(gtfs: NormalizedGtfs) -> tuple[GtfsStopAccess, ...]:
    """Project every validated feed stop into the fixed walking-network CRS."""

    projected: list[GtfsStopAccess] = []
    for item in sorted(gtfs.stops, key=lambda value: value.stop_id):
        x, y = _GTFS_TRANSFORMER.transform(float(item.longitude), float(item.latitude))
        stop = GtfsStopAccess(item.stop_id, Decimal(str(x)), Decimal(str(y)))
        if not _finite(stop.x) or not _finite(stop.y):
            raise AccessibilityError(f"GTFS stop {item.stop_id} could not be projected")
        projected.append(stop)
    if len(projected) != len(gtfs.stops):
        raise AccessibilityError("projected GTFS stop coverage is incomplete")
    return tuple(projected)


def _projected_stops_sha256(stops: Sequence[GtfsStopAccess]) -> str:
    payload = {
        "version": GTFS_STOP_PROJECTION_VERSION,
        "stops": [[item.stop_id, str(item.x), str(item.y)] for item in stops],
    }
    return hashlib.sha256(canonical_json_bytes(payload)).hexdigest()


def calculate_transit_access(
    graph: WalkingGraph,
    *,
    origins: Sequence[TractOrigin],
    gtfs: NormalizedGtfs,
    analysis_dates: GtfsAnalysisDates,
    approved_area_for_origin: ApprovedAreaForOrigin,
    allow_unapproved_graph: bool = False,
) -> tuple[TransitAccessResult, ...]:
    """Calculate scheduled service reachable within the inclusive ten-minute network walk."""

    if not graph_is_approved_for_scoring(graph) and not allow_unapproved_graph:
        raise AccessibilityError("walking graph is not approved for scoring calculations")
    prepared_stops = project_gtfs_stops(gtfs)
    projected_stops_sha256 = _projected_stops_sha256(prepared_stops)
    snapped_stops = tuple(
        (item.stop_id, snapped.node_id)
        for item in prepared_stops
        if (snapped := snap_point(graph, x=item.x, y=item.y)) is not None
    )
    results: list[TransitAccessResult] = []
    for origin, approved_area_id in _validate_origins(origins, approved_area_for_origin):
        origin_snap = snap_point(graph, x=origin.x, y=origin.y)
        if origin_snap is None:
            reachable_stop_ids: tuple[str, ...] | None = None
            reachable_stop_distances_m: tuple[tuple[str, Decimal], ...] | None = None
        else:
            distances = shortest_distances(
                graph,
                source_node_id=origin_snap.node_id,
                cutoff_m=TEN_MINUTES_M,
            )
            reachable_stop_ids = tuple(
                stop_id for stop_id, stop_node_id in snapped_stops if stop_node_id in distances
            )
            reachable_stop_distances_m = tuple(
                (stop_id, distances[stop_node_id])
                for stop_id, stop_node_id in snapped_stops
                if stop_node_id in distances
            )

        summary = summarize_scheduled_service(
            gtfs,
            reachable_stop_ids=reachable_stop_ids,
            analysis_dates=analysis_dates,
        )
        quality_reason = "origin_unsnapped" if origin_snap is None else summary.quality_reason
        results.append(
            TransitAccessResult(
                geoid=origin.geoid,
                approved_area_id=approved_area_id,
                reachable_stop_ids=reachable_stop_ids,
                reachable_stop_distances_m=reachable_stop_distances_m,
                tuesday_departures=summary.tuesday_departures,
                saturday_departures=summary.saturday_departures,
                scheduled_service_intensity=summary.scheduled_service_intensity,
                quality_status=summary.quality_status,
                quality_reason=quality_reason,
                origin_source_sha256=origin.source_snapshot_sha256,
                gtfs_source_sha256=gtfs.archive_sha256,
                projected_stops_sha256=projected_stops_sha256,
                graph_sha256=graph.graph_sha256,
                graph_version=graph.version,
                graph_approved_for_scoring=graph_is_approved_for_scoring(graph),
                analysis_dates=(analysis_dates.tuesday, analysis_dates.saturday),
                feed_validity_dates=(gtfs.feed_valid_from, gtfs.feed_valid_through),
            )
        )
    return tuple(results)


__all__ = [
    "ACCESSIBILITY_CALCULATION_VERSION",
    "FIFTEEN_MINUTES_M",
    "GTFS_STOP_PROJECTION_VERSION",
    "TEN_MINUTES_M",
    "TWENTY_MINUTES_M",
    "WALK_SPEED_M_PER_MINUTE",
    "WALK_THRESHOLDS_M",
    "AccessResource",
    "AccessibilityError",
    "GtfsStopAccess",
    "TractOrigin",
    "TransitAccessResult",
    "WalkingAccessResult",
    "calculate_contextual_access",
    "calculate_grocery_access",
    "calculate_transit_access",
    "project_gtfs_stops",
]
