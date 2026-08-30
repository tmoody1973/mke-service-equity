"""Parameterized Psycopg persistence for validated Food Equity score runs."""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from types import MappingProxyType
from typing import Protocol, cast
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from pipelines.common.runner import ExistingRun, OutputHashMismatch, RunCandidate
from pipelines.food_equity.errors import FoodEquityError
from pipelines.food_equity.scoring import (
    PINNED_BASELINE_METHODOLOGY,
    PINNED_BASELINE_OUTPUT_HASH,
    PINNED_BASELINE_REGISTRY_HASH,
    PINNED_BASELINE_RUN_FINGERPRINT,
    PINNED_BASELINE_RUN_ID,
    BaselineRunInput,
    BaselineScoreInput,
)

SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
GEOID_PATTERN = re.compile(r"[0-9]{11}")
PINNED_BASELINE_INPUT_MANIFEST_HASH = (
    "b34eaa2dcbc823ae2e145467e95de2b175066eeceac2dd7ccded4f06cdea6b8d"
)
EXPECTED_BASELINE_QUALITY_COUNTS = {
    "complete": 300,
    "ineligible_zero_population": 2,
    "insufficient_data": 0,
}
BASELINE_BAND_MAP = MappingProxyType(
    {
        "very_low": "Very Low",
        "low": "Low",
        "moderate": "Moderate",
        "high": "High",
        "very_high": "Very High",
    }
)


class DatabaseRepositoryError(FoodEquityError, ValueError):
    """Raised when a database operation violates the Food run contract."""


class ResultLike(Protocol):
    def fetchone(self) -> tuple[object, ...] | None: ...

    def fetchall(self) -> list[tuple[object, ...]]: ...


class PipelineLike(Protocol):
    def __enter__(self) -> PipelineLike: ...

    def __exit__(self, *args: object) -> object: ...


class ConnectionLike(Protocol):
    def __enter__(self) -> ConnectionLike: ...

    def __exit__(self, *args: object) -> object: ...

    def execute(self, query: str, parameters: tuple[object, ...] | None = None) -> ResultLike: ...

    def pipeline(self) -> PipelineLike: ...


Connect = Callable[[str], ConnectionLike]


def _connect(database_url: str) -> ConnectionLike:
    return cast(ConnectionLike, psycopg.connect(database_url))


def _require_sha256(value: str, label: str) -> None:
    if not SHA256_PATTERN.fullmatch(value):
        raise DatabaseRepositoryError(f"{label} must be a lowercase SHA-256")


@dataclass(frozen=True, slots=True)
class ParameterizedStatement:
    """One SQL command with values kept separate for Psycopg parameter binding."""

    sql: str
    parameters: tuple[object, ...]

    def __post_init__(self) -> None:
        if not self.sql.strip():
            raise DatabaseRepositoryError("SQL statement cannot be empty")
        if ";" in self.sql:
            raise DatabaseRepositoryError("repository statements must contain one command")
        if not isinstance(self.parameters, tuple):
            raise DatabaseRepositoryError("repository statement parameters must be a tuple")


@dataclass(frozen=True, slots=True)
class ValidatedWritePlan:
    """Ordered records for one pinned-baseline draft-to-validated transaction."""

    run_id: str
    methodology_version: str
    registry_hash: str
    input_manifest_hash: str
    scoring_implementation_version: str
    equity_baseline_run_id: str
    equity_baseline_output_hash: str
    data_vintages: Mapping[str, object]
    git_commit: str
    load_statements: tuple[ParameterizedStatement, ...]
    analytical_statements: tuple[ParameterizedStatement, ...]
    validation_result: Mapping[str, object]
    reconciliation_statements: tuple[ParameterizedStatement, ...] = ()

    def __post_init__(self) -> None:
        if self.equity_baseline_run_id != PINNED_BASELINE_RUN_ID:
            raise DatabaseRepositoryError(
                "write plan baseline run does not match the approved pinned baseline"
            )
        if self.equity_baseline_output_hash != PINNED_BASELINE_OUTPUT_HASH:
            raise DatabaseRepositoryError(
                "write plan baseline output hash does not match the approved pinned baseline"
            )
        _require_sha256(self.registry_hash, "registry hash")
        _require_sha256(self.input_manifest_hash, "input manifest hash")
        for label, value in (
            ("run ID", self.run_id),
            ("methodology version", self.methodology_version),
            ("scoring implementation version", self.scoring_implementation_version),
            ("git commit", self.git_commit),
        ):
            if not value.strip():
                raise DatabaseRepositoryError(f"{label} cannot be empty")
        if not isinstance(self.load_statements, tuple) or not all(
            isinstance(statement, ParameterizedStatement) for statement in self.load_statements
        ):
            raise DatabaseRepositoryError("load statements must be parameterized statements")
        if not isinstance(self.analytical_statements, tuple) or not all(
            isinstance(statement, ParameterizedStatement)
            for statement in self.analytical_statements
        ):
            raise DatabaseRepositoryError("analytical statements must be parameterized statements")
        if not isinstance(self.reconciliation_statements, tuple) or not all(
            isinstance(statement, ParameterizedStatement)
            for statement in self.reconciliation_statements
        ):
            raise DatabaseRepositoryError(
                "reconciliation statements must be parameterized statements"
            )
        if self.validation_result.get("publishable") is True:
            raise DatabaseRepositoryError("development Food runs cannot be publishable")


@dataclass(frozen=True, slots=True)
class ResolvedBaseline:
    """Verified pinned baseline inputs and their database geography identities."""

    run: BaselineRunInput
    scores: tuple[BaselineScoreInput, ...]
    geography_ids: Mapping[str, str]


FIND_RUN_SQL = (
    "SELECT id, run_fingerprint, output_hash, status "
    "FROM food_score_runs WHERE run_fingerprint = %s"
)
INSERT_DRAFT_SQL = (
    "INSERT INTO food_score_runs "
    "(id, methodology_version, registry_hash, input_manifest_hash, run_fingerprint, "
    "scoring_implementation_version, equity_baseline_run_id, equity_baseline_output_hash, "
    "started_at, data_vintages, git_commit, status, created_at) "
    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'draft',%s)"
)
VALIDATE_RUN_SQL = (
    "UPDATE food_score_runs SET status = 'validated', completed_at = %s, "
    "validation_result = %s, output_hash = %s "
    "WHERE id = %s AND status = 'draft' RETURNING id::text"
)
FAIL_RUN_SQL = (
    "UPDATE food_score_runs SET status = 'failed', completed_at = %s, "
    "failure_metadata = %s, output_hash = NULL "
    "WHERE id = %s AND status = 'draft'"
)
RESOLVE_BASELINE_RUN_SQL = (
    "SELECT id::text, methodology_version, registry_hash, input_manifest_hash, "
    "run_fingerprint, status::text, validation_result, output_hash "
    "FROM score_runs WHERE id = %s"
)
RESOLVE_BASELINE_SCORES_SQL = (
    "SELECT scores.id::text AS score_id, geographies.id::text AS geography_id, "
    "geographies.geoid, geographies.population, scores.quality_status::text, "
    "scores.equity_baseline_band::text "
    "FROM scores JOIN geographies ON geographies.id = scores.geography_id "
    "WHERE scores.score_run_id = %s ORDER BY geographies.geoid"
)


class PsycopgRunRepository:
    """Food run repository using connection contexts for commit and rollback."""

    def __init__(
        self,
        database_url: str,
        *,
        connect: Connect = _connect,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        if not database_url.strip():
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
        if len(row) != 4:
            raise DatabaseRepositoryError("Food score run lookup returned an invalid row")
        raw_run_id, fingerprint, output_hash, status = row
        if (
            not isinstance(raw_run_id, (str, UUID))
            or not isinstance(fingerprint, str)
            or not isinstance(output_hash, str)
            or not isinstance(status, str)
        ):
            raise DatabaseRepositoryError("Food score run lookup returned an invalid row")
        _require_sha256(fingerprint, "stored run fingerprint")
        _require_sha256(output_hash, "stored output hash")
        if status != "validated":
            raise DatabaseRepositoryError(
                f"existing Food run {raw_run_id} is not validated and cannot be reused"
            )
        return ExistingRun(str(raw_run_id), fingerprint, output_hash, status)

    def find_by_fingerprint(self, fingerprint: str) -> ExistingRun | None:
        _require_sha256(fingerprint, "run fingerprint")
        with self._connect(self._database_url) as connection:
            row = connection.execute(FIND_RUN_SQL, (fingerprint,)).fetchone()
        return self._existing(row)

    @staticmethod
    def _resolved_run(row: tuple[object, ...] | None) -> BaselineRunInput:
        if row is None:
            raise DatabaseRepositoryError("approved pinned baseline run is not loaded")
        if len(row) != 8:
            raise DatabaseRepositoryError("pinned baseline run lookup returned an invalid row")
        (
            run_id,
            methodology_version,
            registry_hash,
            input_manifest_hash,
            run_fingerprint,
            status,
            validation_result,
            output_hash,
        ) = row
        comparisons = (
            (run_id, PINNED_BASELINE_RUN_ID, "baseline run ID"),
            (methodology_version, PINNED_BASELINE_METHODOLOGY, "baseline methodology"),
            (registry_hash, PINNED_BASELINE_REGISTRY_HASH, "baseline registry hash"),
            (
                input_manifest_hash,
                PINNED_BASELINE_INPUT_MANIFEST_HASH,
                "baseline input manifest hash",
            ),
            (
                run_fingerprint,
                PINNED_BASELINE_RUN_FINGERPRINT,
                "baseline run fingerprint",
            ),
            (status, "validated", "baseline status"),
            (output_hash, PINNED_BASELINE_OUTPUT_HASH, "baseline output hash"),
        )
        for actual, expected, label in comparisons:
            if actual != expected:
                raise DatabaseRepositoryError(
                    f"{label} does not match the approved pinned baseline"
                )
        if not isinstance(validation_result, Mapping):
            raise DatabaseRepositoryError("pinned baseline validation result is missing")
        expected_counts = {
            key: value for key, value in EXPECTED_BASELINE_QUALITY_COUNTS.items() if value > 0
        }
        if (
            validation_result.get("geography_count") != 302
            or validation_result.get("score_count") != 302
            or validation_result.get("quality_counts") != expected_counts
        ):
            raise DatabaseRepositoryError(
                "pinned baseline validation result does not reconcile to 302 scores"
            )
        return BaselineRunInput(
            run_id=PINNED_BASELINE_RUN_ID,
            output_hash=PINNED_BASELINE_OUTPUT_HASH,
            methodology_version=PINNED_BASELINE_METHODOLOGY,
            registry_hash=PINNED_BASELINE_REGISTRY_HASH,
            run_fingerprint=PINNED_BASELINE_RUN_FINGERPRINT,
            status="validated",
            verified=True,
        )

    @staticmethod
    def _resolved_scores(
        rows: list[tuple[object, ...]],
    ) -> tuple[tuple[BaselineScoreInput, ...], Mapping[str, str]]:
        scores: list[BaselineScoreInput] = []
        geography_ids: dict[str, str] = {}
        quality_counts = dict.fromkeys(EXPECTED_BASELINE_QUALITY_COUNTS, 0)
        score_ids: set[str] = set()
        for row in rows:
            if len(row) != 6:
                raise DatabaseRepositoryError(
                    "pinned baseline score lookup returned an invalid row"
                )
            score_id, geography_id, geoid, population, quality_status, band = row
            if (
                not isinstance(score_id, str)
                or not isinstance(geography_id, str)
                or not isinstance(geoid, str)
                or not isinstance(population, int)
                or not isinstance(quality_status, str)
                or (band is not None and not isinstance(band, str))
            ):
                raise DatabaseRepositoryError(
                    "pinned baseline score lookup returned an invalid row"
                )
            try:
                if str(UUID(score_id)) != score_id or str(UUID(geography_id)) != geography_id:
                    raise ValueError
            except ValueError as error:
                raise DatabaseRepositoryError(
                    "pinned baseline score lookup returned a noncanonical UUID"
                ) from error
            if not GEOID_PATTERN.fullmatch(geoid):
                raise DatabaseRepositoryError("pinned baseline score has an invalid GEOID")
            if geoid in geography_ids or score_id in score_ids:
                raise DatabaseRepositoryError("pinned baseline scores contain duplicate identity")
            if quality_status not in quality_counts:
                raise DatabaseRepositoryError(
                    f"pinned baseline score has unknown quality status {quality_status!r}"
                )
            if population < 0:
                raise DatabaseRepositoryError("pinned baseline population cannot be negative")
            if quality_status == "complete":
                if population <= 0 or band not in BASELINE_BAND_MAP:
                    raise DatabaseRepositoryError(
                        "complete pinned baseline score requires population and a valid band"
                    )
            elif quality_status == "ineligible_zero_population":
                if population != 0 or band is not None:
                    raise DatabaseRepositoryError(
                        "zero-population pinned baseline score has inconsistent values"
                    )
            elif band is not None:
                raise DatabaseRepositoryError(
                    "insufficient pinned baseline score cannot retain a band"
                )
            geography_ids[geoid] = geography_id
            score_ids.add(score_id)
            quality_counts[quality_status] += 1
            scores.append(
                BaselineScoreInput(
                    geoid=geoid,
                    score_id=score_id,
                    population=Decimal(population),
                    status=quality_status,
                    band=BASELINE_BAND_MAP[band] if band is not None else None,
                )
            )
        if len(scores) != 302 or quality_counts != EXPECTED_BASELINE_QUALITY_COUNTS:
            raise DatabaseRepositoryError(
                "pinned baseline scores must contain exactly 302 rows "
                "(300 complete, 2 zero-population, 0 insufficient)"
            )
        return tuple(scores), MappingProxyType(geography_ids)

    def resolve_pinned_baseline(self) -> ResolvedBaseline:
        """Resolve and fully reconcile the exact approved development baseline."""

        with self._connect(self._database_url) as connection:
            connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            run_row = connection.execute(
                RESOLVE_BASELINE_RUN_SQL, (PINNED_BASELINE_RUN_ID,)
            ).fetchone()
            score_rows = connection.execute(
                RESOLVE_BASELINE_SCORES_SQL, (PINNED_BASELINE_RUN_ID,)
            ).fetchall()
        run = self._resolved_run(run_row)
        scores, geography_ids = self._resolved_scores(score_rows)
        return ResolvedBaseline(run=run, scores=scores, geography_ids=geography_ids)

    def execute_transaction(self, statements: tuple[ParameterizedStatement, ...]) -> None:
        """Execute ordered, bound statements in one rollback-safe transaction."""

        if not isinstance(statements, tuple) or not all(
            isinstance(statement, ParameterizedStatement) for statement in statements
        ):
            raise DatabaseRepositoryError("transaction requires parameterized statements")
        with self._connect(self._database_url) as connection:
            with connection.pipeline():
                for statement in statements:
                    connection.execute(statement.sql, statement.parameters)

    def persist_validated(self, candidate: RunCandidate) -> ExistingRun:
        """Write load records, draft, analytics, and validation atomically."""

        if not isinstance(candidate.payload, ValidatedWritePlan):
            raise DatabaseRepositoryError("validated candidate requires a write plan")
        _require_sha256(candidate.run_fingerprint, "run fingerprint")
        _require_sha256(candidate.output_hash, "output hash")
        plan = candidate.payload
        now = self._clock()
        with self._connect(self._database_url) as connection:
            existing = self._existing(
                connection.execute(FIND_RUN_SQL, (candidate.run_fingerprint,)).fetchone()
            )
            if existing is not None:
                if existing.output_hash != candidate.output_hash:
                    raise OutputHashMismatch(
                        "recomputed canonical output hash does not match the concurrent run"
                    )
                return existing
            baseline = self._resolved_run(
                connection.execute(
                    RESOLVE_BASELINE_RUN_SQL, (plan.equity_baseline_run_id,)
                ).fetchone()
            )
            if baseline.output_hash != plan.equity_baseline_output_hash:
                raise DatabaseRepositoryError("pinned baseline changed before the Food transaction")
            with connection.pipeline():
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
                        plan.equity_baseline_run_id,
                        plan.equity_baseline_output_hash,
                        now,
                        Jsonb(dict(plan.data_vintages)),
                        plan.git_commit,
                        now,
                    ),
                )
                for statement in plan.analytical_statements:
                    connection.execute(statement.sql, statement.parameters)
                for statement in plan.reconciliation_statements:
                    if connection.execute(statement.sql, statement.parameters).fetchone() != (
                        True,
                    ):
                        raise DatabaseRepositoryError(
                            "persisted Food rows did not match the validated write plan"
                        )
                validated_row = connection.execute(
                    VALIDATE_RUN_SQL,
                    (
                        self._clock(),
                        Jsonb(dict(plan.validation_result)),
                        candidate.output_hash,
                        plan.run_id,
                    ),
                ).fetchone()
                if validated_row != (plan.run_id,):
                    raise DatabaseRepositoryError(
                        "Food run validation did not transition exactly one matching draft"
                    )
        return ExistingRun(
            plan.run_id,
            candidate.run_fingerprint,
            candidate.output_hash,
            "validated",
        )

    def mark_failed(self, run_id: str, metadata: Mapping[str, object]) -> None:
        """Mark a surviving draft failed in its own parameterized transaction."""

        if not run_id.strip():
            raise DatabaseRepositoryError("run ID cannot be empty")
        with self._connect(self._database_url) as connection:
            connection.execute(
                FAIL_RUN_SQL,
                (self._clock(), Jsonb(dict(metadata)), run_id),
            )


__all__ = [
    "DatabaseRepositoryError",
    "ParameterizedStatement",
    "PsycopgRunRepository",
    "ResolvedBaseline",
    "ValidatedWritePlan",
]
