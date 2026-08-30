from __future__ import annotations

import json
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path

import pytest

from pipelines.food_equity.cli import _default_runner, build_parser, main
from pipelines.food_equity.runner import PipelineReport, PipelineRunner


NOW = datetime(2026, 8, 29, 12, 30, tzinfo=UTC)
STAGES = (
    "fetch",
    "validate",
    "normalize",
    "classify",
    "accessibility",
    "load",
    "score",
    "validate-run",
)


class FakeRunner:
    def __init__(self, report: PipelineReport) -> None:
        self.report = report
        self.calls: list[tuple[str, str | None, bool]] = []

    def execute(
        self,
        command: str,
        *,
        through: str | None = None,
        verify_existing: bool = False,
    ) -> PipelineReport:
        self.calls.append((command, through, verify_existing))
        return self.report


def report(command: str = "run", *, status: str = "succeeded") -> PipelineReport:
    return PipelineReport(
        command=command,
        status=status,
        completed_stages=STAGES if command == "run" else (command,),
        started_at="2026-08-29T12:30:00Z",
        completed_at="2026-08-29T12:30:00Z",
        run_id="food-run-1",
        reused=True,
        verified_existing=True,
        output_hash="a" * 64 if status == "succeeded" else None,
        error=None if status == "succeeded" else "[REDACTED]",
    )


@pytest.mark.parametrize("command", STAGES)
def test_parser_exposes_every_approved_stage(command: str) -> None:
    assert build_parser().parse_args([command]).command == command


def test_parser_exposes_only_validated_run_and_existing_hash_verification() -> None:
    parsed = build_parser().parse_args(["run", "--through", "validated", "--verify-existing"])
    assert parsed.command == "run"
    assert parsed.through == "validated"
    assert parsed.verify_existing is True
    with pytest.raises(SystemExit):
        build_parser().parse_args(["run", "--through", "published"])


@pytest.mark.parametrize(
    "command", ["publish", "set-status", "supersede", "promote", "production", "delete-run"]
)
def test_cli_has_no_publication_or_status_mutation_command(command: str) -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args([command])


def test_success_writes_canonical_report_and_concise_summary(tmp_path: Path) -> None:
    outcome = report()
    runner = FakeRunner(outcome)
    stdout = StringIO()
    stderr = StringIO()

    exit_code = main(
        ["run", "--through", "validated", "--verify-existing", "--report-dir", str(tmp_path)],
        runner_factory=lambda: runner,
        stdout=stdout,
        stderr=stderr,
        clock=lambda: NOW,
    )

    assert exit_code == 0
    assert runner.calls == [("run", "validated", True)]
    reports = list(tmp_path.glob("*.json"))
    assert len(reports) == 1
    content = reports[0].read_bytes()
    assert json.loads(content) == outcome.as_dict()
    assert (
        content
        == json.dumps(
            outcome.as_dict(),
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode()
    )
    assert stdout.getvalue() == "run succeeded; run_id=food-run-1; reused=true; verified=true\n"
    assert stderr.getvalue() == ""


@pytest.mark.parametrize("command", STAGES)
def test_each_stage_forwards_only_itself_and_writes_to_requested_root(
    command: str, tmp_path: Path
) -> None:
    runner = FakeRunner(report(command))
    exit_code = main(
        [command, "--report-dir", str(tmp_path)],
        runner_factory=lambda: runner,
        stdout=StringIO(),
        stderr=StringIO(),
        clock=lambda: NOW,
    )
    assert exit_code == 0
    assert runner.calls == [(command, None, False)]
    assert len(list(tmp_path.glob(f"*-{command}.json"))) == 1


def test_failure_returns_nonzero_and_prints_no_sensitive_detail(tmp_path: Path) -> None:
    stdout = StringIO()
    stderr = StringIO()

    exit_code = main(
        ["score", "--report-dir", str(tmp_path)],
        runner_factory=lambda: FakeRunner(report("score", status="failed")),
        stdout=stdout,
        stderr=stderr,
        clock=lambda: NOW,
    )

    assert exit_code == 1
    assert stdout.getvalue() == ""
    assert stderr.getvalue() == "score failed; see report\n"
    assert "postgresql" not in stderr.getvalue().casefold()
    stored = next(tmp_path.glob("*.json")).read_text(encoding="utf-8")
    assert "password" not in stored.casefold()
    assert "token=" not in stored.casefold()


def test_configuration_failure_still_writes_a_redacted_report(tmp_path: Path) -> None:
    def fail_to_construct() -> FakeRunner:
        raise RuntimeError("postgresql://user:password@example.test/db token=abc123")

    stderr = StringIO()
    exit_code = main(
        ["load", "--report-dir", str(tmp_path)],
        runner_factory=fail_to_construct,
        stdout=StringIO(),
        stderr=stderr,
        clock=lambda: NOW,
    )

    assert exit_code == 1
    assert stderr.getvalue() == "load failed; see report\n"
    stored = next(tmp_path.glob("*.json")).read_text(encoding="utf-8")
    assert "postgresql://" not in stored
    assert "password" not in stored
    assert "abc123" not in stored


def test_default_report_root_is_food_equity() -> None:
    assert build_parser().parse_args(["fetch"]).report_dir == Path("data/reports/food-equity")


def test_default_factory_is_the_concrete_food_runner() -> None:
    assert isinstance(_default_runner(), PipelineRunner)
