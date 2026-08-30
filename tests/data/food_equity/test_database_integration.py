from __future__ import annotations

import os
from uuid import UUID

import psycopg
import pytest
from psycopg.types.json import Jsonb


pytestmark = pytest.mark.integration

PINNED_BASELINE_RUN_ID = "502e2a04-b013-53cd-8b09-c9144862701a"
PINNED_BASELINE_OUTPUT_HASH = "19069c257e8f51fb4370b1ec8d04c6f823bd85e133846cf504866404c2c4e946"
PROBE_RUN_ID = UUID("9b5cbb10-9f69-5bbd-99ee-d5a5395ec9dc")
CONTRACT_MIGRATION_TIMESTAMP = 1788051221521

ORPHAN_QUERIES = {
    "resource_source": (
        "SELECT count(*) FROM food_resources child LEFT JOIN data_sources parent "
        "ON parent.id=child.source_id WHERE parent.id IS NULL"
    ),
    "version_resource": (
        "SELECT count(*) FROM food_resource_versions child LEFT JOIN food_resources parent "
        "ON parent.id=child.resource_id WHERE parent.id IS NULL"
    ),
    "version_snapshot": (
        "SELECT count(*) FROM food_resource_versions child LEFT JOIN source_snapshots parent "
        "ON parent.id=child.snapshot_id WHERE parent.id IS NULL"
    ),
    "metric_geography": (
        "SELECT count(*) FROM food_access_metric_values child LEFT JOIN geographies parent "
        "ON parent.id=child.geography_id WHERE parent.id IS NULL"
    ),
    "metric_primary_snapshot": (
        "SELECT count(*) FROM food_access_metric_values child LEFT JOIN source_snapshots parent "
        "ON parent.id=child.primary_snapshot_id WHERE parent.id IS NULL"
    ),
    "metric_nearest_resource": (
        "SELECT count(*) FROM food_access_metric_values child "
        "LEFT JOIN food_resource_versions parent ON parent.id=child.nearest_resource_version_id "
        "WHERE child.nearest_resource_version_id IS NOT NULL AND parent.id IS NULL"
    ),
    "metric_link_value": (
        "SELECT count(*) FROM food_access_metric_snapshots child "
        "LEFT JOIN food_access_metric_values parent ON parent.id=child.access_metric_value_id "
        "WHERE parent.id IS NULL"
    ),
    "metric_link_snapshot": (
        "SELECT count(*) FROM food_access_metric_snapshots child "
        "LEFT JOIN source_snapshots parent ON parent.id=child.snapshot_id WHERE parent.id IS NULL"
    ),
    "run_baseline": (
        "SELECT count(*) FROM food_score_runs child LEFT JOIN score_runs parent "
        "ON parent.id=child.equity_baseline_run_id WHERE parent.id IS NULL"
    ),
    "component_run": (
        "SELECT count(*) FROM food_score_components child LEFT JOIN food_score_runs parent "
        "ON parent.id=child.food_score_run_id WHERE parent.id IS NULL"
    ),
    "component_geography": (
        "SELECT count(*) FROM food_score_components child LEFT JOIN geographies parent "
        "ON parent.id=child.geography_id WHERE parent.id IS NULL"
    ),
    "component_metric_geography": (
        "SELECT count(*) FROM food_score_components child "
        "LEFT JOIN food_access_metric_values parent "
        "ON parent.id=child.access_metric_value_id AND parent.geography_id=child.geography_id "
        "WHERE parent.id IS NULL"
    ),
    "score_run": (
        "SELECT count(*) FROM food_scores child LEFT JOIN food_score_runs parent "
        "ON parent.id=child.food_score_run_id WHERE parent.id IS NULL"
    ),
    "score_geography": (
        "SELECT count(*) FROM food_scores child LEFT JOIN geographies parent "
        "ON parent.id=child.geography_id WHERE parent.id IS NULL"
    ),
    "score_baseline_geography": (
        "SELECT count(*) FROM food_scores child LEFT JOIN scores parent "
        "ON parent.id=child.equity_baseline_score_id "
        "AND parent.geography_id=child.geography_id WHERE parent.id IS NULL"
    ),
}


def integration_url() -> str:
    url = os.getenv("DATABASE_URL_UNPOOLED")
    if not url:
        pytest.skip("DATABASE_URL_UNPOOLED is not configured")
    if os.getenv("MKE_PIPELINE_ENV") != "development":
        pytest.skip("integration writes require MKE_PIPELINE_ENV=development")
    return url


def test_plan3_tables_exist_and_food_runs_cannot_publish() -> None:
    with psycopg.connect(integration_url()) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname='public'"
            ).fetchall()
        }
        statuses = {
            row[0]
            for row in connection.execute(
                "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_type.oid=pg_enum.enumtypid "
                "WHERE pg_type.typname=%s",
                ("food_score_run_status",),
            ).fetchall()
        }

    assert {
        "food_resources",
        "food_resource_versions",
        "food_access_metric_values",
        "food_access_metric_snapshots",
        "food_score_runs",
        "food_score_components",
        "food_scores",
    } <= tables
    assert statuses == {"draft", "validated", "failed"}


def test_plan3_foreign_keys_uniques_and_missing_quality_checks_exist() -> None:
    with psycopg.connect(integration_url()) as connection:
        constraints = {
            row[0]: row[1]
            for row in connection.execute(
                "SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint "
                "WHERE connamespace='public'::regnamespace AND conrelid IN ("
                "'food_resources'::regclass,'food_resource_versions'::regclass,"
                "'food_access_metric_values'::regclass,'food_access_metric_snapshots'::regclass,"
                "'food_score_runs'::regclass,'food_score_components'::regclass,"
                "'food_scores'::regclass)"
            ).fetchall()
        }

    assert {
        "food_resources_source_id_data_sources_id_fk",
        "food_resource_versions_snapshot_id_source_snapshots_id_fk",
        "food_access_metric_values_geography_id_geographies_id_fk",
        "food_access_metric_snapshots_snapshot_id_source_snapshots_id_fk",
        "food_score_runs_equity_baseline_run_id_score_runs_id_fk",
        "food_score_components_metric_value_geography_fk",
        "food_scores_equity_baseline_score_geography_fk",
        "food_score_runs_run_fingerprint_unique",
        "food_resource_versions_identity_unique",
        "food_scores_run_geography_unique",
        "food_access_metric_values_value_state_check",
        "food_access_metric_values_quality_check",
        "food_resource_versions_verified_at_check",
        "food_scores_exclusion_reasons_check",
        "food_scores_output_quality_check",
    } <= set(constraints)
    assert "NULLS NOT DISTINCT" in constraints["food_resource_versions_identity_unique"]


def test_contract_migration_and_nullable_columns_are_applied() -> None:
    with psycopg.connect(integration_url()) as connection:
        latest_migration = connection.execute(
            "SELECT max(created_at) FROM drizzle.__drizzle_migrations"
        ).fetchone()
        columns = {
            (row[0], row[1]): (row[2], row[3])
            for row in connection.execute(
                "SELECT table_name,column_name,is_nullable,data_type "
                "FROM information_schema.columns WHERE table_schema='public' AND "
                "((table_name='food_resource_versions' AND column_name IN ('name','active')) "
                "OR (table_name='food_scores' AND column_name='exclusion_reasons'))"
            ).fetchall()
        }

    assert latest_migration is not None
    assert latest_migration[0] is not None
    assert int(latest_migration[0]) >= CONTRACT_MIGRATION_TIMESTAMP
    assert columns == {
        ("food_resource_versions", "active"): ("YES", "boolean"),
        ("food_resource_versions", "name"): ("YES", "text"),
        ("food_scores", "exclusion_reasons"): ("NO", "jsonb"),
    }


def test_food_rows_have_no_fk_orphans() -> None:
    with psycopg.connect(integration_url()) as connection:
        orphan_counts = {
            label: connection.execute(query).fetchone() for label, query in ORPHAN_QUERIES.items()
        }

    assert orphan_counts == {label: (0,) for label in ORPHAN_QUERIES}


def test_resource_geometry_and_nullable_quality_states_are_consistent() -> None:
    with psycopg.connect(integration_url()) as connection:
        invalid_geometry = connection.execute(
            "SELECT count(*) FROM food_resource_versions WHERE "
            "(geometry IS NOT NULL AND (ST_SRID(geometry)<>4326 OR ST_IsEmpty(geometry) "
            "OR GeometryType(geometry)<>'POINT')) OR "
            "(coordinate_status IN ('source_coordinate','authoritative_geocode',"
            "'manually_verified') AND geometry IS NULL) OR "
            "(coordinate_status IN ('invalid','missing') AND geometry IS NOT NULL)"
        ).fetchone()
        invalid_nullable_states = connection.execute(
            "SELECT count(*) FROM food_resource_versions WHERE "
            "name IS NOT NULL AND btrim(name)='' OR "
            "verification_status IN ('override_verified','verified_context') "
            "AND verified_at IS NULL"
        ).fetchone()
        invalid_exclusion_reasons = connection.execute(
            "SELECT count(*) FROM food_scores "
            "WHERE exclusion_reasons IS NULL OR jsonb_typeof(exclusion_reasons)<>'array'"
        ).fetchone()

    assert invalid_geometry == (0,)
    assert invalid_nullable_states == (0,)
    assert invalid_exclusion_reasons == (0,)


def test_food_run_rows_obey_pinned_lineage_lifecycle_and_idempotency_contract() -> None:
    with psycopg.connect(integration_url()) as connection:
        wrong_baseline = connection.execute(
            "SELECT count(*) FROM food_score_runs WHERE equity_baseline_run_id<>%s "
            "OR equity_baseline_output_hash<>%s",
            (PINNED_BASELINE_RUN_ID, PINNED_BASELINE_OUTPUT_HASH),
        ).fetchone()
        invalid_lifecycle = connection.execute(
            "SELECT count(*) FROM food_score_runs WHERE NOT ("
            "status='draft' AND completed_at IS NULL AND validation_result IS NULL "
            "AND failure_metadata IS NULL AND output_hash IS NULL OR "
            "status='validated' AND completed_at IS NOT NULL AND validation_result IS NOT NULL "
            "AND failure_metadata IS NULL AND output_hash~'^[0-9a-f]{64}$' OR "
            "status='failed' AND completed_at IS NOT NULL AND failure_metadata IS NOT NULL "
            "AND output_hash IS NULL)"
        ).fetchone()
        duplicate_fingerprints = connection.execute(
            "SELECT count(*) FROM (SELECT run_fingerprint FROM food_score_runs "
            "GROUP BY run_fingerprint HAVING count(*)>1) duplicates"
        ).fetchone()
        duplicate_run_geographies = connection.execute(
            "SELECT count(*) FROM (SELECT food_score_run_id,geography_id FROM food_scores "
            "GROUP BY food_score_run_id,geography_id HAVING count(*)>1) duplicates"
        ).fetchone()

    assert wrong_baseline == (0,)
    assert invalid_lifecycle == (0,)
    assert duplicate_fingerprints == (0,)
    assert duplicate_run_geographies == (0,)


def test_validated_food_runs_reconcile_to_the_write_plan_output_shape() -> None:
    with psycopg.connect(integration_url()) as connection:
        reconciliations = connection.execute(
            "SELECT runs.id,"
            "(SELECT count(*) FROM food_scores scores WHERE scores.food_score_run_id=runs.id),"
            "(SELECT count(*) FROM food_score_components components "
            "WHERE components.food_score_run_id=runs.id),"
            "(SELECT count(*) FROM food_scores scores WHERE scores.food_score_run_id=runs.id "
            "AND scores.quality_status='complete'),"
            "(SELECT count(*) FROM food_scores scores WHERE scores.food_score_run_id=runs.id "
            "AND scores.quality_status='ineligible_zero_population'),"
            "(SELECT count(*) FROM food_scores scores WHERE scores.food_score_run_id=runs.id "
            "AND scores.quality_status='insufficient_data') "
            "FROM food_score_runs runs WHERE runs.status='validated' ORDER BY runs.id"
        ).fetchall()

    for (
        _,
        score_count,
        component_count,
        complete_count,
        zero_count,
        insufficient_count,
    ) in reconciliations:
        assert (score_count, component_count) == (302, 1200)
        assert (complete_count, zero_count, insufficient_count) == (300, 2, 0)


def test_draft_validates_only_against_the_exact_pinned_baseline_and_remains_unpublished() -> None:
    with psycopg.connect(integration_url()) as connection:
        baseline = connection.execute(
            "SELECT id,output_hash,status FROM score_runs WHERE id=%s",
            (PINNED_BASELINE_RUN_ID,),
        ).fetchone()
        if baseline is None:
            pytest.skip("pinned validated Equity Baseline run is not loaded")
        assert baseline == (
            UUID(PINNED_BASELINE_RUN_ID),
            PINNED_BASELINE_OUTPUT_HASH,
            "validated",
        )

        with connection.transaction(force_rollback=True):
            connection.execute(
                "INSERT INTO food_score_runs "
                "(id,methodology_version,registry_hash,input_manifest_hash,run_fingerprint,"
                "scoring_implementation_version,equity_baseline_run_id,equity_baseline_output_hash,"
                "started_at,data_vintages,git_commit,status,created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,now(),%s,%s,'draft',now())",
                (
                    PROBE_RUN_ID,
                    "food-equity-v1",
                    "a" * 64,
                    "b" * 64,
                    "c" * 64,
                    "test",
                    PINNED_BASELINE_RUN_ID,
                    PINNED_BASELINE_OUTPUT_HASH,
                    Jsonb({"probe": "test"}),
                    "test",
                ),
            )
            connection.execute(
                "UPDATE food_score_runs SET status='validated',completed_at=now(),"
                "validation_result=%s,output_hash=%s WHERE id=%s",
                (Jsonb({"valid": True, "publishable": False}), "d" * 64, PROBE_RUN_ID),
            )
            assert connection.execute(
                "SELECT status,output_hash FROM food_score_runs WHERE id=%s", (PROBE_RUN_ID,)
            ).fetchone() == ("validated", "d" * 64)
            with pytest.raises(psycopg.Error):
                with connection.transaction():
                    connection.execute(
                        "UPDATE food_score_runs SET status='draft',completed_at=NULL,"
                        "validation_result=NULL,output_hash=NULL WHERE id=%s",
                        (PROBE_RUN_ID,),
                    )


def test_wrong_baseline_hash_rolls_back_without_partial_food_run() -> None:
    with psycopg.connect(integration_url()) as connection:
        if (
            connection.execute(
                "SELECT 1 FROM score_runs WHERE id=%s AND status='validated'",
                (PINNED_BASELINE_RUN_ID,),
            ).fetchone()
            is None
        ):
            pytest.skip("pinned validated Equity Baseline run is not loaded")

        with connection.transaction(force_rollback=True):
            with pytest.raises(psycopg.Error, match="matching output hash"):
                with connection.transaction():
                    connection.execute(
                        "INSERT INTO food_score_runs "
                        "(id,methodology_version,registry_hash,input_manifest_hash,run_fingerprint,"
                        "scoring_implementation_version,equity_baseline_run_id,"
                        "equity_baseline_output_hash,started_at,data_vintages,git_commit,status,created_at) "
                        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,now(),%s,%s,'draft',now())",
                        (
                            PROBE_RUN_ID,
                            "food-equity-v1",
                            "a" * 64,
                            "b" * 64,
                            "e" * 64,
                            "test",
                            PINNED_BASELINE_RUN_ID,
                            "0" * 64,
                            Jsonb({"probe": "test"}),
                            "test",
                        ),
                    )
            assert connection.execute(
                "SELECT count(*) FROM food_score_runs WHERE id=%s", (PROBE_RUN_ID,)
            ).fetchone() == (0,)


def test_transaction_context_rolls_back_source_write_on_failure() -> None:
    probe_id = UUID("00000000-0000-0000-0000-000000000031")
    with psycopg.connect(integration_url()) as connection:
        with pytest.raises(RuntimeError, match="rollback probe"):
            with connection.transaction():
                connection.execute(
                    "INSERT INTO data_sources "
                    "(id,name,publisher,source_url,dataset_version,geography,retrieved_at,license,"
                    "status,created_at) VALUES (%s,%s,%s,%s,%s,%s,now(),%s,%s,now())",
                    (
                        probe_id,
                        "food-equity-rollback-probe",
                        "test",
                        "https://example.test",
                        "test",
                        "Milwaukee County",
                        "test",
                        "active",
                    ),
                )
                raise RuntimeError("rollback probe")
        assert connection.execute(
            "SELECT count(*) FROM data_sources WHERE id=%s", (probe_id,)
        ).fetchone() == (0,)
