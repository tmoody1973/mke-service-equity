from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from types import MappingProxyType

from pipelines.equity_baseline.acs import (
    AcsNormalizationResult,
    AcsObservation,
    AcsPopulation,
)
from pipelines.equity_baseline.geography import read_canonical_tracts
from pipelines.equity_baseline.live import (
    NormalizedBundle,
    SnapshotInput,
    _score,
    build_live_runner,
)
from pipelines.equity_baseline.places import PlacesNormalizationResult, PlacesObservation
from pipelines.equity_baseline.registry import load_registry
from pipelines.equity_baseline.runner import PipelineStage
from pipelines.equity_baseline.write_plan import build_write_plan


NOW = datetime(2026, 8, 28, 12, tzinfo=UTC)
FIXTURES = Path(__file__).parents[1] / "fixtures/equity_baseline"


class FakeWorkflow:
    def __init__(self) -> None:
        self.calls: list[tuple[PipelineStage, bool]] = []

    def handle(self, stage: PipelineStage, state: dict[str, object]) -> Mapping[str, object]:
        self.calls.append((stage, bool(state.get("verify_existing", False))))
        return {
            "run_id": "run-1" if stage is PipelineStage.VALIDATE_RUN else None,
            "output_hash": (
                "a" * 64 if stage in {PipelineStage.SCORE, PipelineStage.VALIDATE_RUN} else None
            ),
        }


def test_live_runner_wires_every_stage_to_the_concrete_workflow() -> None:
    workflow = FakeWorkflow()
    runner = build_live_runner(
        workflow=workflow,
        environment={
            "MKE_PIPELINE_ENV": "development",
            "DATABASE_URL_UNPOOLED": "postgresql://example.test/database",
        },
        clock=lambda: NOW,
    )

    report = runner.execute("run", through="validated", verify_existing=True)

    assert workflow.calls == [(stage, True) for stage in PipelineStage]
    assert report.status == "succeeded"
    assert report.run_id == "run-1"
    assert report.output_hash == "a" * 64


def test_live_runner_keeps_read_only_stages_database_free() -> None:
    workflow = FakeWorkflow()
    runner = build_live_runner(workflow=workflow, environment={}, clock=lambda: NOW)

    report = runner.execute("normalize")

    assert report.status == "succeeded"
    assert workflow.calls == [(PipelineStage.NORMALIZE, False)]


def snapshot(logical_source: str, source_key: str, checksum_character: str) -> SnapshotInput:
    checksum = checksum_character * 64
    return SnapshotInput(
        logical_source=logical_source,
        manifest=MappingProxyType(
            {
                "source_key": source_key,
                "dataset_version": "fixture",
                "retrieved_at": "2026-08-28T12:00:00Z",
                "checksum_sha256": checksum,
                "byte_size": 1,
                "storage_uri": f"data/raw/equity-baseline/{source_key}/{checksum}.json",
                "row_or_feature_count": 2,
                "schema_fingerprint": "f" * 64,
                "request_metadata": {},
            }
        ),
        raw_path=Path("unused"),
        content=b"x",
    )


def complete_bundle() -> NormalizedBundle:
    registry = load_registry()
    geographies = read_canonical_tracts(FIXTURES / "tiger/tracts.geojson")
    populations = tuple(
        AcsPopulation(item.geoid, Decimal("100"), Decimal("5"), "verified", None)
        for item in geographies
    )
    acs_observations = tuple(
        AcsObservation(
            geography.geoid,
            indicator.slug,
            Decimal("10") if position == 0 else Decimal("20"),
            Decimal("1"),
            Decimal("5"),
            None,
            "verified",
            None,
            MappingProxyType({"cv_state": "reliable"}),
        )
        for position, geography in enumerate(geographies)
        for indicator in registry.indicators
        if indicator.source == "acs"
    )
    places_observations = tuple(
        PlacesObservation(
            geography.geoid,
            indicator.slug,
            Decimal("10") if position == 0 else Decimal("20"),
            Decimal("9"),
            Decimal("21"),
            "verified",
            None,
            MappingProxyType({"confidence_level": "95_percent"}),
            "2023",
            "fixture",
        )
        for position, geography in enumerate(geographies)
        for indicator in registry.indicators
        if indicator.source == "places"
    )
    snapshots = (
        snapshot("tiger", "tiger", "0"),
        *(
            snapshot("acs", f"acs-{group}", str(index))
            for index, group in enumerate(
                (
                    "b01003",
                    "b03002",
                    "c16001",
                    "b05002",
                    "c17002",
                    "b23025",
                    "b15003",
                    "b25106",
                ),
                start=1,
            )
        ),
        snapshot("places", "places", "a"),
    )
    return NormalizedBundle(
        geographies,
        AcsNormalizationResult(populations, acs_observations),
        PlacesNormalizationResult(places_observations),
        snapshots,
    )


def test_write_plan_is_complete_deterministic_and_has_no_publication_sql(tmp_path: Path) -> None:
    registry = load_registry()
    bundle = complete_bundle()
    scoring = _score(bundle)

    candidate, plan = build_write_plan(
        root=tmp_path,
        environment={"MKE_PIPELINE_GIT_COMMIT": "f" * 40},
        clock=lambda: NOW,
        registry=registry,
        bundle=bundle,
        scoring=scoring,
    )

    assert len(plan.load_statements) == 54
    assert len(plan.analytical_statements) == 28
    assert plan.validation_result == {
        "geography_count": 2,
        "indicator_value_count": 26,
        "component_count": 26,
        "score_count": 2,
        "quality_counts": {"complete": 2},
    }
    assert len(candidate.run_fingerprint) == 64
    assert candidate.output_hash == scoring.canonical_output_hash
    sql = " ".join(
        statement.sql for statement in (*plan.load_statements, *plan.analytical_statements)
    ).casefold()
    assert "published" not in sql
    assert "superseded" not in sql

    changed_candidate, _changed_plan = build_write_plan(
        root=tmp_path,
        environment={"MKE_PIPELINE_GIT_COMMIT": "e" * 40},
        clock=lambda: NOW,
        registry=registry,
        bundle=bundle,
        scoring=scoring,
    )
    assert changed_candidate.run_fingerprint != candidate.run_fingerprint
