from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path

from pipelines.food_equity.live import LiveWorkflow, _write_json, build_live_runner
from pipelines.food_equity.runner import PipelineStage

NOW = datetime(2026, 8, 29, 12, tzinfo=UTC)


class FakeWorkflow:
    def __init__(self) -> None:
        self.calls: list[tuple[PipelineStage, bool]] = []

    def handle(self, stage: PipelineStage, state: dict[str, object]) -> Mapping[str, object]:
        self.calls.append((stage, bool(state.get("verify_existing", False))))
        if stage is PipelineStage.SCORE:
            return {"output_hash": "a" * 64}
        if stage is PipelineStage.VALIDATE_RUN:
            return {
                "run_id": "food-run-1",
                "output_hash": "a" * 64,
                "reused": False,
                "verified_existing": False,
            }
        return {}


def test_live_runner_wires_all_eight_stages_and_only_validate_returns_run_id() -> None:
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
    assert report.run_id == "food-run-1"
    assert report.output_hash == "a" * 64


def test_live_runner_keeps_non_database_stage_free_of_database_configuration() -> None:
    workflow = FakeWorkflow()
    report = build_live_runner(workflow=workflow, environment={}, clock=lambda: NOW).execute(
        "classify"
    )

    assert report.status == "succeeded"
    assert workflow.calls == [(PipelineStage.CLASSIFY, False)]


def test_default_live_fetch_fails_closed_before_network_without_census_key(
    tmp_path: Path,
) -> None:
    workflow = LiveWorkflow(root=tmp_path, environment={}, clock=lambda: NOW)

    report = build_live_runner(workflow=workflow, environment={}, clock=lambda: NOW).execute(
        "fetch"
    )

    assert report.status == "failed"
    assert report.error == "fetch requires CENSUS_API_KEY"
    assert not (tmp_path / "data/normalized/food-equity/fetched.json").exists()


def test_stage_only_reload_fails_closed_when_exact_fetch_state_is_absent(
    tmp_path: Path,
) -> None:
    workflow = LiveWorkflow(root=tmp_path, environment={}, clock=lambda: NOW)

    report = build_live_runner(workflow=workflow, environment={}, clock=lambda: NOW).execute(
        "validate"
    )

    assert report.status == "failed"
    assert report.error is not None and "fetch state is missing" in report.error


def test_mutable_stage_pointer_is_atomically_replaceable(tmp_path: Path) -> None:
    path = tmp_path / "fetched.json"

    _write_json(path, {"version": 1})
    _write_json(path, {"version": 2})

    assert path.read_text(encoding="utf-8") == '{"version":2}'
