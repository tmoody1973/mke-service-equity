"""Parameterized Psycopg persistence for deterministic score runs."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol, cast

import psycopg
from psycopg.types.json import Jsonb

from pipelines.equity_baseline.errors import EquityBaselineError
from pipelines.equity_baseline.runner import ExistingRun, RunCandidate


class DatabaseRepositoryError(EquityBaselineError, ValueError):
    """Raised when a database operation violates the run contract."""


class ResultLike(Protocol):
    def fetchone(self) -> tuple[object, ...] | None: ...


class ConnectionLike(Protocol):
    def __enter__(self) -> ConnectionLike: ...

    def __exit__(self, *args: object) -> object: ...

    def execute(self, query: str, parameters: tuple[object, ...] | None = None) -> ResultLike: ...


Connect = Callable[[str], ConnectionLike]


def _connect(database_url: str) -> ConnectionLike:
    return cast(ConnectionLike, psycopg.connect(database_url))


@dataclass(frozen=True, slots=True)
class ParameterizedStatement:
    """SQL text owned by the repository boundary plus separately bound values."""

    sql: str
    parameters: tuple[object, ...]

    def __post_init__(self) -> None:
        if not self.sql.strip():
            raise DatabaseRepositoryError("SQL statement cannot be empty")
        if ";" in self.sql:
            raise DatabaseRepositoryError("repository statements must contain one command")


@dataclass(frozen=True, slots=True)
class ValidatedWritePlan:
    """Deterministically ordered records needed for one draft-to-validated transaction."""

    run_id: str
    methodology_version: str
    registry_hash: str
    input_manifest_hash: str
    scoring_implementation_version: str
    data_vintages: Mapping[str, object]
    git_commit: str
    load_statements: tuple[ParameterizedStatement, ...]
    analytical_statements: tuple[ParameterizedStatement, ...]
    validation_result: Mapping[str, object]


FIND_RUN_SQL = (
    "SELECT id, run_fingerprint, output_hash, status FROM score_runs WHERE run_fingerprint = %s"
)
INSERT_DRAFT_SQL = (
    "INSERT INTO score_runs "
    "(id, methodology_version, registry_hash, input_manifest_hash, run_fingerprint, "
    "scoring_implementation_version, started_at, data_vintages, git_commit, status, created_at) "
    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'draft',%s)"
)
VALIDATE_RUN_SQL = (
    "UPDATE score_runs SET status = 'validated', completed_at = %s, "
    "validation_result = %s, output_hash = %s WHERE id = %s AND status = 'draft'"
)
FAIL_RUN_SQL = (
    "UPDATE score_runs SET status = 'failed', completed_at = %s, failure_metadata = %s, "
    "output_hash = NULL WHERE id = %s AND status = 'draft'"
)


class PsycopgRunRepository:
    """Run repository using connection contexts for automatic commit and rollback."""

    def __init__(
        self,
        database_url: str,
        *,
        connect: Connect = _connect,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        if not database_url:
            raise DatabaseRepositoryError("database URL is required")
        self._database_url = database_url
        self._connect = connect
        self._clock = clock

    def __repr__(self) -> str:
        return "PsycopgRunRepository(database_url=[REDACTED])"

    @staticmethod
    def _existing(row: tuple[object, ...] | None) -> ExistingRun | None:
        if row is None:
            return None
        if len(row) != 4 or not all(isinstance(value, str) for value in row):
            raise DatabaseRepositoryError("score run lookup returned an invalid row")
        run_id, fingerprint, output_hash, status = cast(tuple[str, str, str, str], row)
        if not output_hash:
            raise DatabaseRepositoryError(
                f"existing run {run_id} is not validated and cannot be reused"
            )
        return ExistingRun(run_id, fingerprint, output_hash, status)

    def find_by_fingerprint(self, fingerprint: str) -> ExistingRun | None:
        with self._connect(self._database_url) as connection:
            row = connection.execute(FIND_RUN_SQL, (fingerprint,)).fetchone()
        return self._existing(row)

    def execute_transaction(self, statements: tuple[ParameterizedStatement, ...]) -> None:
        """Execute ordered parameterized statements in one rollback-safe transaction."""

        with self._connect(self._database_url) as connection:
            for statement in statements:
                connection.execute(statement.sql, statement.parameters)

    def persist_validated(self, candidate: RunCandidate) -> ExistingRun:
        """Persist base records, draft, analytics, then validate in one transaction."""

        if not isinstance(candidate.payload, ValidatedWritePlan):
            raise DatabaseRepositoryError("validated candidate requires a write plan")
        plan = candidate.payload
        now = self._clock()
        with self._connect(self._database_url) as connection:
            existing = self._existing(
                connection.execute(FIND_RUN_SQL, (candidate.run_fingerprint,)).fetchone()
            )
            if existing is not None:
                return existing
            for statement in plan.load_statements:
                connection.execute(statement.sql, statement.parameters)
            connection.execute(
                INSERT_DRAFT_SQL,
                (
                    plan.run_id,
                    plan.methodology_version,
                    plan.registry_hash,
                    plan.input_manifest_hash,
                    candidate.run_fingerprint,
                    plan.scoring_implementation_version,
                    now,
                    Jsonb(dict(plan.data_vintages)),
                    plan.git_commit,
                    now,
                ),
            )
            for statement in plan.analytical_statements:
                connection.execute(statement.sql, statement.parameters)
            connection.execute(
                VALIDATE_RUN_SQL,
                (
                    self._clock(),
                    Jsonb(dict(plan.validation_result)),
                    candidate.output_hash,
                    plan.run_id,
                ),
            )
        return ExistingRun(
            plan.run_id,
            candidate.run_fingerprint,
            candidate.output_hash,
            "validated",
        )

    def mark_failed(self, run_id: str, metadata: Mapping[str, object]) -> None:
        """Record failure in a separate transaction after analytical rollback."""

        with self._connect(self._database_url) as connection:
            connection.execute(
                FAIL_RUN_SQL,
                (self._clock(), Jsonb(dict(metadata)), run_id),
            )
