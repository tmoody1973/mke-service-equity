from __future__ import annotations

import json
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path

import pytest

from pipelines.equity_baseline.cli import build_parser, main
from pipelines.equity_baseline.runner import PipelineReport


NOW = datetime(2026, 8, 28, 12, 30, tzinfo=UTC)


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


def succeeded_report() -> PipelineReport:
    return PipelineReport(
        command="run",
        status="succeeded",
        completed_stages=("fetch", "validate", "normalize", "load", "score", "validate-run"),
        started_at="2026-08-28T12:30:00Z",
        completed_at="2026-08-28T12:30:00Z",
        run_id="run-1",
        reused=True,
        verified_existing=True,
        output_hash="a" * 64,
        error=None,
    )


@pytest.mark.parametrize(
    "command",
    ["fetch", "validate", "normalize", "load", "score", "validate-run"],
)
def test_parser_exposes_only_approved_explicit_stage_commands(command: str) -> None:
    parsed = build_parser().parse_args([command])
    assert parsed.command == command


def test_parser_exposes_run_through_validated_and_verify_existing() -> None:
    parsed = build_parser().parse_args(["run", "--through", "validated", "--verify-existing"])
    assert parsed.command == "run"
    assert parsed.through == "validated"
    assert parsed.verify_existing is True


@pytest.mark.parametrize("command", ["publish", "set-status", "supersede"])
def test_cli_has_no_publish_or_arbitrary_status_command(command: str) -> None:
    with pytest.raises(SystemExit):
        build_parser().parse_args([command])


def test_main_writes_machine_readable_report_and_concise_summary(tmp_path: Path) -> None:
    report = succeeded_report()
    runner = FakeRunner(report)
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
    assert json.loads(reports[0].read_text(encoding="utf-8")) == report.as_dict()
    assert stdout.getvalue() == "run succeeded; run_id=run-1; reused=true; verified=true\n"
    assert stderr.getvalue() == ""


def test_failed_report_returns_nonzero_and_never_prints_sensitive_error(tmp_path: Path) -> None:
    report = PipelineReport(
        command="score",
        status="failed",
        completed_stages=(),
        started_at="2026-08-28T12:30:00Z",
        completed_at="2026-08-28T12:30:00Z",
        run_id=None,
        reused=False,
        verified_existing=False,
        output_hash=None,
        error="[REDACTED]",
    )
    stdout = StringIO()
    stderr = StringIO()

    exit_code = main(
        ["score", "--report-dir", str(tmp_path)],
        runner_factory=lambda: FakeRunner(report),
        stdout=stdout,
        stderr=stderr,
        clock=lambda: NOW,
    )

    assert exit_code == 1
    assert stdout.getvalue() == ""
    assert stderr.getvalue() == "score failed; see report\n"
    assert "postgresql" not in stderr.getvalue()
