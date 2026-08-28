from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from uuid import UUID

import pytest

from pipelines.equity_baseline.database import (
    DatabaseRepositoryError,
    ParameterizedStatement,
    PsycopgRunRepository,
    ValidatedWritePlan,
)
from pipelines.equity_baseline.runner import (
    ExistingRun,
    OutputHashMismatch,
    PipelineRunner,
    PipelineStage,
    RunCandidate,
    RunnerConfigurationError,
    coordinate_run,
)


NOW = datetime(2026, 8, 28, 12, tzinfo=UTC)


class FakeResult:
    def __init__(self, row: tuple[object, ...] | None = None) -> None:
        self.row = row

    def fetchone(self) -> tuple[object, ...] | None:
        return self.row


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
        self,
        *,
        fail_on: str | None = None,
        row: tuple[object, ...] | None = None,
    ) -> None:
        self.fail_on = fail_on
        self.row = row
        self.executions: list[tuple[str, tuple[object, ...] | None]] = []
        self.exit_error: type[BaseException] | None = None
        self.pipeline_entries = 0
        self.pipeline_exit_error: type[BaseException] | None = None

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
        if self.fail_on is not None and self.fail_on in sql:
            raise RuntimeError("simulated database failure")
        return FakeResult(self.row if sql.startswith("SELECT id,") else None)

    def pipeline(self) -> FakePipeline:
        return FakePipeline(self)


class FakeFailedRunRepository:
    def __init__(self) -> None:
        self.failures: list[tuple[str, Mapping[str, object]]] = []

    def mark_failed(self, run_id: str, metadata: Mapping[str, object]) -> None:
        self.failures.append((run_id, metadata))


class FakeIdempotentRepository:
    def __init__(self, existing: ExistingRun | None = None) -> None:
        self.existing = existing
        self.created: list[RunCandidate] = []

    def find_by_fingerprint(self, fingerprint: str) -> ExistingRun | None:
        assert len(fingerprint) == 64
        return self.existing

    def persist_validated(self, candidate: RunCandidate) -> ExistingRun:
        self.created.append(candidate)
        self.existing = ExistingRun(
            run_id="new-run",
            run_fingerprint=candidate.run_fingerprint,
            output_hash=candidate.output_hash,
            status="validated",
        )
        return self.existing


def handlers(calls: list[PipelineStage]) -> dict[PipelineStage, object]:
    output: dict[PipelineStage, object] = {}
    for stage in PipelineStage:

        def handler(
            state: dict[str, object], current: PipelineStage = stage
        ) -> Mapping[str, object]:
            calls.append(current)
            return {
                "last_stage": current.value,
                **({"run_id": "draft-run"} if current is PipelineStage.LOAD else {}),
            }

        output[stage] = handler
    return output


def test_run_executes_exact_order_through_validated() -> None:
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
    assert report.completed_stages == tuple(stage.value for stage in PipelineStage)
    assert report.status == "succeeded"
    assert report.run_id == "draft-run"


@pytest.mark.parametrize("stage", list(PipelineStage))
def test_single_stage_command_runs_only_requested_stage(stage: PipelineStage) -> None:
    calls: list[PipelineStage] = []
    environment = (
        {"MKE_PIPELINE_ENV": "development", "DATABASE_URL_UNPOOLED": "postgresql://db"}
        if stage.requires_database
        else {}
    )
    runner = PipelineRunner(handlers=handlers(calls), environment=environment, clock=lambda: NOW)

    report = runner.execute(stage.value)

    assert calls == [stage]
    assert report.completed_stages == (stage.value,)


@pytest.mark.parametrize(
    "stage", [PipelineStage.FETCH, PipelineStage.VALIDATE, PipelineStage.NORMALIZE]
)
def test_read_only_stages_do_not_require_database_configuration(stage: PipelineStage) -> None:
    calls: list[PipelineStage] = []
    report = PipelineRunner(handlers=handlers(calls), environment={}, clock=lambda: NOW).execute(
        stage.value
    )
    assert report.status == "succeeded"


@pytest.mark.parametrize(
    "environment",
    [
        {},
        {"MKE_PIPELINE_ENV": "production", "DATABASE_URL_UNPOOLED": "postgresql://db"},
        {"MKE_PIPELINE_ENV": "development"},
        {"MKE_PIPELINE_ENV": "local", "DATABASE_URL_UNPOOLED": "postgresql://db"},
    ],
)
def test_write_stages_are_rejected_without_exact_development_guard(
    environment: dict[str, str],
) -> None:
    runner = PipelineRunner(handlers=handlers([]), environment=environment, clock=lambda: NOW)

    with pytest.raises(RunnerConfigurationError, match="development"):
        runner.execute(PipelineStage.LOAD.value)


def test_stage_failure_redacts_secrets_and_marks_existing_draft_failed() -> None:
    repository = FakeFailedRunRepository()

    def load(_state: dict[str, object]) -> Mapping[str, object]:
        return {"run_id": "draft-run"}

    def score(_state: dict[str, object]) -> Mapping[str, object]:
        raise RuntimeError("database postgresql://user:password@example.test/db key=abc123 failed")

    stage_handlers = handlers([])
    stage_handlers[PipelineStage.LOAD] = load
    stage_handlers[PipelineStage.SCORE] = score
    runner = PipelineRunner(
        handlers=stage_handlers,
        environment={
            "MKE_PIPELINE_ENV": "development",
            "DATABASE_URL_UNPOOLED": "postgresql://user:password@example.test/db",
        },
        failure_repository=repository,
        clock=lambda: NOW,
    )

    report = runner.execute("run", through="validated")

    assert report.status == "failed"
    assert "password" not in report.error.lower()
    assert "abc123" not in report.error
    assert "postgresql://" not in report.error
    assert repository.failures == [
        (
            "draft-run",
            {
                "error_type": "RuntimeError",
                "message": report.error,
                "failed_stage": "score",
            },
        )
    ]


def test_same_fingerprint_returns_existing_run_without_duplicate_writes() -> None:
    fingerprint = "a" * 64
    output_hash = "b" * 64
    existing = ExistingRun("existing-run", fingerprint, output_hash, "validated")
    repository = FakeIdempotentRepository(existing)

    outcome = coordinate_run(
        repository,
        RunCandidate(fingerprint, output_hash),
        verify_existing=False,
    )

    assert outcome.run == existing
    assert outcome.reused is True
    assert outcome.verified_existing is False
    assert repository.created == []


def test_verify_existing_recomputes_and_compares_output_hash() -> None:
    fingerprint = "a" * 64
    output_hash = "b" * 64
    repository = FakeIdempotentRepository(
        ExistingRun("existing-run", fingerprint, output_hash, "validated")
    )

    outcome = coordinate_run(
        repository,
        RunCandidate(fingerprint, output_hash),
        verify_existing=True,
    )

    assert outcome.verified_existing is True
    with pytest.raises(OutputHashMismatch, match="does not match"):
        coordinate_run(
            repository,
            RunCandidate(fingerprint, "c" * 64),
            verify_existing=True,
        )


def test_new_fingerprint_persists_once() -> None:
    candidate = RunCandidate("a" * 64, "b" * 64)
    repository = FakeIdempotentRepository()

    outcome = coordinate_run(repository, candidate, verify_existing=False)

    assert outcome.run.run_id == "new-run"
    assert outcome.reused is False
    assert repository.created == [candidate]


def test_psycopg_transaction_passes_values_separately_and_rolls_back_on_error() -> None:
    secret_value = "source-value-that-must-not-enter-sql"
    connection = FakeConnection(fail_on="SECOND")
    repository = PsycopgRunRepository(
        "postgresql://secret",
        connect=lambda _url: connection,
        clock=lambda: NOW,
    )

    with pytest.raises(RuntimeError, match="simulated"):
        repository.execute_transaction(
            (
                ParameterizedStatement("INSERT FIRST VALUES (%s)", (secret_value,)),
                ParameterizedStatement("INSERT SECOND VALUES (%s)", ("other",)),
            )
        )

    assert secret_value not in connection.executions[0][0]
    assert connection.executions[0][1] == (secret_value,)
    assert connection.pipeline_entries == 1
    assert connection.pipeline_exit_error is RuntimeError
    assert connection.exit_error is RuntimeError
    assert "secret" not in repr(repository)


def test_repository_rejects_multi_command_and_missing_write_plan() -> None:
    with pytest.raises(DatabaseRepositoryError, match="one command"):
        ParameterizedStatement("SELECT 1; DROP TABLE scores", ())
    repository = PsycopgRunRepository(
        "postgresql://secret", connect=lambda _url: FakeConnection(), clock=lambda: NOW
    )
    with pytest.raises(DatabaseRepositoryError, match="write plan"):
        repository.persist_validated(RunCandidate("a" * 64, "b" * 64))


def test_repository_adapts_native_postgres_uuid_for_an_existing_run() -> None:
    run_id = UUID("502e2a04-b013-53cd-8b09-c9144862701a")
    connection = FakeConnection(row=(run_id, "a" * 64, "b" * 64, "validated"))
    repository = PsycopgRunRepository(
        "postgresql://secret", connect=lambda _url: connection, clock=lambda: NOW
    )

    existing = repository.find_by_fingerprint("a" * 64)

    assert existing == ExistingRun(str(run_id), "a" * 64, "b" * 64, "validated")


def test_repository_persists_load_draft_analytics_and_validation_in_order() -> None:
    connection = FakeConnection()
    plan = ValidatedWritePlan(
        run_id="run-1",
        methodology_version="equity-baseline-v1",
        registry_hash="c" * 64,
        input_manifest_hash="d" * 64,
        scoring_implementation_version="1",
        data_vintages={"acs": "2024"},
        git_commit="bad3ef7",
        load_statements=(ParameterizedStatement("INSERT LOAD VALUES (%s)", ("base",)),),
        analytical_statements=(ParameterizedStatement("INSERT ANALYTICS VALUES (%s)", ("score",)),),
        validation_result={"valid": True},
    )
    repository = PsycopgRunRepository(
        "postgresql://secret", connect=lambda _url: connection, clock=lambda: NOW
    )

    run = repository.persist_validated(RunCandidate("a" * 64, "b" * 64, plan))

    assert run.status == "validated"
    assert [sql.split()[0:2] for sql, _parameters in connection.executions] == [
        ["SELECT", "id,"],
        ["INSERT", "LOAD"],
        ["INSERT", "INTO"],
        ["INSERT", "ANALYTICS"],
        ["UPDATE", "score_runs"],
    ]
    assert connection.pipeline_entries == 1
    assert connection.exit_error is None
