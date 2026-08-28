"""Concrete official-source workflow behind the guarded CLI boundary."""

from __future__ import annotations

import json
import os
import tempfile
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Protocol, cast

import geopandas as gpd
from pipelines.equity_baseline.acs import (
    APPROVED_ACS_GROUPS,
    AcsNormalizationResult,
    fetch_and_preserve_acs_groups,
    normalize_acs,
)
from pipelines.equity_baseline.artifacts import (
    StoredSnapshot,
    canonical_json_bytes,
    preserve_snapshot,
    sha256_bytes,
)
from pipelines.equity_baseline.database import PsycopgRunRepository
from pipelines.equity_baseline.errors import EquityBaselineError
from pipelines.equity_baseline.geography import (
    REQUIRED_TIGER_COLUMNS,
    TIGER_2020_WISCONSIN_TRACTS_URL,
    GeographyRecord,
    normalize_canonical_tracts,
    read_canonical_tracts,
)
from pipelines.equity_baseline.http import fetch_bytes
from pipelines.equity_baseline.models import MethodologyRegistry, SourceDefinition
from pipelines.equity_baseline.places import (
    PlacesNormalizationResult,
    fetch_and_preserve_places,
    normalize_places,
)
from pipelines.equity_baseline.registry import load_registry
from pipelines.equity_baseline.runner import (
    PipelineRunner,
    PipelineStage,
    StageState,
    coordinate_run,
)
from pipelines.equity_baseline.scoring import (
    IndicatorInput,
    PopulationInput,
    ScoringResult,
    score_equity_baseline,
)
from pipelines.equity_baseline.write_plan import build_write_plan

STATE_PATH = Path("data/normalized/equity-baseline/fetched.json")
NORMALIZED_PATH = Path("data/normalized/equity-baseline/normalized.json")
SCORED_PATH = Path("data/normalized/equity-baseline/scored.json")


class LiveWorkflowError(EquityBaselineError, ValueError):
    """Raised when live artifacts or runtime configuration violate the contract."""


class WorkflowLike(Protocol):
    def handle(self, stage: PipelineStage, state: StageState) -> Mapping[str, object]: ...


@dataclass(frozen=True, slots=True)
class SnapshotInput:
    """A verified local snapshot plus its sanitized manifest."""

    logical_source: str
    manifest: Mapping[str, object]
    raw_path: Path
    content: bytes


@dataclass(frozen=True, slots=True)
class NormalizedBundle:
    """Reconstructed official-source inputs for persistence and scoring."""

    geographies: tuple[GeographyRecord, ...]
    acs: AcsNormalizationResult
    places: PlacesNormalizationResult
    snapshots: tuple[SnapshotInput, ...]


def _decimal(value: Decimal | None) -> str | None:
    return None if value is None else format(value, "f")


def _json_metadata(value: Mapping[str, object]) -> dict[str, object]:
    output: dict[str, object] = {}
    for key, item in value.items():
        if isinstance(item, Decimal):
            output[key] = format(item, "f")
        elif isinstance(item, Mapping):
            output[key] = _json_metadata(cast(Mapping[str, object], item))
        elif isinstance(item, (str, int, bool)) or item is None:
            output[key] = item
        else:
            output[key] = str(item)
    return output


def _write_json(path: Path, value: object) -> None:
    content = canonical_json_bytes(value)
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
        value = json.loads(path.read_bytes())
    except FileNotFoundError as error:
        raise LiveWorkflowError(f"required local artifact is missing: {path.as_posix()}") from error
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise LiveWorkflowError(f"required local artifact is invalid: {path.as_posix()}") from error
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise LiveWorkflowError(f"required local artifact must be an object: {path.as_posix()}")
    return cast(Mapping[str, object], value)


def _relative(root: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError as error:
        raise LiveWorkflowError("pipeline artifact escaped the workspace root") from error


def _safe_workspace_path(root: Path, value: object) -> Path:
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise LiveWorkflowError("pipeline state contains an invalid relative path")
    candidate = (root / value).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as error:
        raise LiveWorkflowError("pipeline state path escaped the workspace root") from error
    return candidate


def _snapshot_state(root: Path, snapshot: StoredSnapshot) -> dict[str, object]:
    return {
        "manifest_path": _relative(root, snapshot.manifest_path),
        "raw_path": _relative(root, snapshot.raw_path),
    }


def _manifest_string(manifest: Mapping[str, object], key: str) -> str:
    value = manifest.get(key)
    if not isinstance(value, str) or not value:
        raise LiveWorkflowError(f"snapshot manifest has invalid {key}")
    return value


def _load_snapshot(root: Path, state: object, logical_source: str) -> SnapshotInput:
    if not isinstance(state, Mapping):
        raise LiveWorkflowError(f"snapshot state for {logical_source} must be an object")
    manifest_path = _safe_workspace_path(root, state.get("manifest_path"))
    raw_path = _safe_workspace_path(root, state.get("raw_path"))
    manifest = _read_json(manifest_path)
    try:
        content = raw_path.read_bytes()
    except OSError as error:
        raise LiveWorkflowError(f"cannot read raw snapshot for {logical_source}") from error
    expected_size = manifest.get("byte_size")
    if not isinstance(expected_size, int) or expected_size != len(content):
        raise LiveWorkflowError(f"raw snapshot size mismatch for {logical_source}")
    if _manifest_string(manifest, "checksum_sha256") != sha256_bytes(content):
        raise LiveWorkflowError(f"raw snapshot checksum mismatch for {logical_source}")
    if _manifest_string(manifest, "storage_uri") != _relative(root, raw_path):
        raise LiveWorkflowError(f"raw snapshot path mismatch for {logical_source}")
    return SnapshotInput(logical_source, manifest, raw_path, content)


def _tiger_frame(content: bytes) -> gpd.GeoDataFrame:
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as temporary:
            temporary.write(content)
            temporary_path = Path(temporary.name)
        return gpd.read_file(temporary_path, engine="pyogrio")
    except (OSError, ValueError) as error:
        raise LiveWorkflowError("TIGER snapshot cannot be read as a vector archive") from error
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


def _source(registry: MethodologyRegistry, key: str) -> SourceDefinition:
    try:
        return next(item for item in registry.sources if item.key == key)
    except StopIteration as error:
        raise LiveWorkflowError(f"registry has no {key} source") from error


def _normalized_document(bundle: NormalizedBundle) -> dict[str, object]:
    observations: list[dict[str, object]] = []
    for acs_item in bundle.acs.observations:
        observations.append(
            {
                "source": "acs",
                "geoid": acs_item.geoid,
                "indicator_slug": acs_item.indicator_slug,
                "value": _decimal(acs_item.value),
                "margin_of_error": _decimal(acs_item.margin_of_error),
                "confidence_low": None,
                "confidence_high": None,
                "quality_status": acs_item.quality_status,
                "quality_reason": acs_item.quality_reason,
                "quality_metadata": _json_metadata(acs_item.quality_metadata),
            }
        )
    for places_item in bundle.places.observations:
        observations.append(
            {
                "source": "places",
                "geoid": places_item.geoid,
                "indicator_slug": places_item.indicator_slug,
                "value": _decimal(places_item.value),
                "margin_of_error": None,
                "confidence_low": _decimal(places_item.low_confidence_limit),
                "confidence_high": _decimal(places_item.high_confidence_limit),
                "quality_status": places_item.quality_status,
                "quality_reason": places_item.quality_reason,
                "quality_metadata": _json_metadata(places_item.quality_metadata),
            }
        )
    observations.sort(
        key=lambda item: (cast(str, item["geoid"]), cast(str, item["indicator_slug"]))
    )
    return {
        "geographies": [
            {
                "geoid": item.geoid,
                "name": item.name,
                "state_fips": item.state_fips,
                "county_fips": item.county_fips,
                "vintage": item.vintage,
                "geometry_wkb_hex": item.geometry.wkb_hex,
                "centroid_wkb_hex": item.centroid.wkb_hex,
            }
            for item in bundle.geographies
        ],
        "populations": [
            {
                "geoid": item.geoid,
                "value": _decimal(item.value),
                "margin_of_error": _decimal(item.margin_of_error),
                "quality_status": item.quality_status,
                "quality_reason": item.quality_reason,
            }
            for item in bundle.acs.populations
        ],
        "observations": observations,
    }


def _score(bundle: NormalizedBundle) -> ScoringResult:
    observations: list[IndicatorInput] = [
        IndicatorInput(
            acs_item.geoid,
            acs_item.indicator_slug,
            acs_item.value,
            acs_item.quality_status,
            acs_item.quality_metadata,
        )
        for acs_item in bundle.acs.observations
    ]
    observations.extend(
        IndicatorInput(
            places_item.geoid,
            places_item.indicator_slug,
            places_item.value,
            places_item.quality_status,
            places_item.quality_metadata,
        )
        for places_item in bundle.places.observations
    )
    populations = [
        PopulationInput(population.geoid, population.value) for population in bundle.acs.populations
    ]
    return score_equity_baseline(populations, observations)


class LiveWorkflow:
    """Rebuild deterministic state from pinned local snapshots for every stage."""

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

    def _fetch(self) -> Mapping[str, object]:
        if not self.environment.get("CENSUS_API_KEY"):
            raise LiveWorkflowError("fetch requires CENSUS_API_KEY")
        tiger_content = fetch_bytes(TIGER_2020_WISCONSIN_TRACTS_URL)
        tiger_frame = _tiger_frame(tiger_content)
        normalize_canonical_tracts(tiger_frame)
        tiger_source = _source(self.registry, "tiger")
        tiger_snapshot = preserve_snapshot(
            root=self.root,
            source_key="tiger",
            source_url=TIGER_2020_WISCONSIN_TRACTS_URL,
            dataset_version=tiger_source.vintage,
            content=tiger_content,
            schema={"columns": sorted(set(tiger_frame.columns) & REQUIRED_TIGER_COLUMNS)},
            row_or_feature_count=len(tiger_frame),
            license=tiger_source.license_notes,
            methodology_reference=self.registry.methodology_version,
            request_metadata={"dataset_identifier": "tl_2020_55_tract"},
            clock=self.clock,
        )
        acs = fetch_and_preserve_acs_groups(
            self.root,
            clock=self.clock,
            registry=self.registry,
        )
        places = fetch_and_preserve_places(
            self.root,
            clock=self.clock,
            registry=self.registry,
        )
        state = {
            "version": 1,
            "tiger": _snapshot_state(self.root, tiger_snapshot),
            "acs": {item.group: _snapshot_state(self.root, item.snapshot) for item in acs},
            "places": _snapshot_state(self.root, places.snapshot),
        }
        _write_json(self.root / STATE_PATH, state)
        return {"snapshot_count": 2 + len(acs)}

    def _bundle(self) -> NormalizedBundle:
        state = _read_json(self.root / STATE_PATH)
        tiger = _load_snapshot(self.root, state.get("tiger"), "tiger")
        places = _load_snapshot(self.root, state.get("places"), "places")
        acs_state = state.get("acs")
        if not isinstance(acs_state, Mapping) or set(acs_state) != set(APPROVED_ACS_GROUPS):
            raise LiveWorkflowError("fetched state must contain all approved ACS groups")
        acs_snapshots = tuple(
            _load_snapshot(self.root, acs_state[group], "acs") for group in APPROVED_ACS_GROUPS
        )
        geographies = read_canonical_tracts(tiger.raw_path)
        geoids = tuple(item.geoid for item in geographies)
        acs = normalize_acs(
            {
                group: snapshot.content
                for group, snapshot in zip(APPROVED_ACS_GROUPS, acs_snapshots, strict=True)
            },
            expected_geoids=geoids,
            registry=self.registry,
        )
        positive = tuple(
            item.geoid for item in acs.populations if item.value is not None and item.value > 0
        )
        normalized_places = normalize_places(
            places.content,
            canonical_geoids=geoids,
            positive_population_geoids=positive,
            registry=self.registry,
        )
        return NormalizedBundle(
            geographies,
            acs,
            normalized_places,
            (tiger, *acs_snapshots, places),
        )

    def _repository(self) -> PsycopgRunRepository:
        url = self.environment.get("DATABASE_URL_UNPOOLED", "")
        return PsycopgRunRepository(url, clock=self.clock)

    def handle(self, stage: PipelineStage, state: StageState) -> Mapping[str, object]:
        if stage is PipelineStage.FETCH:
            return self._fetch()
        bundle = self._bundle()
        if stage is PipelineStage.VALIDATE:
            return {
                "geography_count": len(bundle.geographies),
                "acs_observation_count": len(bundle.acs.observations),
                "places_observation_count": len(bundle.places.observations),
            }
        if stage is PipelineStage.NORMALIZE:
            _write_json(self.root / NORMALIZED_PATH, _normalized_document(bundle))
            return {"normalized_path": NORMALIZED_PATH.as_posix()}
        scoring = _score(bundle)
        candidate, plan = build_write_plan(
            root=self.root,
            environment=self.environment,
            clock=self.clock,
            registry=self.registry,
            bundle=bundle,
            scoring=scoring,
        )
        if stage is PipelineStage.LOAD:
            self._repository().execute_transaction(plan.load_statements)
            return {"base_record_count": len(plan.load_statements)}
        if stage is PipelineStage.SCORE:
            _write_json(self.root / SCORED_PATH, json.loads(scoring.canonical_output))
            return {"output_hash": scoring.canonical_output_hash}
        if stage is PipelineStage.VALIDATE_RUN:
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
    """Build the concrete runner used by the command-line entry point."""

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


__all__ = ["LiveWorkflow", "LiveWorkflowError", "build_live_runner"]
