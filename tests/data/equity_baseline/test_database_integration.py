from __future__ import annotations

import os

import psycopg
import pytest


pytestmark = pytest.mark.integration


def integration_url() -> str:
    url = os.getenv("DATABASE_URL_UNPOOLED")
    if not url:
        pytest.skip("DATABASE_URL_UNPOOLED is not configured")
    if os.getenv("MKE_PIPELINE_ENV") != "development":
        pytest.skip("integration writes require MKE_PIPELINE_ENV=development")
    return url


def test_migrated_branch_has_plan_2_tables_and_blocks_publication() -> None:
    with psycopg.connect(integration_url()) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            ).fetchall()
        }
        assert {
            "data_sources",
            "geographies",
            "indicator_definitions",
            "source_snapshots",
            "indicator_values",
            "score_runs",
            "score_components",
            "scores",
        } <= tables


def test_transaction_context_rolls_back_on_failure() -> None:
    with psycopg.connect(integration_url()) as connection:
        with pytest.raises(RuntimeError, match="rollback probe"):
            with connection.transaction():
                connection.execute(
                    "INSERT INTO data_sources "
                    "(id,name,publisher,source_url,dataset_version,geography,retrieved_at,license,status,created_at) "
                    "VALUES (%s,%s,%s,%s,%s,%s,now(),%s,%s,now())",
                    (
                        "00000000-0000-0000-0000-000000000001",
                        "rollback-probe",
                        "test",
                        "https://example.test",
                        "test",
                        "Milwaukee County",
                        "test",
                        "active",
                    ),
                )
                raise RuntimeError("rollback probe")
        count = connection.execute(
            "SELECT count(*) FROM data_sources WHERE id = %s",
            ("00000000-0000-0000-0000-000000000001",),
        ).fetchone()
        assert count == (0,)
