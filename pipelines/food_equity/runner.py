"""Guarded orchestration for deterministic Food Equity runs."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Protocol

from pipelines.common.runner import RunnerConfigurationError, redact_failure, timestamp


class PipelineStage(StrEnum):
    """Closed and ordered stage grammar approved for Plan 3."""

    FETCH = "fetch"
    VALIDATE = "validate"
    NORMALIZE = "normalize"
    CLASSIFY = "classify"
    ACCESSIBILITY = "accessibility"
    LOAD = "load"
    SCORE = "score"
    VALIDATE_RUN = "validate-run"

    @property
    def requires_database(self) -> bool:
        return self in {self.LOAD, self.SCORE, self.VALIDATE_RUN}


StageState = dict[str, object]
StageHandler = Callable[[StageState], Mapping[str, object]]


class FailureRepository(Protocol):
    """Separate boundary used only for a draft that survived a failure."""

    def mark_failed(self, run_id: str, metadata: Mapping[str, object]) -> None: ...


@dataclass(frozen=True, slots=True)
class PipelineReport:
    """Secret-free result for one CLI invocation."""

    command: str
    status: str
    completed_stages: tuple[str, ...]
    started_at: str
    completed_at: str
    run_id: str | None
    reused: bool
    verified_existing: bool
    output_hash: str | None
    error: str | None

    def as_dict(self) -> dict[str, object]:
        return {
            "command": self.command,
            "status": self.status,
            "completed_stages": list(self.completed_stages),
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "run_id": self.run_id,
            "reused": self.reused,
            "verified_existing": self.verified_existing,
            "output_hash": self.output_hash,
            "error": self.error,
        }


def _state_string(state: Mapping[str, object], key: str) -> str | None:
    value = state.get(key)
    return value if isinstance(value, str) else None


class PipelineRunner:
    """Execute explicit stages with development-only database writes."""

    def __init__(
        self,
        *,
        handlers: Mapping[PipelineStage, StageHandler],
        environment: Mapping[str, str],
        clock: Callable[[], datetime],
        failure_repository: FailureRepository | None = None,
    ) -> None:
        missing = set(PipelineStage) - set(handlers)
        if missing:
            names = sorted(stage.value for stage in missing)
            raise RunnerConfigurationError(f"runner is missing handlers for {names}")
        self._handlers = handlers
        self._environment = environment
        self._clock = clock
        self._failure_repository = failure_repository

    @staticmethod
    def _stages(command: str, through: str | None) -> tuple[PipelineStage, ...]:
        if command == "run":
            if through != "validated":
                raise RunnerConfigurationError("run requires --through validated")
            return tuple(PipelineStage)
        try:
            return (PipelineStage(command),)
        except ValueError as error:
            raise RunnerConfigurationError(f"unknown pipeline command {command!r}") from error

    def _guard_writes(self, stages: tuple[PipelineStage, ...]) -> None:
        if not any(stage.requires_database for stage in stages):
            return
        if self._environment.get("MKE_PIPELINE_ENV") != "development":
            raise RunnerConfigurationError("database writes require MKE_PIPELINE_ENV=development")
        if not self._environment.get("DATABASE_URL_UNPOOLED"):
            raise RunnerConfigurationError(
                "database writes require DATABASE_URL_UNPOOLED in development"
            )

    def execute(
        self,
        command: str,
        *,
        through: str | None = None,
        verify_existing: bool = False,
    ) -> PipelineReport:
        """Run one stage or the complete sequence through validated."""

        stages = self._stages(command, through)
        self._guard_writes(stages)
        started_at = timestamp(self._clock())
        state: StageState = {"verify_existing": verify_existing}
        completed: list[str] = []
        current: PipelineStage | None = None
        try:
            for current in stages:
                state.update(self._handlers[current](state))
                completed.append(current.value)
        except Exception as error:  # noqa: BLE001 - this boundary redacts all failures
            message = redact_failure(str(error))
            run_id = _state_string(state, "run_id")
            if run_id is not None and self._failure_repository is not None:
                try:
                    self._failure_repository.mark_failed(
                        run_id,
                        {
                            "error_type": type(error).__name__,
                            "message": message,
                            "failed_stage": current.value if current else "unknown",
                        },
                    )
                except Exception:  # noqa: BLE001 - retain the original redacted failure
                    pass
            return PipelineReport(
                command=command,
                status="failed",
                completed_stages=tuple(completed),
                started_at=started_at,
                completed_at=timestamp(self._clock()),
                run_id=run_id,
                reused=bool(state.get("reused", False)),
                verified_existing=bool(state.get("verified_existing", False)),
                output_hash=_state_string(state, "output_hash"),
                error=message,
            )
        return PipelineReport(
            command=command,
            status="succeeded",
            completed_stages=tuple(completed),
            started_at=started_at,
            completed_at=timestamp(self._clock()),
            run_id=_state_string(state, "run_id"),
            reused=bool(state.get("reused", False)),
            verified_existing=bool(state.get("verified_existing", False)),
            output_hash=_state_string(state, "output_hash"),
            error=None,
        )


__all__ = [
    "FailureRepository",
    "PipelineReport",
    "PipelineRunner",
    "PipelineStage",
    "StageHandler",
    "StageState",
]
