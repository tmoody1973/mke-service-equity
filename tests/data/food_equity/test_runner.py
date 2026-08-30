from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime

import pytest

from pipelines.common.runner import (
    ExistingRun,
    OutputHashMismatch,
    RunCandidate,
    RunnerConfigurationError,
    coordinate_run,
)
from pipelines.food_equity.database import (
    DatabaseRepositoryError,
    ParameterizedStatement,
    PsycopgRunRepository,
    ValidatedWritePlan,
)
from pipelines.food_equity.runner import PipelineRunner, PipelineStage


NOW = datetime(2026, 8, 29, 12, tzinfo=UTC)
PINNED_BASELINE_RUN_ID = "502e2a04-b013-53cd-8b09-c9144862701a"
PINNED_BASELINE_OUTPUT_HASH = "19069c257e8f51fb4370b1ec8d04c6f823bd85e133846cf504866404c2c4e946"
PINNED_BASELINE_ROW = (
    PINNED_BASELINE_RUN_ID,
    "equity-baseline-v1",
    "8e31bf6f2d89963d24bb76f2074cafc8848a69ca147e6015cc83716ce5fcbfc2",
    "b34eaa2dcbc823ae2e145467e95de2b175066eeceac2dd7ccded4f06cdea6b8d",
    "125f23262552c9179d6dae2be69b44b30042ee5bdfdc9c5188087d73b6d531e8",
    "validated",
    {
        "geography_count": 302,
        "score_count": 302,
        "quality_counts": {"complete": 300, "ineligible_zero_population": 2},
    },
    PINNED_BASELINE_OUTPUT_HASH,
)
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


class FakeResult:
    def __init__(
        self,
        row: tuple[object, ...] | None = None,
        rows: list[tuple[object, ...]] | None = None,
    ) -> None:
        self.row = row
        self.rows = rows or []

    def fetchone(self) -> tuple[object, ...] | None:
        return self.row

    def fetchall(self) -> list[tuple[object, ...]]:
        return self.rows


class FakePipeline:
    def __init__(self, connection: FakeConnection) -> None:
        self.connection = connection

    def __enter__(self) -> FakePipeline:
        self.connection.pipeline_entries += 1
        return self

    def __exit__(
        self,
        error_type: type[BaseException] | None,
        _error: BaseException | None,
        _traceback: object,
    ) -> None:
        self.connection.pipeline_exit_error = error_type


class FakeConnection:
    def __init__(
        self, *, fail_on: str | None = None, row: tuple[object, ...] | None = None
    ) -> None:
        self.fail_on = fail_on
        self.row = row
        self.executions: list[tuple[str, tuple[object, ...] | None]] = []
        self.pipeline_entries = 0
        self.pipeline_exit_error: type[BaseException] | None = None
        self.exit_error: type[BaseException] | None = None

    def __enter__(self) -> FakeConnection:
        return self

    def __exit__(
        self,
        error_type: type[BaseException] | None,
        _error: BaseException | None,
        _traceback: object,
    ) -> None:
        self.exit_error = error_type

    def execute(self, sql: str, parameters: tuple[object, ...] | None = None) -> FakeResult:
        self.executions.append((sql, parameters))
        if self.fail_on and self.fail_on in sql:
            raise RuntimeError("simulated database failure")
        if "RETURNING id::text" in sql:
            return FakeResult(("food-run-1",))
        if "FROM score_runs WHERE id" in sql:
            return FakeResult(PINNED_BASELINE_ROW)
        return FakeResult(self.row if sql.startswith("SELECT id,") else None)

    def pipeline(self) -> FakePipeline:
        return FakePipeline(self)


class BaselineConnection(FakeConnection):
    def execute(self, sql: str, parameters: tuple[object, ...] | None = None) -> FakeResult:
        self.executions.append((sql, parameters))
        if "FROM score_runs WHERE id" in sql:
            return FakeResult(PINNED_BASELINE_ROW)
        if "FROM scores JOIN geographies" in sql:
            rows = [
                (
                    f"00000000-0000-0000-0001-{index:012d}",
                    f"00000000-0000-0000-0002-{index:012d}",
                    f"55079{index:06d}",
                    100 if index <= 300 else 0,
                    "complete" if index <= 300 else "ineligible_zero_population",
                    "low" if index <= 300 else None,
                )
                for index in range(1, 303)
            ]
            return FakeResult(rows=rows)
        return FakeResult()


class FailureRepository:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Mapping[str, object]]] = []

    def mark_failed(self, run_id: str, metadata: Mapping[str, object]) -> None:
        self.calls.append((run_id, metadata))


class IdempotentRepository:
    def __init__(self, existing: ExistingRun | None = None) -> None:
        self.existing = existing
        self.created: list[RunCandidate] = []

    def find_by_fingerprint(self, _fingerprint: str) -> ExistingRun | None:
        return self.existing

    def persist_validated(self, candidate: RunCandidate) -> ExistingRun:
        self.created.append(candidate)
        self.existing = ExistingRun(
            "new-run", candidate.run_fingerprint, candidate.output_hash, "validated"
        )
        return self.existing


def handlers(calls: list[PipelineStage]) -> dict[PipelineStage, object]:
    result: dict[PipelineStage, object] = {}
    for stage in PipelineStage:

        def handler(
            _state: dict[str, object], current: PipelineStage = stage
        ) -> Mapping[str, object]:
            calls.append(current)
            return {
                **({"run_id": "food-run"} if current is PipelineStage.VALIDATE_RUN else {}),
                **({"output_hash": "b" * 64} if current is PipelineStage.SCORE else {}),
            }

        result[stage] = handler
    return result


def write_plan() -> ValidatedWritePlan:
    return ValidatedWritePlan(
        run_id="food-run-1",
        methodology_version="food-equity-v1",
        registry_hash="c" * 64,
        input_manifest_hash="d" * 64,
        scoring_implementation_version="1",
        equity_baseline_run_id=PINNED_BASELINE_RUN_ID,
        equity_baseline_output_hash=PINNED_BASELINE_OUTPUT_HASH,
        data_vintages={"sram": "2025", "acs_vehicle": "2024"},
        git_commit="bad3ef7",
        load_statements=(ParameterizedStatement("INSERT LOAD VALUES (%s)", ("resource",)),),
        analytical_statements=(ParameterizedStatement("INSERT ANALYTICS VALUES (%s)", ("score",)),),
        validation_result={"valid": True, "publishable": False},
    )


def test_stage_order_and_database_boundaries_are_exact() -> None:
    assert tuple(stage.value for stage in PipelineStage) == STAGES
    assert (
        tuple(stage.value for stage in PipelineStage if not stage.requires_database) == STAGES[:5]
    )
    assert tuple(stage.value for stage in PipelineStage if stage.requires_database) == STAGES[5:]


def test_run_executes_every_stage_in_order_through_validated() -> None:
    calls: list[PipelineStage] = []
    runner = PipelineRunner(
        handlers=handlers(calls),
        environment={
            "MKE_PIPELINE_ENV": "development",
            "DATABASE_URL_UNPOOLED": "postgresql://secret.example/test",
        },
        clock=lambda: NOW,
    )

    report = runner.execute("run", through="validated")

    assert calls == list(PipelineStage)
    assert report.completed_stages == STAGES
    assert report.status == "succeeded"
    assert report.run_id == "food-run"


def test_normal_atomic_failure_before_validate_has_no_surviving_draft_to_mark() -> None:
    failure_repository = FailureRepository()

    def fail(_state: dict[str, object]) -> Mapping[str, object]:
        raise RuntimeError("score failed")

    stage_handlers = handlers([])
    stage_handlers[PipelineStage.SCORE] = fail
    report = PipelineRunner(
        handlers=stage_handlers,
        environment={
            "MKE_PIPELINE_ENV": "development",
            "DATABASE_URL_UNPOOLED": "postgresql://example.test/db",
        },
        failure_repository=failure_repository,
        clock=lambda: NOW,
    ).execute("run", through="validated")

    assert report.status == "failed"
    assert report.run_id is None
    assert failure_repository.calls == []


@pytest.mark.parametrize("stage", list(PipelineStage))
def test_single_stage_runs_only_itself(stage: PipelineStage) -> None:
    calls: list[PipelineStage] = []
    environment = (
        {"MKE_PIPELINE_ENV": "development", "DATABASE_URL_UNPOOLED": "postgresql://db"}
        if stage.requires_database
        else {}
    )

    report = PipelineRunner(
        handlers=handlers(calls), environment=environment, clock=lambda: NOW
    ).execute(stage.value)

    assert calls == [stage]
    assert report.completed_stages == (stage.value,)


@pytest.mark.parametrize("stage", list(PipelineStage)[:5])
def test_read_only_stages_need_no_database(stage: PipelineStage) -> None:
    report = PipelineRunner(handlers=handlers([]), environment={}, clock=lambda: NOW).execute(
        stage.value
    )
    assert report.status == "succeeded"


@pytest.mark.parametrize("stage", list(PipelineStage)[5:])
@pytest.mark.parametrize(
    "environment",
    [
        {},
        {"MKE_PIPELINE_ENV": "production", "DATABASE_URL_UNPOOLED": "postgresql://db"},
        {"MKE_PIPELINE_ENV": "development"},
        {"MKE_PIPELINE_ENV": "local", "DATABASE_URL_UNPOOLED": "postgresql://db"},
    ],
)
def test_write_stages_require_exact_development_guard(
    stage: PipelineStage, environment: dict[str, str]
) -> None:
    runner = PipelineRunner(handlers=handlers([]), environment=environment, clock=lambda: NOW)
    with pytest.raises(RunnerConfigurationError, match="development"):
        runner.execute(stage.value)


def test_run_cannot_target_publication() -> None:
    runner = PipelineRunner(handlers=handlers([]), environment={}, clock=lambda: NOW)
    with pytest.raises(RunnerConfigurationError, match="validated"):
        runner.execute("run", through="published")


def test_failure_is_redacted_and_existing_draft_is_marked_failed() -> None:
    failure_repository = FailureRepository()
    credential = "".join(("pass", "word"))
    database_url = f"postgresql://user:{credential}@example.test/db"

    def load(_state: dict[str, object]) -> Mapping[str, object]:
        return {"run_id": "draft-food-run"}

    def fail(_state: dict[str, object]) -> Mapping[str, object]:
        raise RuntimeError(f"{database_url} key=abc123 token=xyz failed")

    stage_handlers = handlers([])
    stage_handlers[PipelineStage.LOAD] = load
    stage_handlers[PipelineStage.SCORE] = fail
    report = PipelineRunner(
        handlers=stage_handlers,
        environment={
            "MKE_PIPELINE_ENV": "development",
            "DATABASE_URL_UNPOOLED": database_url,
        },
        failure_repository=failure_repository,
        clock=lambda: NOW,
    ).execute("run", through="validated")

    assert report.status == "failed"
    assert report.error is not None
    assert all(
        secret not in report.error for secret in ("postgresql://", credential, "abc123", "xyz")
    )
    assert failure_repository.calls == [
        (
            "draft-food-run",
            {
                "error_type": "RuntimeError",
                "message": report.error,
                "failed_stage": "score",
            },
        )
    ]


def test_same_fingerprint_reuses_without_duplicate_writes_and_can_verify_hash() -> None:
    existing = ExistingRun("existing-run", "a" * 64, "b" * 64, "validated")
    repository = IdempotentRepository(existing)

    outcome = coordinate_run(repository, RunCandidate("a" * 64, "b" * 64), verify_existing=True)

    assert outcome.run == existing
    assert outcome.reused is True
    assert outcome.verified_existing is True
    assert repository.created == []

    with pytest.raises(OutputHashMismatch, match="does not match"):
        coordinate_run(repository, RunCandidate("a" * 64, "c" * 64), verify_existing=True)


def test_new_fingerprint_persists_once_then_reuses() -> None:
    repository = IdempotentRepository()
    candidate = RunCandidate("a" * 64, "b" * 64)

    first = coordinate_run(repository, candidate, verify_existing=False)
    second = coordinate_run(repository, candidate, verify_existing=True)

    assert first.reused is False
    assert second.reused is True
    assert repository.created == [candidate]


def test_parameterized_transaction_rolls_back_as_one_unit() -> None:
    secret = "must-not-enter-sql"
    connection = FakeConnection(fail_on="SECOND")
    repository = PsycopgRunRepository(
        "postgresql://secret", connect=lambda _url: connection, clock=lambda: NOW
    )

    with pytest.raises(RuntimeError, match="simulated"):
        repository.execute_transaction(
            (
                ParameterizedStatement("INSERT FIRST VALUES (%s)", (secret,)),
                ParameterizedStatement("INSERT SECOND VALUES (%s)", ("other",)),
            )
        )

    assert secret not in connection.executions[0][0]
    assert connection.executions[0][1] == (secret,)
    assert connection.pipeline_entries == 1
    assert connection.pipeline_exit_error is RuntimeError
    assert connection.exit_error is RuntimeError
    assert "secret" not in repr(repository)


def test_repository_rejects_multi_command_and_candidate_without_write_plan() -> None:
    with pytest.raises(DatabaseRepositoryError, match="one command"):
        ParameterizedStatement("SELECT 1; DROP TABLE food_scores", ())
    repository = PsycopgRunRepository(
        "postgresql://secret", connect=lambda _url: FakeConnection(), clock=lambda: NOW
    )
    with pytest.raises(DatabaseRepositoryError, match="write plan"):
        repository.persist_validated(RunCandidate("a" * 64, "b" * 64))


def test_resolve_pinned_baseline_uses_one_repeatable_read_and_reconciles_tracts() -> None:
    connection = BaselineConnection()
    repository = PsycopgRunRepository(
        "postgresql://secret", connect=lambda _url: connection, clock=lambda: NOW
    )

    resolved = repository.resolve_pinned_baseline()

    assert connection.executions[0][0] == (
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    )
    assert resolved.run.verified is True
    assert len(resolved.scores) == 302
    assert sum(item.status == "complete" for item in resolved.scores) == 300
    assert sum(item.status == "ineligible_zero_population" for item in resolved.scores) == 2
    assert resolved.scores[0].band == "Low"
    assert len(resolved.geography_ids) == 302


def test_persist_order_is_load_draft_analytics_validate_in_one_transaction() -> None:
    connection = FakeConnection()
    repository = PsycopgRunRepository(
        "postgresql://secret", connect=lambda _url: connection, clock=lambda: NOW
    )

    run = repository.persist_validated(RunCandidate("a" * 64, "b" * 64, write_plan()))

    sql = [statement for statement, _parameters in connection.executions]
    assert run.status == "validated"
    assert "food_score_runs" in sql[0]
    assert "FROM score_runs WHERE id" in sql[1]
    assert sql[2].startswith("INSERT LOAD")
    assert "INSERT INTO food_score_runs" in sql[3]
    assert sql[4].startswith("INSERT ANALYTICS")
    assert "UPDATE food_score_runs" in sql[5]
    assert connection.pipeline_entries == 1
    draft_parameters = connection.executions[3][1]
    assert draft_parameters is not None
    assert PINNED_BASELINE_RUN_ID in draft_parameters
    assert PINNED_BASELINE_OUTPUT_HASH in draft_parameters


def test_persist_recheck_rejects_concurrent_output_hash_mismatch() -> None:
    connection = FakeConnection(row=("existing-run", "a" * 64, "c" * 64, "validated"))
    repository = PsycopgRunRepository(
        "postgresql://secret", connect=lambda _url: connection, clock=lambda: NOW
    )

    with pytest.raises(OutputHashMismatch, match="concurrent run"):
        repository.persist_validated(RunCandidate("a" * 64, "b" * 64, write_plan()))

    assert len(connection.executions) == 1


def test_persisted_row_reconciliation_failure_rolls_back_before_validation() -> None:
    connection = FakeConnection()
    repository = PsycopgRunRepository(
        "postgresql://secret", connect=lambda _url: connection, clock=lambda: NOW
    )
    original = write_plan()
    values = {name: getattr(original, name) for name in ValidatedWritePlan.__dataclass_fields__}
    values["reconciliation_statements"] = (ParameterizedStatement("SELECT RECONCILE", ()),)

    with pytest.raises(DatabaseRepositoryError, match="did not match"):
        repository.persist_validated(RunCandidate("a" * 64, "b" * 64, ValidatedWritePlan(**values)))

    assert connection.pipeline_exit_error is DatabaseRepositoryError
    assert connection.exit_error is DatabaseRepositoryError
    assert all("UPDATE food_score_runs" not in sql for sql, _parameters in connection.executions)


@pytest.mark.parametrize(
    ("field", "replacement", "message"),
    [
        ("equity_baseline_run_id", "00000000-0000-0000-0000-000000000000", "baseline run"),
        ("equity_baseline_output_hash", "0" * 64, "baseline output hash"),
    ],
)
def test_write_plan_locks_exact_pinned_baseline_lineage(
    field: str, replacement: str, message: str
) -> None:
    original = write_plan()
    values = {name: getattr(original, name) for name in ValidatedWritePlan.__dataclass_fields__}
    values[field] = replacement
    with pytest.raises(DatabaseRepositoryError, match=message):
        ValidatedWritePlan(**values)


def test_mark_failed_is_separate_parameterized_draft_transition() -> None:
    connection = FakeConnection()
    repository = PsycopgRunRepository(
        "postgresql://secret", connect=lambda _url: connection, clock=lambda: NOW
    )

    repository.mark_failed("food-run-1", {"message": "[REDACTED]"})

    sql, parameters = connection.executions[0]
    assert "UPDATE food_score_runs" in sql
    assert "status = 'failed'" in sql
    assert "status = 'draft'" in sql
    assert parameters is not None
    assert "[REDACTED]" not in sql
