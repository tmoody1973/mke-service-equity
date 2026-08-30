"""Closed command-line boundary for the Food Equity pipeline."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol, TextIO

from pipelines.common.artifacts import atomic_write_bytes, canonical_json_bytes
from pipelines.common.runner import redact_failure, timestamp
from pipelines.food_equity.live import build_live_runner
from pipelines.food_equity.runner import PipelineReport, PipelineRunner, PipelineStage

DEFAULT_REPORT_ROOT = Path("data/reports/food-equity")


class RunnerLike(Protocol):
    def execute(
        self,
        command: str,
        *,
        through: str | None = None,
        verify_existing: bool = False,
    ) -> PipelineReport: ...


def _add_report_option(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_ROOT)


def build_parser() -> argparse.ArgumentParser:
    """Build the approved grammar; publication commands are intentionally absent."""

    parser = argparse.ArgumentParser(prog="python -m pipelines.food_equity")
    subparsers = parser.add_subparsers(dest="command", required=True)
    for stage in PipelineStage:
        stage_parser = subparsers.add_parser(stage.value)
        _add_report_option(stage_parser)
    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("--through", choices=("validated",), required=True)
    run_parser.add_argument("--verify-existing", action="store_true")
    _add_report_option(run_parser)
    return parser


def _default_runner() -> PipelineRunner:
    return build_live_runner()


def _report_path(root: Path, command: str, now: datetime) -> Path:
    stamp = now.astimezone(UTC).strftime("%Y%m%dT%H%M%S.%fZ")
    return root / f"{stamp}-{command}.json"


def main(
    argv: Sequence[str] | None = None,
    *,
    runner_factory: Callable[[], RunnerLike] = _default_runner,
    stdout: TextIO = sys.stdout,
    stderr: TextIO = sys.stderr,
    clock: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> int:
    """Execute a command, write its canonical report, and print a safe summary."""

    arguments = build_parser().parse_args(argv)
    started_at = timestamp(clock())
    try:
        runner = runner_factory()
        report = runner.execute(
            arguments.command,
            through=getattr(arguments, "through", None),
            verify_existing=getattr(arguments, "verify_existing", False),
        )
    except Exception as error:  # noqa: BLE001 - CLI must report every valid invocation
        report = PipelineReport(
            command=arguments.command,
            status="failed",
            completed_stages=(),
            started_at=started_at,
            completed_at=timestamp(clock()),
            run_id=None,
            reused=False,
            verified_existing=False,
            output_hash=None,
            error=redact_failure(str(error)),
        )
    atomic_write_bytes(
        _report_path(arguments.report_dir, arguments.command, clock()),
        canonical_json_bytes(report.as_dict()),
    )
    if report.status == "succeeded":
        stdout.write(
            f"{arguments.command} succeeded; run_id={report.run_id or 'none'}; "
            f"reused={str(report.reused).lower()}; "
            f"verified={str(report.verified_existing).lower()}\n"
        )
        return 0
    stderr.write(f"{arguments.command} failed; see report\n")
    return 1


__all__ = ["build_parser", "main"]
