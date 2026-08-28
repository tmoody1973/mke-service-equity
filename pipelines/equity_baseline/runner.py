"""Guarded, deterministic stage orchestration and run idempotency."""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Protocol

from pipelines.equity_baseline.errors import EquityBaselineError

DATABASE_URL_PATTERN = re.compile(r"(?i)postgres(?:ql)?://[^\s]+")
SECRET_ASSIGNMENT_PATTERN = re.compile(
    r"(?i)\b(?:api[_-]?key|key|password|secret|token)\s*=\s*[^\s]+"
)


class RunnerConfigurationError(EquityBaselineError, ValueError):
    """Raised when a requested stage violates the runtime guard."""


class OutputHashMismatch(EquityBaselineError, ValueError):
    """Raised when recomputation differs from an existing run's output."""


class PipelineStage(StrEnum):
    """Closed, ordered pipeline stages exposed by MOO-751."""

    FETCH = "fetch"
    VALIDATE = "validate"
    NORMALIZE = "normalize"
    LOAD = "load"
    SCORE = "score"
    VALIDATE_RUN = "validate-run"

    @property
    def requires_database(self) -> bool:
        return self in {self.LOAD, self.SCORE, self.VALIDATE_RUN}


StageState = dict[str, object]
StageHandler = Callable[[StageState], Mapping[str, object]]


class FailureRepository(Protocol):
    """Separate transaction boundary for marking an existing draft failed."""

    def mark_failed(self, run_id: str, metadata: Mapping[str, object]) -> None: ...


@dataclass(frozen=True, slots=True)
class PipelineReport:
    """Secret-free machine-readable result for one invocation."""

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


def _timestamp(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise RunnerConfigurationError("runner clock must return a timezone-aware datetime")
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def redact_failure(message: str) -> str:
    """Remove database URLs and common inline credential assignments."""

    redacted = DATABASE_URL_PATTERN.sub("[REDACTED_DATABASE_URL]", message)
    return SECRET_ASSIGNMENT_PATTERN.sub("[REDACTED_SECRET]", redacted)


def _state_string(state: Mapping[str, object], key: str) -> str | None:
    value = state.get(key)
    return value if isinstance(value, str) else None


@dataclass(frozen=True, slots=True)
class ExistingRun:
    """Minimum existing-run record required for idempotency."""

    run_id: str
    run_fingerprint: str
    output_hash: str
    status: str


@dataclass(frozen=True, slots=True)
class RunCandidate:
    """Recomputed deterministic identity and canonical output."""

    run_fingerprint: str
    output_hash: str
    payload: object | None = None


@dataclass(frozen=True, slots=True)
class RunOutcome:
    """Created or reused run plus verification flags."""

    run: ExistingRun
    reused: bool
    verified_existing: bool


class IdempotentRunRepository(Protocol):
    def find_by_fingerprint(self, fingerprint: str) -> ExistingRun | None: ...

    def persist_validated(self, candidate: RunCandidate) -> ExistingRun: ...


def _require_hash(value: str, label: str) -> None:
    if not re.fullmatch(r"[0-9a-f]{64}", value):
        raise RunnerConfigurationError(f"{label} must be a lowercase SHA-256")


def coordinate_run(
    repository: IdempotentRunRepository,
    candidate: RunCandidate,
    *,
    verify_existing: bool,
) -> RunOutcome:
    """Resolve an identical fingerprint before any analytical writes."""

    _require_hash(candidate.run_fingerprint, "run fingerprint")
    _require_hash(candidate.output_hash, "output hash")
    existing = repository.find_by_fingerprint(candidate.run_fingerprint)
    if existing is not None:
        if verify_existing and existing.output_hash != candidate.output_hash:
            raise OutputHashMismatch(
                "recomputed canonical output hash does not match the existing run"
            )
        return RunOutcome(existing, reused=True, verified_existing=verify_existing)
    created = repository.persist_validated(candidate)
    return RunOutcome(created, reused=False, verified_existing=False)


class PipelineRunner:
    """Execute explicit stages with environment guards and redacted reports."""

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
            raise RunnerConfigurationError(
                f"runner is missing handlers for {sorted(stage.value for stage in missing)}"
            )
        self._handlers = handlers
        self._environment = environment
        self._clock = clock
        self._failure_repository = failure_repository

    def _stages(self, command: str, through: str | None) -> tuple[PipelineStage, ...]:
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
        """Execute one stage or the approved full sequence."""

        stages = self._stages(command, through)
        self._guard_writes(stages)
        started = _timestamp(self._clock())
        state: StageState = {"verify_existing": verify_existing}
        completed: list[str] = []
        current: PipelineStage | None = None
        try:
            for current in stages:
                state.update(self._handlers[current](state))
                completed.append(current.value)
        except Exception as error:  # noqa: BLE001 - report boundary must redact every failure
            message = redact_failure(str(error))
            run_id = _state_string(state, "run_id")
            if run_id is not None and self._failure_repository is not None:
                self._failure_repository.mark_failed(
                    run_id,
                    {
                        "error_type": type(error).__name__,
                        "message": message,
                        "failed_stage": current.value if current is not None else "unknown",
                    },
                )
            return PipelineReport(
                command=command,
                status="failed",
                completed_stages=tuple(completed),
                started_at=started,
                completed_at=_timestamp(self._clock()),
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
            started_at=started,
            completed_at=_timestamp(self._clock()),
            run_id=_state_string(state, "run_id"),
            reused=bool(state.get("reused", False)),
            verified_existing=bool(state.get("verified_existing", False)),
            output_hash=_state_string(state, "output_hash"),
            error=None,
        )
