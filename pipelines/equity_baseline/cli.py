"""Explicit command-line boundary for the equity-baseline pipeline."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Protocol, TextIO

from pipelines.equity_baseline.artifacts import atomic_write_bytes, canonical_json_bytes
from pipelines.equity_baseline.live import build_live_runner
from pipelines.equity_baseline.runner import PipelineReport, PipelineRunner, PipelineStage

DEFAULT_REPORT_ROOT = Path("data/reports/equity-baseline")


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
    """Build the closed command grammar; publication is intentionally absent."""

    parser = argparse.ArgumentParser(prog="python -m pipelines.equity_baseline")
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
    timestamp = now.astimezone(UTC).strftime("%Y%m%dT%H%M%S.%fZ")
    return root / f"{timestamp}-{command}.json"


def main(
    argv: Sequence[str] | None = None,
    *,
    runner_factory: Callable[[], RunnerLike] = _default_runner,
    stdout: TextIO = sys.stdout,
    stderr: TextIO = sys.stderr,
    clock: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> int:
    """Run one command, persist its report, and emit a concise secret-free summary."""

    arguments = build_parser().parse_args(argv)
    runner = runner_factory()
    report = runner.execute(
        arguments.command,
        through=getattr(arguments, "through", None),
        verify_existing=getattr(arguments, "verify_existing", False),
    )
    report_path = _report_path(arguments.report_dir, arguments.command, clock())
    atomic_write_bytes(report_path, canonical_json_bytes(report.as_dict()))
    if report.status == "succeeded":
        stdout.write(
            f"{arguments.command} succeeded; run_id={report.run_id or 'none'}; "
            f"reused={str(report.reused).lower()}; "
            f"verified={str(report.verified_existing).lower()}\n"
        )
        return 0
    stderr.write(f"{arguments.command} failed; see report\n")
    return 1
