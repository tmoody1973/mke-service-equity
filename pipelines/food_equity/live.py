"""Concrete official-source workflow behind the guarded Food Equity CLI."""

from __future__ import annotations

import json
import math
import os
import tempfile
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Protocol, cast

from pyproj import Transformer

from pipelines.common.artifacts import (
    SnapshotManifest,
    StoredSnapshot,
    canonical_json_bytes,
    load_stored_snapshot,
)
from pipelines.common.runner import coordinate_run
from pipelines.food_equity.accessibility import (
    AccessResource,
    TransitAccessResult,
    WalkingAccessResult,
    calculate_contextual_access,
    calculate_grocery_access,
    calculate_transit_access,
)
from pipelines.food_equity.database import PsycopgRunRepository, ResolvedBaseline
from pipelines.food_equity.emergency_food import (
    EmergencyFoodRecord,
    fetch_and_preserve_emergency_food,
    normalize_emergency_food,
    read_emergency_food_response,
)
from pipelines.food_equity.errors import FoodEquityError
from pipelines.food_equity.gtfs import (
    GtfsAnalysisDates,
    NormalizedGtfs,
    fetch_and_preserve_gtfs,
    normalize_gtfs,
    read_gtfs_archive,
    select_analysis_dates,
)
from pipelines.food_equity.models import ResourceCategory
from pipelines.food_equity.origins import (
    NormalizedTractOrigin,
    access_origins,
    fetch_and_preserve_tract_origins,
    normalize_tract_origins,
    read_tract_origins,
)
from pipelines.food_equity.persistence import build_persistence_inputs
from pipelines.food_equity.provenance import (
    CLASSIFICATION_EVIDENCE_SOURCE_KEY,
    preserve_classification_evidence,
    preserve_walking_network,
    validate_local_artifact,
)
from pipelines.food_equity.registry import load_registry
from pipelines.food_equity.retail import (
    RetailerRecord,
    fetch_and_preserve_retailers,
    normalize_retailers,
    read_classification_evidence,
    read_retailer_archive,
)
from pipelines.food_equity.runner import PipelineRunner, PipelineStage, StageState
from pipelines.food_equity.scoring import (
    FoodScoringResult,
    ScoreInputProvenance,
    build_scoring_metric_inputs,
    score_food_equity,
)
from pipelines.food_equity.spatial_context import SpatialContext, load_spatial_context
from pipelines.food_equity.sram import (
    SramRecord,
    fetch_and_preserve_sram,
    normalize_sram,
    read_sram_archive,
)
from pipelines.food_equity.vehicle_access import (
    VehicleAccessObservation,
    fetch_and_preserve_vehicle_access,
    normalize_vehicle_access,
)
from pipelines.food_equity.walking_network import (
    WalkingGraph,
    read_walking_network,
    validate_network_snapshot,
)
from pipelines.food_equity.write_plan import (
    PersistenceInputs,
    build_load_statements,
    build_write_plan,
)

STATE_PATH = Path("data/normalized/food-equity/fetched.json")
NORMALIZED_PATH = Path("data/normalized/food-equity/normalized.json")
CLASSIFIED_PATH = Path("data/normalized/food-equity/classified.json")
ACCESSIBILITY_PATH = Path("data/normalized/food-equity/accessibility.json")
SCORED_PATH = Path("data/normalized/food-equity/scored.json")
FOOD_SOURCE_KEYS = frozenset(
    {
        "acs_vehicle",
        "emergency_food_context",
        "mcts_gtfs",
        "snap_retailers",
        "sram",
        "tract_origins",
        "walking_network",
    }
)
WALKING_NETWORK_PATH_ENV = "MKE_FOOD_WALKING_NETWORK_PATH"
CLASSIFICATION_PATH_ENV = "MKE_FOOD_CLASSIFICATION_EVIDENCE_PATH"
CLASSIFICATION_SHA256_ENV = "MKE_FOOD_CLASSIFICATION_EVIDENCE_SHA256"
GTFS_VALIDATOR_JAR_ENV = "MKE_GTFS_VALIDATOR_JAR"
_PROJECTOR = Transformer.from_crs("EPSG:4326", "EPSG:3071", always_xy=True)


class LiveWorkflowError(FoodEquityError, ValueError):
    """Raised when live artifacts or runtime configuration violate the contract."""


class WorkflowLike(Protocol):
    def handle(self, stage: PipelineStage, state: StageState) -> Mapping[str, object]: ...


@dataclass(frozen=True, slots=True)
class NormalizedBundle:
    """Exact normalized source and access inputs rebuilt from immutable snapshots."""

    spatial: SpatialContext
    manifests: Mapping[str, SnapshotManifest]
    classification_sha256: str
    origins: tuple[NormalizedTractOrigin, ...]
    retailers: tuple[RetailerRecord, ...]
    emergency_resources: tuple[EmergencyFoodRecord, ...]
    sram: tuple[SramRecord, ...]
    vehicle: tuple[VehicleAccessObservation, ...]
    gtfs: NormalizedGtfs
    gtfs_dates: GtfsAnalysisDates
    graph: WalkingGraph
    grocery_access: tuple[WalkingAccessResult, ...]
    emergency_access: tuple[WalkingAccessResult, ...]
    transit_access: tuple[TransitAccessResult, ...]


def _write_json(path: Path, value: object) -> None:
    _replace_bytes(path, canonical_json_bytes(value))


def _replace_bytes(path: Path, content: bytes) -> None:
    """Atomically replace one mutable stage pointer or derived output."""

    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as temporary:
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
        temporary_path.replace(path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def _read_json(path: Path) -> Mapping[str, object]:
    try:
        value: object = json.loads(path.read_bytes())
    except FileNotFoundError as error:
        raise LiveWorkflowError(
            f"required Food fetch state is missing: {path.as_posix()}"
        ) from error
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise LiveWorkflowError(f"Food fetch state is invalid: {path.as_posix()}") from error
    if not isinstance(value, Mapping) or any(not isinstance(key, str) for key in value):
        raise LiveWorkflowError("Food fetch state must be an object")
    return cast(Mapping[str, object], value)


def _relative(root: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError as error:
        raise LiveWorkflowError("Food pipeline artifact escaped the workspace") from error


def _safe_path(root: Path, value: object) -> Path:
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise LiveWorkflowError("Food fetch state contains an invalid relative path")
    candidate = (root / value).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as error:
        raise LiveWorkflowError("Food fetch state path escaped the workspace") from error
    return candidate


def _snapshot_state(root: Path, snapshot: StoredSnapshot) -> dict[str, str]:
    return {"manifest_path": _relative(root, snapshot.manifest_path)}


def _state_snapshot(root: Path, value: object, source_key: str) -> StoredSnapshot:
    if not isinstance(value, Mapping):
        raise LiveWorkflowError(f"Food snapshot state for {source_key} must be an object")
    return load_stored_snapshot(
        root=root,
        manifest_path=_safe_path(root, value.get("manifest_path")),
        expected_source_key=source_key,
    )


def _retrieved_at(manifest: SnapshotManifest) -> datetime:
    try:
        value = datetime.fromisoformat(manifest.retrieved_at.replace("Z", "+00:00"))
    except ValueError as error:
        raise LiveWorkflowError("snapshot retrieval timestamp is invalid") from error
    if value.tzinfo is None or value.utcoffset() is None:
        raise LiveWorkflowError("snapshot retrieval timestamp must be timezone-aware")
    return value


def _required_environment_path(
    environment: Mapping[str, str], key: str, *, root: Path | None = None
) -> Path:
    value = environment.get(key)
    if not value:
        raise LiveWorkflowError(f"fetch requires {key}")
    candidate = Path(value).expanduser().resolve()
    if root is not None:
        try:
            candidate.relative_to(root)
        except ValueError as error:
            raise LiveWorkflowError(f"{key} must identify a file inside the workspace") from error
    if not candidate.is_file():
        raise LiveWorkflowError(f"{key} does not identify a readable file")
    return candidate


def _project_resource(
    *,
    resource_id: str,
    category: ResourceCategory,
    longitude: Decimal | None,
    latitude: Decimal | None,
    coordinate_state: str,
    source_key: str,
    source_sha256: str,
    quality_status: str,
    active: bool | None,
    scoring_eligible: bool,
) -> AccessResource:
    x: Decimal | None = None
    y: Decimal | None = None
    if longitude is not None and latitude is not None:
        projected_x, projected_y = _PROJECTOR.transform(float(longitude), float(latitude))
        if not math.isfinite(projected_x) or not math.isfinite(projected_y):
            raise LiveWorkflowError(f"resource {resource_id} could not be projected")
        x, y = Decimal(str(projected_x)), Decimal(str(projected_y))
    return AccessResource(
        resource_id=resource_id,
        category=category,
        x=x,
        y=y,
        coordinate_state=coordinate_state,
        source_key=source_key,
        source_snapshot_sha256=source_sha256,
        quality_status=quality_status,
        active=active,
        scoring_eligible=scoring_eligible,
    )


class LiveWorkflow:
    """Fetch once, then rebuild every stage from the exact immutable bundle."""

    def __init__(
        self,
        *,
        root: Path,
        environment: Mapping[str, str],
        clock: Callable[[], datetime],
    ) -> None:
        self.root = root.resolve()
        self.environment = environment
        self.clock = clock
        self.registry = load_registry()
        self._bundle_cache: NormalizedBundle | None = None
        self._baseline_cache: ResolvedBaseline | None = None
        self._scoring_cache: FoodScoringResult | None = None
        self._persistence_cache: PersistenceInputs | None = None

    def _fetch(self) -> Mapping[str, object]:
        if not self.environment.get("CENSUS_API_KEY"):
            raise LiveWorkflowError("fetch requires CENSUS_API_KEY")
        network_path = _required_environment_path(
            self.environment, WALKING_NETWORK_PATH_ENV, root=self.root
        )
        evidence_path = _required_environment_path(
            self.environment, CLASSIFICATION_PATH_ENV, root=self.root
        )
        evidence_sha256 = self.environment.get(CLASSIFICATION_SHA256_ENV, "")
        validator_path = _required_environment_path(self.environment, GTFS_VALIDATOR_JAR_ENV)

        spatial, _tiger_snapshot = load_spatial_context(self.root)
        validate_network_snapshot(network_path)
        validate_local_artifact(
            root=self.root,
            path=evidence_path,
            expected_sha256=evidence_sha256,
        )

        sram = fetch_and_preserve_sram(self.root, clock=self.clock)
        retailers = fetch_and_preserve_retailers(self.root, clock=self.clock)
        vehicle = fetch_and_preserve_vehicle_access(self.root, clock=self.clock)
        origins = fetch_and_preserve_tract_origins(self.root, clock=self.clock)
        emergency = fetch_and_preserve_emergency_food(
            self.root, clock=self.clock, registry=self.registry
        )
        gtfs = fetch_and_preserve_gtfs(
            self.root,
            clock=self.clock,
            service_area_contains=spatial.service_area_contains,
            validator_jar_path=validator_path,
            registry=self.registry,
        )
        network = preserve_walking_network(
            root=self.root,
            path=network_path,
            clock=self.clock,
            registry=self.registry,
        )
        classification = preserve_classification_evidence(
            root=self.root,
            path=evidence_path,
            expected_sha256=evidence_sha256,
            clock=self.clock,
            registry=self.registry,
        )
        snapshots = {
            "acs_vehicle": vehicle.snapshot,
            "emergency_food_context": emergency.snapshot,
            "mcts_gtfs": gtfs.snapshot,
            "snap_retailers": retailers.snapshot,
            "sram": sram.snapshot,
            "tract_origins": origins.snapshot,
            "walking_network": network,
        }
        _write_json(
            self.root / STATE_PATH,
            {
                "version": 1,
                "classification_evidence": _snapshot_state(self.root, classification.snapshot),
                "snapshots": {
                    key: _snapshot_state(self.root, snapshots[key]) for key in sorted(snapshots)
                },
                "tiger_snapshot_sha256": spatial.tiger_snapshot_sha256,
            },
        )
        self._bundle_cache = None
        return {
            "snapshot_count": len(snapshots),
            "classification_evidence_sha256": classification.checksum_sha256,
            "tiger_snapshot_sha256": spatial.tiger_snapshot_sha256,
        }

    def _snapshots(
        self,
    ) -> tuple[Mapping[str, StoredSnapshot], StoredSnapshot, SpatialContext]:
        state = _read_json(self.root / STATE_PATH)
        if state.get("version") != 1:
            raise LiveWorkflowError("Food fetch state version is unsupported")
        snapshot_state = state.get("snapshots")
        if not isinstance(snapshot_state, Mapping) or set(snapshot_state) != FOOD_SOURCE_KEYS:
            raise LiveWorkflowError("Food fetch state must contain the exact seven-source bundle")
        snapshots = {
            key: _state_snapshot(self.root, snapshot_state[key], key)
            for key in sorted(FOOD_SOURCE_KEYS)
        }
        classification = _state_snapshot(
            self.root,
            state.get("classification_evidence"),
            CLASSIFICATION_EVIDENCE_SOURCE_KEY,
        )
        spatial, _tiger = load_spatial_context(self.root)
        if state.get("tiger_snapshot_sha256") != spatial.tiger_snapshot_sha256:
            raise LiveWorkflowError("canonical TIGER snapshot changed after Food fetch")
        return snapshots, classification, spatial

    def _bundle(self) -> NormalizedBundle:
        if self._bundle_cache is not None:
            return self._bundle_cache
        snapshots, classification, spatial = self._snapshots()
        manifests = {key: value.manifest for key, value in snapshots.items()}
        geoids = spatial.geoids
        sram = normalize_sram(
            read_sram_archive(snapshots["sram"].raw_path.read_bytes()),
            expected_geoids=geoids,
        )
        retailers = normalize_retailers(
            read_retailer_archive(snapshots["snap_retailers"].raw_path.read_bytes()),
            classification_evidence=read_classification_evidence(
                classification.raw_path.read_bytes()
            ),
            review_buffer_contains=spatial.service_area_contains,
            registry=self.registry,
        )
        vehicle = normalize_vehicle_access(
            snapshots["acs_vehicle"].raw_path.read_bytes(), expected_geoids=geoids
        )
        origins_snapshot = snapshots["tract_origins"]
        origins = normalize_tract_origins(
            read_tract_origins(
                origins_snapshot.raw_path.read_bytes(),
                expected_sha256=origins_snapshot.manifest.checksum_sha256,
            ),
            expected_geoids=geoids,
            source_snapshot_sha256=origins_snapshot.manifest.checksum_sha256,
        )
        emergency_snapshot = snapshots["emergency_food_context"]
        emergency_resources = normalize_emergency_food(
            read_emergency_food_response(emergency_snapshot.raw_path.read_bytes()),
            retrieved_at=_retrieved_at(emergency_snapshot.manifest),
            reuse_terms_confirmed=False,
            verification_date=None,
            registry=self.registry,
        )
        gtfs_snapshot = snapshots["mcts_gtfs"]
        gtfs = normalize_gtfs(
            read_gtfs_archive(
                gtfs_snapshot.raw_path.read_bytes(),
                service_area_contains=spatial.service_area_contains,
            )
        )
        gtfs_dates = select_analysis_dates(gtfs, retrieved_at=_retrieved_at(gtfs_snapshot.manifest))
        graph = read_walking_network(
            snapshots["walking_network"].raw_path,
            clip_contains=spatial.review_area_contains_projected,
        )
        current_retailers = tuple(item for item in retailers if item.active)
        current_resource_ids = [item.source_record_id for item in current_retailers]
        if len(current_resource_ids) != len(set(current_resource_ids)):
            raise LiveWorkflowError(
                "retailer snapshot contains overlapping active versions for one resource"
            )
        grocery_resources = tuple(
            _project_resource(
                resource_id=item.source_record_id,
                category=item.category,
                longitude=item.longitude,
                latitude=item.latitude,
                coordinate_state=item.coordinate_status,
                source_key=item.source_key,
                source_sha256=manifests["snap_retailers"].checksum_sha256,
                quality_status=item.verification_status,
                active=item.active,
                scoring_eligible=item.scoring_eligible,
            )
            for item in current_retailers
        )
        emergency_access_resources = tuple(
            _project_resource(
                resource_id=item.source_record_id,
                category=item.category,
                longitude=item.longitude,
                latitude=item.latitude,
                coordinate_state=item.coordinate_status,
                source_key=item.source_key,
                source_sha256=manifests["emergency_food_context"].checksum_sha256,
                quality_status=item.context_status,
                active=item.active,
                scoring_eligible=False,
            )
            for item in emergency_resources
        )
        routing_origins = access_origins(origins)
        grocery_access = calculate_grocery_access(
            graph,
            origins=routing_origins,
            resources=grocery_resources,
            resource_snapshot_sha256=manifests["snap_retailers"].checksum_sha256,
            approved_area_for_origin=spatial.approved_area_for_origin,
            resource_in_review_area=spatial.review_area_contains_projected,
        )
        emergency_access = calculate_contextual_access(
            graph,
            origins=routing_origins,
            resources=emergency_access_resources,
            resource_snapshot_sha256=manifests["emergency_food_context"].checksum_sha256,
            resource_snapshot_quality_status="stale_unverified_context",
            approved_area_for_origin=spatial.approved_area_for_origin,
            resource_in_review_area=spatial.review_area_contains_projected,
        )
        transit_access = calculate_transit_access(
            graph,
            origins=routing_origins,
            gtfs=gtfs,
            analysis_dates=gtfs_dates,
            approved_area_for_origin=spatial.approved_area_for_origin,
        )
        self._bundle_cache = NormalizedBundle(
            spatial,
            manifests,
            classification.manifest.checksum_sha256,
            origins,
            retailers,
            emergency_resources,
            sram,
            vehicle,
            gtfs,
            gtfs_dates,
            graph,
            grocery_access,
            emergency_access,
            transit_access,
        )
        return self._bundle_cache

    def _repository(self) -> PsycopgRunRepository:
        return PsycopgRunRepository(
            self.environment.get("DATABASE_URL_UNPOOLED", ""), clock=self.clock
        )

    def _baseline(self) -> ResolvedBaseline:
        if self._baseline_cache is None:
            self._baseline_cache = self._repository().resolve_pinned_baseline()
        return self._baseline_cache

    def _scoring(self) -> FoodScoringResult:
        if self._scoring_cache is not None:
            return self._scoring_cache
        bundle = self._bundle()
        baseline = self._baseline()
        if not bundle.transit_access:
            raise LiveWorkflowError("transit access output is empty")
        transit = bundle.transit_access[0]
        provenance = ScoreInputProvenance(
            source_snapshot_sha256s={
                key: bundle.manifests[key].checksum_sha256
                for key in (
                    "sram",
                    "snap_retailers",
                    "acs_vehicle",
                    "tract_origins",
                    "mcts_gtfs",
                    "walking_network",
                )
            },
            full_service_classification_sha256=bundle.classification_sha256,
            walking_graph_sha256=bundle.graph.graph_sha256,
            walking_graph_version=bundle.graph.version,
            accessibility_calculation_version=transit.calculation_version,
            gtfs_projected_stops_sha256=transit.projected_stops_sha256,
            gtfs_stop_projection_version=transit.stop_projection_version,
            gtfs_analysis_dates=(
                transit.analysis_dates[0].isoformat(),
                transit.analysis_dates[1].isoformat(),
            ),
            gtfs_feed_validity_dates=(
                transit.feed_validity_dates[0].isoformat(),
                transit.feed_validity_dates[1].isoformat(),
            ),
            gtfs_window_start=self.registry.access.transit_window_start,
            gtfs_window_end=self.registry.access.transit_window_end,
        )
        self._scoring_cache = score_food_equity(
            baseline.run,
            baseline.scores,
            build_scoring_metric_inputs(
                bundle.sram,
                bundle.grocery_access,
                bundle.vehicle,
                bundle.transit_access,
            ),
            provenance,
            self.registry,
        )
        return self._scoring_cache

    def _persistence(self) -> PersistenceInputs:
        if self._persistence_cache is None:
            bundle = self._bundle()
            self._persistence_cache = build_persistence_inputs(
                registry=self.registry,
                manifests=bundle.manifests,
                retailers=bundle.retailers,
                emergency_resources=bundle.emergency_resources,
                origins=bundle.origins,
                sram=bundle.sram,
                vehicle=bundle.vehicle,
                grocery_access=bundle.grocery_access,
                emergency_access=bundle.emergency_access,
                transit_access=bundle.transit_access,
                geography_ids=self._baseline().geography_ids,
                calculated_at=self.clock(),
            )
        return self._persistence_cache

    @staticmethod
    def _summary(bundle: NormalizedBundle) -> dict[str, object]:
        return {
            "tract_count": len(bundle.origins),
            "retailer_version_count": len(bundle.retailers),
            "emergency_resource_count": len(bundle.emergency_resources),
            "sram_observation_count": len(bundle.sram),
            "vehicle_observation_count": len(bundle.vehicle),
            "gtfs_stop_count": len(bundle.gtfs.stops),
            "walking_graph_node_count": len(bundle.graph.nodes),
            "walking_graph_edge_count": len(bundle.graph.edges),
        }

    def handle(self, stage: PipelineStage, state: StageState) -> Mapping[str, object]:
        if stage is PipelineStage.FETCH:
            return self._fetch()
        bundle = self._bundle()
        if stage is PipelineStage.VALIDATE:
            return self._summary(bundle)
        if stage is PipelineStage.NORMALIZE:
            _write_json(self.root / NORMALIZED_PATH, self._summary(bundle))
            return {"normalized_path": NORMALIZED_PATH.as_posix()}
        if stage is PipelineStage.CLASSIFY:
            summary = {
                "retailer_version_count": len(bundle.retailers),
                "full_service_version_count": sum(
                    item.full_service_grocery for item in bundle.retailers
                ),
                "scoring_eligible_version_count": sum(
                    item.scoring_eligible for item in bundle.retailers
                ),
                "classification_evidence_sha256": bundle.classification_sha256,
            }
            _write_json(self.root / CLASSIFIED_PATH, summary)
            return {"classified_path": CLASSIFIED_PATH.as_posix(), **summary}
        if stage is PipelineStage.ACCESSIBILITY:
            summary = {
                "grocery_access_count": len(bundle.grocery_access),
                "emergency_context_count": len(bundle.emergency_access),
                "transit_access_count": len(bundle.transit_access),
                "walking_graph_sha256": bundle.graph.graph_sha256,
            }
            _write_json(self.root / ACCESSIBILITY_PATH, summary)
            return {"accessibility_path": ACCESSIBILITY_PATH.as_posix(), **summary}
        if stage is PipelineStage.LOAD:
            statements, _access, _links = build_load_statements(
                inputs=self._persistence(), registry=self.registry, now=self.clock()
            )
            self._repository().execute_transaction(statements)
            return {"base_record_statement_count": len(statements)}
        scoring = self._scoring()
        if stage is PipelineStage.SCORE:
            _replace_bytes(self.root / SCORED_PATH, scoring.canonical_output)
            return {"output_hash": scoring.canonical_output_hash}
        if stage is PipelineStage.VALIDATE_RUN:
            candidate, _plan = build_write_plan(
                root=self.root,
                environment=self.environment,
                clock=self.clock,
                registry=self.registry,
                scoring=scoring,
                inputs=self._persistence(),
            )
            outcome = coordinate_run(
                self._repository(),
                candidate,
                verify_existing=bool(state.get("verify_existing", False)),
            )
            return {
                "run_id": outcome.run.run_id,
                "reused": outcome.reused,
                "verified_existing": outcome.verified_existing,
                "output_hash": outcome.run.output_hash,
            }
        raise LiveWorkflowError(f"unsupported live stage {stage.value}")


def build_live_runner(
    *,
    root: Path | None = None,
    workflow: WorkflowLike | None = None,
    environment: Mapping[str, str] = os.environ,
    clock: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> PipelineRunner:
    """Build the concrete CLI runner with injectable, testable source operations."""

    live = workflow or LiveWorkflow(root=root or Path.cwd(), environment=environment, clock=clock)
    handlers = {
        stage: (lambda state, current=stage: live.handle(current, state)) for stage in PipelineStage
    }
    failure_repository = None
    database_url = environment.get("DATABASE_URL_UNPOOLED")
    if database_url:
        failure_repository = PsycopgRunRepository(database_url, clock=clock)
    return PipelineRunner(
        handlers=handlers,
        environment=environment,
        clock=clock,
        failure_repository=failure_repository,
    )


__all__ = ["LiveWorkflow", "LiveWorkflowError", "WorkflowLike", "build_live_runner"]
