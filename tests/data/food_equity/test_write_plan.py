from __future__ import annotations

from dataclasses import replace
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from psycopg.types.json import Jsonb

from pipelines.food_equity.database import ParameterizedStatement
from pipelines.food_equity.registry import load_registry
from pipelines.food_equity.scoring import (
    PINNED_BASELINE_METHODOLOGY,
    PINNED_BASELINE_OUTPUT_HASH,
    PINNED_BASELINE_REGISTRY_HASH,
    PINNED_BASELINE_RUN_FINGERPRINT,
    PINNED_BASELINE_RUN_ID,
    BaselineRunInput,
    FoodScoringResult,
    FoodTractScore,
    ScoreInputProvenance,
)
from pipelines.food_equity.write_plan import (
    AccessMetricNaturalKey,
    AccessMetricPersistenceRow,
    MetricSnapshotLinkPersistenceRow,
    PersistenceInputs,
    ResourcePersistenceRow,
    ResourceVersionNaturalKey,
    ResourceVersionPersistenceRow,
    SnapshotNaturalKey,
    SnapshotPersistenceRow,
    SourcePersistenceRow,
    WritePlanError,
    _validate_approved_insufficient,
    build_load_statements,
    build_write_plan,
    canonical_sha256,
    manifest_hash,
)

NOW = datetime(2026, 8, 29, 12, tzinfo=UTC)
GEOID = "55079000101"
GEOGRAPHY_ID = "10000000-0000-0000-0000-000000000001"
BASELINE_SCORE_ID = "20000000-0000-0000-0000-000000000001"
SCORING_SLUG = "full_service_grocery_walk_access"
CONTEXT_SLUG = "full_service_grocery_count_10_min_context"


def manifests(*, emergency_checksum: str = "9" * 64) -> tuple[dict[str, object], ...]:
    scoring = (
        "sram",
        "snap_retailers",
        "acs_vehicle",
        "tract_origins",
        "mcts_gtfs",
        "walking_network",
    )
    rows: tuple[dict[str, object], ...] = tuple(
        {"source_key": key, "checksum_sha256": f"{index + 1:x}" * 64}
        for index, key in enumerate(scoring)
    )
    return (*rows, {"source_key": "emergency_food_context", "checksum_sha256": emergency_checksum})


def inputs() -> PersistenceInputs:
    snapshot_key = SnapshotNaturalKey("snap_retailers", "2025", "a" * 64)
    resource_key = "b" * 64
    version_key = ResourceVersionNaturalKey(
        resource_key,
        snapshot_key,
        date(2025, 1, 1),
        None,
    )
    scoring_key = AccessMetricNaturalKey(GEOID, SCORING_SLUG, "d" * 64)
    context_key = AccessMetricNaturalKey(GEOID, CONTEXT_SLUG, "e" * 64)
    source = SourcePersistenceRow(
        key="snap_retailers",
        name="SNAP Retailers",
        publisher="USDA",
        source_url="https://example.test/retail.zip",
        dataset_version="2025",
        geography="Milwaukee County",
        retrieved_at=NOW,
        license="public",
        status="active",
    )
    snapshot = SnapshotPersistenceRow(
        key=snapshot_key,
        retrieved_at=NOW,
        byte_size=100,
        storage_uri="data/raw/food-equity/a.zip",
        row_or_feature_count=1,
        schema_fingerprint="1" * 64,
        snapshot_fingerprint="2" * 64,
        request_metadata={"format": "zip"},
    )
    resource = ResourcePersistenceRow(
        source_key="snap_retailers",
        source_record_id="secret-looking-record-value",
        canonical_resource_key=resource_key,
    )
    version = ResourceVersionPersistenceRow(
        key=version_key,
        version_fingerprint="c" * 64,
        category="candidate_full_service",
        name=None,
        subtype=None,
        address=None,
        city=None,
        postal_code=None,
        website=None,
        phone=None,
        hours=None,
        longitude=None,
        latitude=None,
        coordinate_status="missing",
        verification_status="unverified",
        classification_evidence={"reason": "source name missing"},
        full_service_grocery=False,
        snap_authorized=True,
        active=None,
        verified_at=None,
    )
    scoring_metric = AccessMetricPersistenceRow(
        key=scoring_key,
        primary_snapshot=snapshot_key,
        nearest_resource_version=version_key,
        value=Decimal("12.5"),
        state="observed",
        unit="minutes",
        calculation_version="food-accessibility-v1",
        quality_status="verified",
        quality_metadata={"source": "network"},
        calculated_at=NOW,
    )
    context_metric = AccessMetricPersistenceRow(
        key=context_key,
        primary_snapshot=snapshot_key,
        nearest_resource_version=None,
        value=Decimal("1"),
        state="observed",
        unit="count",
        calculation_version="context-v1",
        quality_status="verified",
        quality_metadata={"context": True},
        calculated_at=NOW,
    )
    return PersistenceInputs(
        sources=(source,),
        snapshots=(snapshot,),
        resources=(resource,),
        resource_versions=(version,),
        access_metrics=(context_metric, scoring_metric),
        metric_snapshot_links=(
            MetricSnapshotLinkPersistenceRow(context_key, snapshot_key),
            MetricSnapshotLinkPersistenceRow(scoring_key, snapshot_key),
        ),
        geography_ids={GEOID: GEOGRAPHY_ID},
        manifests=manifests(),
        data_vintages={"snap_retailers": "2025"},
    )


def scoring() -> FoodScoringResult:
    baseline = BaselineRunInput(
        run_id=PINNED_BASELINE_RUN_ID,
        output_hash=PINNED_BASELINE_OUTPUT_HASH,
        methodology_version=PINNED_BASELINE_METHODOLOGY,
        registry_hash=PINNED_BASELINE_REGISTRY_HASH,
        run_fingerprint=PINNED_BASELINE_RUN_FINGERPRINT,
        status="validated",
        verified=True,
    )
    provenance = ScoreInputProvenance(
        source_snapshot_sha256s={
            key: f"{index + 1:x}" * 64
            for index, key in enumerate(
                (
                    "sram",
                    "snap_retailers",
                    "acs_vehicle",
                    "tract_origins",
                    "mcts_gtfs",
                    "walking_network",
                )
            )
        },
        full_service_classification_sha256="7" * 64,
        walking_graph_sha256="8" * 64,
        walking_graph_version="walking-network-v1",
        accessibility_calculation_version="food-accessibility-v1",
        gtfs_projected_stops_sha256="9" * 64,
        gtfs_stop_projection_version="gtfs-stops-epsg3071-v1",
        gtfs_analysis_dates=("2026-08-25", "2026-08-29"),
        gtfs_feed_validity_dates=("2026-08-01", "2026-12-31"),
        gtfs_window_start="06:00",
        gtfs_window_end="22:00",
    )
    return FoodScoringResult(
        components=(),
        scores=(
            FoodTractScore(
                geoid=GEOID,
                equity_baseline_score_id=BASELINE_SCORE_ID,
                status="insufficient_data",
                exclusion_reasons=("missing:households_no_vehicle",),
                domains={},
                raw_food_access_need=None,
                food_access_need_percentile=None,
                food_access_need_band=None,
                equity_baseline_band="High",
                priority=None,
            ),
        ),
        baseline_run=baseline,
        provenance=provenance,
        score_input_fingerprint="f" * 64,
        canonical_output=b"{}",
        canonical_output_hash="0" * 64,
    )


def test_load_sql_is_bound_deterministic_and_reselects_shared_natural_keys() -> None:
    first, access, link_count = build_load_statements(
        inputs=inputs(), registry=load_registry(), now=NOW
    )
    second, _, _ = build_load_statements(inputs=inputs(), registry=load_registry(), now=NOW)

    def normalized(statement: ParameterizedStatement) -> tuple[str, tuple[object, ...]]:
        sql = statement.sql
        parameters = tuple(
            value.obj if isinstance(value, Jsonb) else value for value in statement.parameters
        )
        return sql, parameters

    assert [normalized(item) for item in first] == [normalized(item) for item in second]
    assert len(first) == 8
    assert len(access) == 1
    assert link_count == 1
    assert all(item.sql.count("%s") == len(item.parameters) for item in first)
    assert all("secret-looking-record-value" not in item.sql for item in first)

    (
        source,
        snapshot,
        resource,
        version,
        context_metric,
        scoring_metric,
        context_link,
        scoring_link,
    ) = first
    proposed_ids = {
        source.parameters[0],
        snapshot.parameters[0],
        resource.parameters[0],
        version.parameters[0],
        context_metric.parameters[0],
        scoring_metric.parameters[0],
    }
    assert "ON CONFLICT (publisher,name,dataset_version) DO NOTHING" in source.sql
    assert "SELECT %s,ds.id" in snapshot.sql
    assert "SELECT %s,ds.id" in resource.sql
    assert "SELECT %s,r.id,ss.id" in version.sql
    assert "SELECT rv.id" in scoring_metric.sql
    assert "SELECT amv.id,ss.id" in context_link.sql
    assert "SELECT amv.id,ss.id" in scoring_link.sql
    for index, statement in enumerate(first[1:], start=1):
        assert not proposed_ids.intersection(statement.parameters[1:]), index


def test_context_is_persisted_but_excluded_from_manifest_and_scoring_access() -> None:
    assert manifest_hash(manifests(emergency_checksum="8" * 64)) == manifest_hash(
        manifests(emergency_checksum="9" * 64)
    )
    statements, access, link_count = build_load_statements(
        inputs=inputs(), registry=load_registry(), now=NOW
    )
    all_parameters = tuple(value for statement in statements for value in statement.parameters)
    assert CONTEXT_SLUG in all_parameters
    assert all(key.metric_slug == SCORING_SLUG for key in access)
    assert link_count == 1


def test_access_grid_rejects_two_fingerprints_for_one_geography_metric() -> None:
    source_inputs = inputs()
    scoring_metric = next(
        row for row in source_inputs.access_metrics if row.key.metric_slug == SCORING_SLUG
    )
    duplicate = replace(
        scoring_metric,
        key=replace(scoring_metric.key, calculation_fingerprint="4" * 64),
    )

    with pytest.raises(WritePlanError, match="one geography"):
        build_load_statements(
            inputs=replace(
                source_inputs,
                access_metrics=(*source_inputs.access_metrics, duplicate),
            ),
            registry=load_registry(),
            now=NOW,
        )


def test_nullable_resource_facts_and_verification_date_are_preserved() -> None:
    statements, _, _ = build_load_statements(inputs=inputs(), registry=load_registry(), now=NOW)
    version = next(item for item in statements if "food_resource_versions" in item.sql)

    assert "CASE WHEN %s::double precision IS NULL" in version.sql
    assert version.parameters[3] is None  # name
    assert version.parameters[19] is None  # active is unknown, not false
    assert version.parameters[22] is None  # verification date was not invented

    source_inputs = inputs()
    invalid = ResourceVersionPersistenceRow(
        **{
            field: getattr(source_inputs.resource_versions[0], field)
            for field in ResourceVersionPersistenceRow.__dataclass_fields__
            if field not in {"verification_status", "verified_at"}
        },
        verification_status="override_verified",
        verified_at=None,
    )
    changed = PersistenceInputs(
        **{
            field: getattr(source_inputs, field)
            for field in PersistenceInputs.__dataclass_fields__
            if field != "resource_versions"
        },
        resource_versions=(invalid,),
    )
    with pytest.raises(WritePlanError, match="verification date"):
        build_load_statements(inputs=changed, registry=load_registry(), now=NOW)


def test_historical_versions_keep_distinct_validity_interval_identity() -> None:
    source_inputs = inputs()
    original = source_inputs.resource_versions[0]
    historical = replace(
        original,
        key=replace(
            original.key,
            valid_from=date(2024, 1, 1),
            valid_to=date(2024, 12, 31),
        ),
        version_fingerprint="3" * 64,
        active=False,
    )
    changed = replace(
        source_inputs,
        resource_versions=(original, historical),
        access_metrics=tuple(
            replace(row, nearest_resource_version=None)
            if row.key.metric_slug == SCORING_SLUG
            else row
            for row in source_inputs.access_metrics
        ),
    )

    statements, _, _ = build_load_statements(inputs=changed, registry=load_registry(), now=NOW)
    versions = [item for item in statements if "INSERT INTO food_resource_versions" in item.sql]

    assert len(versions) == 2
    assert {item.parameters[20:22] for item in versions} == {
        (date(2024, 1, 1), date(2024, 12, 31)),
        (date(2025, 1, 1), None),
    }
    assert all("ON CONFLICT DO NOTHING" in item.sql for item in versions)


def test_nearest_resource_reselection_requires_the_expected_version_fingerprint() -> None:
    statements, _, _ = build_load_statements(inputs=inputs(), registry=load_registry(), now=NOW)
    metric = next(
        item
        for item in statements
        if "food_access_metric_values" in item.sql and SCORING_SLUG in item.parameters
    )

    assert "rv.version_fingerprint=%s" in metric.sql
    assert "c" * 64 in metric.parameters


def test_live_insufficient_reconciliation_requires_the_exact_unsnapped_cause() -> None:
    approved_geoid = "55079187200"
    source_inputs = inputs()
    template = next(
        row for row in source_inputs.access_metrics if row.key.metric_slug == SCORING_SLUG
    )

    def missing_metric(slug: str, fingerprint: str) -> AccessMetricPersistenceRow:
        return replace(
            template,
            key=AccessMetricNaturalKey(approved_geoid, slug, fingerprint),
            nearest_resource_version=None,
            value=None,
            state="missing",
            quality_status="missing",
            quality_metadata={"quality_reason": "origin_unsnapped"},
        )

    grocery = missing_metric("full_service_grocery_walk_access", "4" * 64)
    transit = missing_metric("scheduled_transit_service_intensity", "5" * 64)
    access = {grocery.key: grocery, transit.key: transit}
    approved_score = replace(
        scoring().scores[0],
        geoid=approved_geoid,
        exclusion_reasons=(
            "missing_metric:full_service_grocery_walk_access",
            "missing_metric:scheduled_transit_service_intensity",
        ),
    )
    approved = replace(scoring(), scores=(approved_score,))

    _validate_approved_insufficient(approved, access)

    wrong_geoid = replace(
        approved,
        scores=(replace(approved_score, geoid="55079000101"),),
    )
    with pytest.raises(WritePlanError, match="approved unsnapped tract"):
        _validate_approved_insufficient(wrong_geoid, access)

    wrong_reasons = replace(
        approved,
        scores=(replace(approved_score, exclusion_reasons=("missing_metric:other",)),),
    )
    with pytest.raises(WritePlanError, match="approved unsnapped tract"):
        _validate_approved_insufficient(wrong_reasons, access)

    wrong_cause = replace(
        grocery,
        quality_metadata={"quality_reason": "resource_unsnapped"},
    )
    with pytest.raises(WritePlanError, match="unsnapped-origin cause"):
        _validate_approved_insufficient(
            approved,
            {wrong_cause.key: wrong_cause, transit.key: transit},
        )


def test_score_statement_maps_enum_band_and_persists_exclusion_reasons(tmp_path: Path) -> None:
    candidate, plan = build_write_plan(
        root=tmp_path,
        environment={"MKE_PIPELINE_GIT_COMMIT": "a" * 40},
        clock=lambda: NOW,
        registry=load_registry(),
        scoring=scoring(),
        inputs=inputs(),
        require_production_counts=False,
    )

    statement = next(item for item in plan.analytical_statements if "food_scores" in item.sql)
    assert "exclusion_reasons" in statement.sql
    assert statement.parameters[9] == "high"
    assert isinstance(statement.parameters[12], Jsonb)
    assert statement.parameters[12].obj == ["missing:households_no_vehicle"]
    assert plan.input_manifest_hash == manifest_hash(manifests())
    assert len(plan.reconciliation_statements) == 7
    assert all(
        statement.sql.count("%s") == len(statement.parameters)
        for statement in plan.reconciliation_statements
    )
    assert candidate.run_fingerprint == canonical_sha256(
        {
            "methodology_version": load_registry().methodology_version,
            "scoring_registry_hash": load_registry().scoring_sha256,
            "input_manifest_hash": plan.input_manifest_hash,
            "score_input_fingerprint": "f" * 64,
            "scoring_implementation_version": plan.scoring_implementation_version,
            "git_commit": "a" * 40,
            "equity_baseline_run_id": PINNED_BASELINE_RUN_ID,
            "equity_baseline_output_hash": PINNED_BASELINE_OUTPUT_HASH,
        }
    )
