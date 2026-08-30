"""Lossless adapters from normalized Food outputs to deterministic persistence rows."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from pipelines.common.artifacts import JsonValue, SnapshotManifest
from pipelines.food_equity.accessibility import TransitAccessResult, WalkingAccessResult
from pipelines.food_equity.emergency_food import EmergencyFoodRecord
from pipelines.food_equity.models import MethodologyRegistry
from pipelines.food_equity.origins import NormalizedTractOrigin
from pipelines.food_equity.retail import ClassificationEvidence, RetailerRecord
from pipelines.food_equity.sram import SramRecord
from pipelines.food_equity.vehicle_access import VehicleAccessObservation
from pipelines.food_equity.write_plan import (
    AccessMetricNaturalKey,
    AccessMetricPersistenceRow,
    MetricSnapshotLinkPersistenceRow,
    PersistenceInputs,
    ResourcePersistenceRow,
    ResourceVersionNaturalKey,
    ResourceVersionPersistenceRow,
    SnapshotNaturalKey,
    SnapshotPersistenceRow,
    SourcePersistenceRow,
    WritePlanError,
    canonical_sha256,
)

PERSISTED_SOURCE_KEYS = frozenset(
    {
        "sram",
        "snap_retailers",
        "acs_vehicle",
        "tract_origins",
        "mcts_gtfs",
        "walking_network",
        "emergency_food_context",
    }
)
METRIC_LINEAGE_SOURCES = {
    "sram_snap_low_access_share_1mi": ("sram",),
    "full_service_grocery_walk_access": (
        "snap_retailers",
        "tract_origins",
        "walking_network",
    ),
    "households_no_vehicle": ("acs_vehicle",),
    "scheduled_transit_service_intensity": (
        "mcts_gtfs",
        "tract_origins",
        "walking_network",
    ),
    "full_service_grocery_count_10_min_context": (
        "snap_retailers",
        "tract_origins",
        "walking_network",
    ),
    "full_service_grocery_count_15_min_context": (
        "snap_retailers",
        "tract_origins",
        "walking_network",
    ),
    "full_service_grocery_count_20_min_context": (
        "snap_retailers",
        "tract_origins",
        "walking_network",
    ),
    "emergency_food_count_10_min_context": (
        "emergency_food_context",
        "tract_origins",
        "walking_network",
    ),
    "emergency_food_count_15_min_context": (
        "emergency_food_context",
        "tract_origins",
        "walking_network",
    ),
    "emergency_food_count_20_min_context": (
        "emergency_food_context",
        "tract_origins",
        "walking_network",
    ),
}


def _json_value(value: object) -> JsonValue:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return value
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Enum):
        return _json_value(value.value)
    if isinstance(value, Mapping):
        output: dict[str, JsonValue] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise WritePlanError("persistence metadata keys must be strings")
            output[key] = _json_value(item)
        return output
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_json_value(item) for item in value]
    raise WritePlanError(f"unsupported persistence metadata type: {type(value).__name__}")


def _metadata(value: Mapping[str, object]) -> dict[str, JsonValue]:
    converted = _json_value(value)
    if not isinstance(converted, dict):
        raise AssertionError("mapping did not remain a JSON object")
    return converted


def _retrieved_at(manifest: SnapshotManifest) -> datetime:
    try:
        parsed = datetime.fromisoformat(manifest.retrieved_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise WritePlanError("snapshot retrieval timestamp must be ISO-8601") from error
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise WritePlanError("snapshot retrieval timestamp must be timezone-aware")
    return parsed


def _snapshot_key(manifest: SnapshotManifest) -> SnapshotNaturalKey:
    return SnapshotNaturalKey(
        manifest.source_key,
        manifest.dataset_version,
        manifest.checksum_sha256,
    )


def _sources_and_snapshots(
    registry: MethodologyRegistry,
    manifests: Mapping[str, SnapshotManifest],
) -> tuple[tuple[SourcePersistenceRow, ...], tuple[SnapshotPersistenceRow, ...]]:
    if set(manifests) != PERSISTED_SOURCE_KEYS:
        raise WritePlanError("persistence requires all and only seven approved source manifests")
    definitions = {item.key: item for item in registry.sources}
    sources: list[SourcePersistenceRow] = []
    snapshots: list[SnapshotPersistenceRow] = []
    for source_key in sorted(manifests):
        manifest = manifests[source_key]
        if manifest.source_key != source_key:
            raise WritePlanError("source manifest key does not match its persistence key")
        definition = definitions[source_key]
        status = "stale" if source_key == "emergency_food_context" else "active"
        sources.append(
            SourcePersistenceRow(
                key=source_key,
                name=definition.name,
                publisher=definition.publisher,
                source_url=manifest.source_url,
                dataset_version=manifest.dataset_version,
                geography=definition.geography,
                retrieved_at=_retrieved_at(manifest),
                license=manifest.license,
                status=status,
                update_frequency=definition.update_frequency,
                methodology_url=definition.methodology_url,
                notes=f"registry_status={definition.status.value}",
            )
        )
        document = manifest.as_dict()
        snapshots.append(
            SnapshotPersistenceRow(
                key=_snapshot_key(manifest),
                retrieved_at=_retrieved_at(manifest),
                byte_size=manifest.byte_size,
                storage_uri=manifest.storage_uri,
                row_or_feature_count=manifest.row_or_feature_count,
                schema_fingerprint=manifest.schema_fingerprint,
                snapshot_fingerprint=canonical_sha256(document),
                request_metadata=manifest.request_metadata,
            )
        )
    return tuple(sources), tuple(snapshots)


def _canonical_resource_key(source_key: str, source_record_id: str) -> str:
    return canonical_sha256({"source_key": source_key, "source_record_id": source_record_id})


def _evidence_document(evidence: ClassificationEvidence | None) -> dict[str, JsonValue]:
    if evidence is None:
        return {"evidence_status": "source_rule_only"}
    return _metadata(
        {
            "asserted_classification": evidence.asserted_classification,
            "evidence_type": evidence.evidence_type,
            "evidence_url": evidence.evidence_url,
            "notes": evidence.notes,
            "partner_document_reference": evidence.partner_document_reference,
            "verifier": evidence.verifier,
            "verified_at": evidence.verified_at,
        }
    )


def _retailer_rows(
    records: Sequence[RetailerRecord], snapshot: SnapshotNaturalKey
) -> tuple[
    tuple[ResourcePersistenceRow, ...],
    tuple[ResourceVersionPersistenceRow, ...],
    Mapping[str, ResourceVersionNaturalKey],
]:
    resources: dict[str, ResourcePersistenceRow] = {}
    versions: list[ResourceVersionPersistenceRow] = []
    scoring_versions: dict[str, ResourceVersionNaturalKey] = {}
    for record in records:
        canonical_key = _canonical_resource_key(record.source_key, record.source_record_id)
        resources.setdefault(
            record.source_record_id,
            ResourcePersistenceRow(
                source_key=record.source_key,
                source_record_id=record.source_record_id,
                canonical_resource_key=canonical_key,
            ),
        )
        natural_key = ResourceVersionNaturalKey(
            canonical_key,
            snapshot,
            record.authorization_date,
            record.end_date,
        )
        evidence = _evidence_document(record.classification_evidence)
        evidence.update(
            {
                "authorization_status": record.authorization_status,
                "classification_reason": record.classification_reason,
                "in_review_buffer": record.in_review_buffer,
                "source_store_type": record.source_store_type,
                "status_reason": record.status_reason,
            }
        )
        version_document = {
            "active": record.active,
            "address": record.address,
            "category": record.category.value,
            "city": record.city,
            "classification_evidence": evidence,
            "coordinate_status": record.coordinate_status,
            "full_service_grocery": record.full_service_grocery,
            "latitude": record.latitude,
            "longitude": record.longitude,
            "name": record.name,
            "snap_authorized": record.snap_authorized,
            "source_record_id": record.source_record_id,
            "subtype": record.source_store_type,
            "valid_from": record.authorization_date,
            "valid_to": record.end_date,
            "verification_status": record.verification_status,
        }
        versions.append(
            ResourceVersionPersistenceRow(
                key=natural_key,
                version_fingerprint=canonical_sha256(_json_value(version_document)),
                category=record.category.value,
                name=record.name,
                subtype=record.source_store_type,
                address=record.address,
                city=record.city,
                postal_code=record.zip_code,
                website=None,
                phone=None,
                hours=None,
                longitude=record.longitude,
                latitude=record.latitude,
                coordinate_status=record.coordinate_status,
                verification_status=record.verification_status,
                classification_evidence=evidence,
                full_service_grocery=record.full_service_grocery,
                snap_authorized=record.snap_authorized,
                active=record.active,
                verified_at=(
                    record.classification_evidence.verified_at
                    if record.classification_evidence is not None
                    else None
                ),
            )
        )
        if record.scoring_eligible:
            if record.source_record_id in scoring_versions:
                raise WritePlanError("multiple scoring-eligible versions share one retailer ID")
            scoring_versions[record.source_record_id] = natural_key
    return (
        tuple(sorted(resources.values(), key=lambda item: item.canonical_resource_key)),
        tuple(
            sorted(
                versions,
                key=lambda item: (
                    item.key.canonical_resource_key,
                    item.key.valid_from or date.min,
                    item.key.valid_to or date.max,
                ),
            )
        ),
        scoring_versions,
    )


def _emergency_rows(
    records: Sequence[EmergencyFoodRecord], snapshot: SnapshotNaturalKey
) -> tuple[tuple[ResourcePersistenceRow, ...], tuple[ResourceVersionPersistenceRow, ...]]:
    resources: list[ResourcePersistenceRow] = []
    versions: list[ResourceVersionPersistenceRow] = []
    for record in records:
        canonical_key = _canonical_resource_key(record.source_key, record.source_record_id)
        resource = ResourcePersistenceRow(
            source_key=record.source_key,
            source_record_id=record.source_record_id,
            canonical_resource_key=canonical_key,
        )
        evidence = _metadata(
            {
                "active_status": record.active_status,
                "conflict_group_id": record.conflict_group_id,
                "conflict_status": record.conflict_status,
                "context_status": record.context_status,
                "hours_status": record.hours_status,
                "reuse_terms_confirmed": record.reuse_terms_confirmed,
                "routing_status": record.routing_status,
                "source_type": record.source_type,
            }
        )
        natural_key = ResourceVersionNaturalKey(canonical_key, snapshot, None, None)
        version_document = {
            "active": record.active,
            "address": record.address,
            "category": record.category.value,
            "city": record.city,
            "classification_evidence": evidence,
            "coordinate_status": record.coordinate_status,
            "latitude": record.latitude,
            "longitude": record.longitude,
            "name": record.name,
            "source_record_id": record.source_record_id,
            "verification_date": record.verification_date,
            "verification_status": record.context_status,
        }
        resources.append(resource)
        versions.append(
            ResourceVersionPersistenceRow(
                key=natural_key,
                version_fingerprint=canonical_sha256(_json_value(version_document)),
                category=record.category.value,
                name=record.name,
                subtype=record.source_type,
                address=record.address,
                city=record.city,
                postal_code=record.zip_code,
                website=record.website,
                phone=record.phone,
                hours=None,
                longitude=record.longitude,
                latitude=record.latitude,
                coordinate_status=record.coordinate_status,
                verification_status=record.context_status,
                classification_evidence=evidence,
                full_service_grocery=False,
                snap_authorized=None,
                active=None,
                verified_at=record.verification_date,
            )
        )
    return (
        tuple(sorted(resources, key=lambda item: item.canonical_resource_key)),
        tuple(sorted(versions, key=lambda item: item.key.canonical_resource_key)),
    )


def _quality_for_state(state: str, upstream: str) -> str:
    if state in {"missing", "suppressed", "conflicting"}:
        return state
    if upstream in {"verified", "provisional", "stale"}:
        return upstream
    if upstream == "stale_unverified_context":
        return "stale"
    if upstream == "unreachable":
        return "verified"
    raise WritePlanError(f"cannot persist unsupported access quality {upstream!r}")


def _access_row(
    *,
    geoid: str,
    metric_slug: str,
    value: Decimal | int | None,
    state: str,
    unit: str,
    calculation_version: str,
    quality_status: str,
    quality_metadata: Mapping[str, object],
    primary_snapshot: SnapshotNaturalKey,
    calculated_at: datetime,
    nearest_resource_version: ResourceVersionNaturalKey | None = None,
) -> AccessMetricPersistenceRow:
    decimal_value = Decimal(value) if isinstance(value, int) else value
    metadata = _metadata(quality_metadata)
    fingerprint = canonical_sha256(
        {
            "calculation_version": calculation_version,
            "geoid": geoid,
            "lineage_sources": list(METRIC_LINEAGE_SOURCES[metric_slug]),
            "metric_slug": metric_slug,
            "quality_metadata": metadata,
            "quality_status": quality_status,
            "state": state,
            "unit": unit,
            "value": format(decimal_value, "f") if decimal_value is not None else None,
        }
    )
    return AccessMetricPersistenceRow(
        key=AccessMetricNaturalKey(geoid, metric_slug, fingerprint),
        primary_snapshot=primary_snapshot,
        nearest_resource_version=nearest_resource_version,
        value=decimal_value,
        state=state,
        unit=unit,
        calculation_version=calculation_version,
        quality_status=quality_status,
        quality_metadata=metadata,
        calculated_at=calculated_at,
    )


def _walking_state(item: WalkingAccessResult) -> tuple[str, Decimal | None]:
    if item.reachable is True:
        return "observed", item.walk_minutes
    if item.reachable is False:
        return "unreachable", None
    return "missing", None


def _metric_rows(
    *,
    manifests: Mapping[str, SnapshotManifest],
    sram: Sequence[SramRecord],
    vehicle: Sequence[VehicleAccessObservation],
    grocery: Sequence[WalkingAccessResult],
    emergency: Sequence[WalkingAccessResult],
    transit: Sequence[TransitAccessResult],
    scoring_versions: Mapping[str, ResourceVersionNaturalKey],
    calculated_at: datetime,
) -> tuple[tuple[AccessMetricPersistenceRow, ...], tuple[MetricSnapshotLinkPersistenceRow, ...]]:
    snapshots = {key: _snapshot_key(value) for key, value in manifests.items()}
    rows: list[AccessMetricPersistenceRow] = []
    for sram_item in sram:
        state = "observed" if sram_item.population_share_beyond_one_mile is not None else "missing"
        rows.append(
            _access_row(
                geoid=sram_item.geoid,
                metric_slug=sram_item.metric_slug,
                value=sram_item.population_share_beyond_one_mile,
                state=state,
                unit=sram_item.unit,
                calculation_version="sram-normalization-v1",
                quality_status=_quality_for_state(state, sram_item.quality_status),
                quality_metadata={
                    "population_beyond_one_mile": sram_item.population_beyond_one_mile,
                    "quality_reason": sram_item.quality_reason,
                    "source_method": sram_item.source_method,
                },
                primary_snapshot=snapshots["sram"],
                calculated_at=calculated_at,
            )
        )
    for vehicle_item in vehicle:
        state = "observed" if vehicle_item.value is not None else "missing"
        rows.append(
            _access_row(
                geoid=vehicle_item.geoid,
                metric_slug=vehicle_item.metric_slug,
                value=vehicle_item.value,
                state=state,
                unit=vehicle_item.unit,
                calculation_version="acs-vehicle-v1",
                quality_status=_quality_for_state(state, vehicle_item.quality_status),
                quality_metadata={
                    **dict(vehicle_item.quality_metadata),
                    "coefficient_of_variation": vehicle_item.coefficient_of_variation,
                    "margin_of_error": vehicle_item.margin_of_error,
                    "quality_reason": vehicle_item.quality_reason,
                    "reliability": vehicle_item.reliability,
                },
                primary_snapshot=snapshots["acs_vehicle"],
                calculated_at=calculated_at,
            )
        )
    for grocery_item in grocery:
        state, value = _walking_state(grocery_item)
        nearest_version = (
            scoring_versions.get(grocery_item.nearest_resource_id)
            if grocery_item.nearest_resource_id is not None
            else None
        )
        if grocery_item.nearest_resource_id is not None and nearest_version is None:
            raise WritePlanError("nearest grocery does not resolve to its resource version")
        rows.append(
            _access_row(
                geoid=grocery_item.geoid,
                metric_slug="full_service_grocery_walk_access",
                value=value,
                state=state,
                unit="minutes",
                calculation_version=grocery_item.calculation_version,
                quality_status=_quality_for_state(state, grocery_item.quality_status),
                quality_metadata={
                    "contributing_resource_ids": grocery_item.contributing_resource_ids,
                    "graph_approved_for_scoring": grocery_item.graph_approved_for_scoring,
                    "graph_sha256": grocery_item.graph_sha256,
                    "graph_version": grocery_item.graph_version,
                    "nearest_resource_id": grocery_item.nearest_resource_id,
                    "network_distance_m": grocery_item.network_distance_m,
                    "quality_reason": grocery_item.quality_reason,
                },
                primary_snapshot=snapshots["snap_retailers"],
                nearest_resource_version=nearest_version,
                calculated_at=calculated_at,
            )
        )
        for minutes, count in (
            (10, grocery_item.count_within_10_minutes),
            (15, grocery_item.count_within_15_minutes),
            (20, grocery_item.count_within_20_minutes),
        ):
            context_state = "observed" if count is not None else "missing"
            rows.append(
                _access_row(
                    geoid=grocery_item.geoid,
                    metric_slug=f"full_service_grocery_count_{minutes}_min_context",
                    value=count,
                    state=context_state,
                    unit="count",
                    calculation_version=grocery_item.calculation_version,
                    quality_status=_quality_for_state(context_state, grocery_item.quality_status),
                    quality_metadata={
                        "graph_sha256": grocery_item.graph_sha256,
                        "quality_reason": grocery_item.quality_reason,
                        "threshold_minutes": minutes,
                    },
                    primary_snapshot=snapshots["snap_retailers"],
                    calculated_at=calculated_at,
                )
            )
    for emergency_item in emergency:
        for minutes, count in (
            (10, emergency_item.count_within_10_minutes),
            (15, emergency_item.count_within_15_minutes),
            (20, emergency_item.count_within_20_minutes),
        ):
            state = "observed" if count is not None else "missing"
            rows.append(
                _access_row(
                    geoid=emergency_item.geoid,
                    metric_slug=f"emergency_food_count_{minutes}_min_context",
                    value=count,
                    state=state,
                    unit="count",
                    calculation_version=emergency_item.calculation_version,
                    quality_status=_quality_for_state(state, emergency_item.quality_status),
                    quality_metadata={
                        "graph_sha256": emergency_item.graph_sha256,
                        "quality_reason": emergency_item.quality_reason,
                        "source_quality_status": emergency_item.quality_status,
                        "threshold_minutes": minutes,
                    },
                    primary_snapshot=snapshots["emergency_food_context"],
                    calculated_at=calculated_at,
                )
            )
    for transit_item in transit:
        state = "observed" if transit_item.scheduled_service_intensity is not None else "missing"
        rows.append(
            _access_row(
                geoid=transit_item.geoid,
                metric_slug="scheduled_transit_service_intensity",
                value=transit_item.scheduled_service_intensity,
                state=state,
                unit=transit_item.service_intensity_unit,
                calculation_version=transit_item.calculation_version,
                quality_status=_quality_for_state(state, transit_item.quality_status),
                quality_metadata={
                    "analysis_dates": transit_item.analysis_dates,
                    "feed_validity_dates": transit_item.feed_validity_dates,
                    "graph_sha256": transit_item.graph_sha256,
                    "projected_stops_sha256": transit_item.projected_stops_sha256,
                    "quality_reason": transit_item.quality_reason,
                    "reachable_stop_ids": transit_item.reachable_stop_ids,
                },
                primary_snapshot=snapshots["mcts_gtfs"],
                calculated_at=calculated_at,
            )
        )
    ordered_rows = tuple(sorted(rows, key=lambda item: (item.key.geoid, item.key.metric_slug)))
    links = tuple(
        MetricSnapshotLinkPersistenceRow(row.key, snapshots[source_key])
        for row in ordered_rows
        for source_key in METRIC_LINEAGE_SOURCES[row.key.metric_slug]
    )
    return ordered_rows, links


def build_persistence_inputs(
    *,
    registry: MethodologyRegistry,
    manifests: Mapping[str, SnapshotManifest],
    retailers: Sequence[RetailerRecord],
    emergency_resources: Sequence[EmergencyFoodRecord],
    origins: Sequence[NormalizedTractOrigin],
    sram: Sequence[SramRecord],
    vehicle: Sequence[VehicleAccessObservation],
    grocery_access: Sequence[WalkingAccessResult],
    emergency_access: Sequence[WalkingAccessResult],
    transit_access: Sequence[TransitAccessResult],
    geography_ids: Mapping[str, str],
    calculated_at: datetime,
) -> PersistenceInputs:
    """Adapt exact normalized outputs without inventing nullable resource facts."""

    origin_geoids = {item.geoid for item in origins}
    if origin_geoids != set(geography_ids):
        raise WritePlanError("origin GEOIDs do not match resolved database geographies")
    sources, snapshots = _sources_and_snapshots(registry, manifests)
    retailer_resources, retailer_versions, scoring_versions = _retailer_rows(
        retailers,
        _snapshot_key(manifests["snap_retailers"]),
    )
    emergency_rows, emergency_versions = _emergency_rows(
        emergency_resources,
        _snapshot_key(manifests["emergency_food_context"]),
    )
    access_rows, links = _metric_rows(
        manifests=manifests,
        sram=sram,
        vehicle=vehicle,
        grocery=grocery_access,
        emergency=emergency_access,
        transit=transit_access,
        scoring_versions=scoring_versions,
        calculated_at=calculated_at,
    )
    return PersistenceInputs(
        sources=sources,
        snapshots=snapshots,
        resources=(*retailer_resources, *emergency_rows),
        resource_versions=(*retailer_versions, *emergency_versions),
        access_metrics=access_rows,
        metric_snapshot_links=links,
        geography_ids=dict(geography_ids),
        manifests=tuple(manifests[key].as_dict() for key in sorted(manifests)),
        data_vintages={key: value.dataset_version for key, value in sorted(manifests.items())},
    )


__all__ = ["build_persistence_inputs"]
