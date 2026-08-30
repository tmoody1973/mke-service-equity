from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from pipelines.atlas_neighborhoods import (
    NeighborhoodDatabaseError,
    NeighborhoodPersistencePlan,
    PsycopgNeighborhoodRepository,
    build_persistence_plan,
    fetch_neighborhood_snapshot,
    require_development_environment,
)

FIXTURE = Path(__file__).parents[1] / "fixtures/atlas_neighborhoods/representative.geojson"
NOW = datetime(2026, 8, 30, 12, tzinfo=UTC)


class HttpResponse:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def __enter__(self) -> HttpResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self, amount: int = -1) -> bytes:
        return self.content if amount < 0 else self.content[:amount]


def plan(tmp_path: Path) -> NeighborhoodPersistencePlan:
    snapshot = fetch_neighborhood_snapshot(
        tmp_path,
        opener=lambda _request: HttpResponse(FIXTURE.read_bytes()),
        sleeper=lambda _seconds: None,
        clock=lambda: NOW,
        expected_count=2,
    )
    return build_persistence_plan(snapshot, clock=lambda: NOW)


def test_plan_is_deterministic_parameterized_and_keeps_spatial_work_in_postgis(
    tmp_path: Path,
) -> None:
    first = plan(tmp_path)
    second = plan(tmp_path)

    assert first.source_id == second.source_id
    assert first.snapshot_id == second.snapshot_id
    assert first.snapshot_fingerprint == second.snapshot_fingerprint
    assert first.expected_feature_count == 2
    assert len(first.statements) == 8
    sql = "\n".join(statement.sql for statement in first.statements)
    assert "ST_Transform(g.geometry,3071)" in sql
    assert "ST_Intersection" in sql
    assert "g.vintage='2020 TIGER/Line'" in sql
    assert "calculated.overlap_area>0" in sql
    assert "LEAST(calculated.overlap_area/" in sql
    assert "ON CONFLICT" in sql
    assert "food_scores" not in sql
    assert "score_runs" not in sql
    assert all(";" not in statement.sql for statement in first.statements)
    assert not any("postgresql://" in repr(statement.parameters) for statement in first.statements)


@pytest.mark.parametrize(
    ("environment", "message"),
    [
        ({}, "MKE_PIPELINE_ENV"),
        ({"MKE_PIPELINE_ENV": "production"}, "MKE_PIPELINE_ENV"),
        ({"MKE_PIPELINE_ENV": "development"}, "DATABASE_URL_UNPOOLED"),
        (
            {"MKE_PIPELINE_ENV": "development", "DATABASE_URL_UNPOOLED": "https://bad"},
            "PostgreSQL URL",
        ),
    ],
)
def test_database_environment_fails_closed(
    environment: dict[str, str],
    message: str,
) -> None:
    with pytest.raises(NeighborhoodDatabaseError, match=message):
        require_development_environment(environment)


def test_database_environment_accepts_only_explicit_unpooled_development_url() -> None:
    assert (
        require_development_environment(
            {
                "MKE_PIPELINE_ENV": "development",
                "DATABASE_URL_UNPOOLED": "postgresql://example.invalid/neondb",
                "DATABASE_URL": "postgresql://must-not-be-used/other",
            }
        )
        == "postgresql://example.invalid/neondb"
    )


class QueryResult:
    def __init__(self, row: tuple[object, ...] | None = None) -> None:
        self.row = row

    def fetchone(self) -> tuple[object, ...] | None:
        return self.row


class FakeConnection:
    def __init__(self, reconciliation: tuple[object, ...]) -> None:
        self.reconciliation = reconciliation
        self.calls: list[tuple[str, tuple[object, ...] | None]] = []
        self.rolled_back = False

    def __enter__(self) -> FakeConnection:
        return self

    def __exit__(self, *args: object) -> None:
        self.rolled_back = bool(args[0])

    def execute(
        self,
        query: str,
        parameters: tuple[object, ...] | None = None,
    ) -> QueryResult:
        self.calls.append((query, parameters))
        if query.startswith("SELECT (SELECT count"):
            return QueryResult(self.reconciliation)
        if query.startswith("UPDATE source_snapshots"):
            snapshot_id = parameters[0] if parameters else None
            return QueryResult((str(snapshot_id),))
        return QueryResult()


def test_repository_marks_valid_only_after_every_reconciliation_check(tmp_path: Path) -> None:
    persistence_plan = plan(tmp_path)
    connection = FakeConnection((True, True, True, True, True))
    repository = PsycopgNeighborhoodRepository(
        "postgresql://user:secret@example.invalid/neondb",
        connect=lambda _url: connection,
    )

    repository.execute(persistence_plan)

    assert "secret" not in repr(repository)
    assert connection.calls[-1][0].startswith("UPDATE source_snapshots")
    assert connection.rolled_back is False


def test_repository_rolls_back_when_spatial_reconciliation_fails(tmp_path: Path) -> None:
    persistence_plan = plan(tmp_path)
    connection = FakeConnection((True, True, False, True, True))
    repository = PsycopgNeighborhoodRepository(
        "postgresql://example.invalid/neondb",
        connect=lambda _url: connection,
    )

    with pytest.raises(NeighborhoodDatabaseError, match="reconciliation failed"):
        repository.execute(persistence_plan)

    assert connection.rolled_back is True
    assert not any(query.startswith("UPDATE source_snapshots") for query, _ in connection.calls)
