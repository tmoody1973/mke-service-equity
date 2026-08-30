"""Shared deterministic run identity and secret-safe reporting primitives."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

DATABASE_URL_PATTERN = re.compile(r"(?i)postgres(?:ql)?://[^\s]+")
SECRET_ASSIGNMENT_PATTERN = re.compile(
    r"(?i)\b(?:api[_-]?key|key|password|secret|token)\s*=\s*[^\s]+"
)


class RunnerConfigurationError(ValueError):
    """Raised when a requested run violates a deterministic guard."""


class OutputHashMismatch(ValueError):
    """Raised when recomputation differs from an existing run's output."""


def timestamp(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() is None:
        raise RunnerConfigurationError("runner clock must return a timezone-aware datetime")
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def redact_failure(message: str) -> str:
    redacted = DATABASE_URL_PATTERN.sub("[REDACTED_DATABASE_URL]", message)
    return SECRET_ASSIGNMENT_PATTERN.sub("[REDACTED_SECRET]", redacted)


@dataclass(frozen=True, slots=True)
class ExistingRun:
    run_id: str
    run_fingerprint: str
    output_hash: str
    status: str


@dataclass(frozen=True, slots=True)
class RunCandidate:
    run_fingerprint: str
    output_hash: str
    payload: object | None = None


@dataclass(frozen=True, slots=True)
class RunOutcome:
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


__all__ = [
    "ExistingRun",
    "IdempotentRunRepository",
    "OutputHashMismatch",
    "RunCandidate",
    "RunOutcome",
    "RunnerConfigurationError",
    "coordinate_run",
    "redact_failure",
    "timestamp",
]
