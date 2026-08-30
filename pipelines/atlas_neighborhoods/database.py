"""Deterministic, fail-closed persistence for neighborhood context."""

from __future__ import annotations

import hashlib
import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol, cast
from uuid import UUID, uuid5

import psycopg
from psycopg.types.json import Jsonb

from .source import SOURCE_KEY, SOURCE_URL, StoredNeighborhoodSnapshot

NAMESPACE = UUID("31fd0d04-4d69-4bc7-9e46-9a4eaa2dcf4c")
AREA_TOLERANCE_SQ_M = 0.01
RATIO_TOLERANCE = 0.000000001
METHODOLOGY_URL = "https://city.milwaukee.gov/mapmilwaukee/DownloadMapData3497"


class NeighborhoodDatabaseError(ValueError):
    """Raised when persistence configuration or reconciliation fails."""


@dataclass(frozen=True, slots=True)
class ParameterizedStatement:
    """One SQL command with values bound separately."""

    sql: str
    parameters: tuple[object, ...]

    def __post_init__(self) -> None:
        if not self.sql.strip() or ";" in self.sql:
            raise NeighborhoodDatabaseError("statement must contain one non-empty command")


@dataclass(frozen=True, slots=True)
class NeighborhoodPersistencePlan:
    """Immutable inserts plus PostGIS materialization statements."""

    source_id: UUID
    snapshot_id: UUID
    snapshot_fingerprint: str
    expected_feature_count: int
    statements: tuple[ParameterizedStatement, ...]


def deterministic_ids(snapshot: StoredNeighborhoodSnapshot) -> tuple[UUID, UUID, str]:
    """Derive stable source and snapshot identities from immutable provenance."""

    manifest = snapshot.snapshot.manifest
    source_id = uuid5(NAMESPACE, SOURCE_KEY)
    identity = "|".join(
        (
            str(source_id),
            manifest.dataset_version,
            manifest.checksum_sha256,
            manifest.schema_fingerprint,
        )
    )
    fingerprint = hashlib.sha256(identity.encode()).hexdigest()
    return source_id, uuid5(NAMESPACE, fingerprint), fingerprint


def _source_statement(
    snapshot: StoredNeighborhoodSnapshot,
    source_id: UUID,
    now: datetime,
) -> ParameterizedStatement:
    manifest = snapshot.snapshot.manifest
    return ParameterizedStatement(
        "INSERT INTO data_sources "
        "(id,name,publisher,source_url,dataset_version,geography,retrieved_at,"
        "update_frequency,license,methodology_url,status,notes,created_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'stale',%s,%s) "
        "ON CONFLICT (publisher,name,dataset_version) DO NOTHING",
        (
            source_id,
            "Milwaukee Neighborhood Identification Project",
            "City of Milwaukee Department of City Development",
            SOURCE_URL,
            manifest.dataset_version,
            "City of Milwaukee neighborhoods",
            manifest.retrieved_at,
            "Not updated on an ongoing basis",
            manifest.license,
            METHODOLOGY_URL,
            (
                "City-published reference; not an official City or neighborhood-association "
                "boundary; City of Milwaukee coverage only"
            ),
            now,
        ),
    )


def build_persistence_plan(
    snapshot: StoredNeighborhoodSnapshot,
    *,
    clock: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> NeighborhoodPersistencePlan:
    """Build idempotent source inserts and server-owned spatial calculations."""

    if len(snapshot.records) != snapshot.snapshot.manifest.row_or_feature_count:
        raise NeighborhoodDatabaseError("normalized feature count does not match manifest")
    source_id, snapshot_id, fingerprint = deterministic_ids(snapshot)
    manifest = snapshot.snapshot.manifest
    now = clock()
    if now.tzinfo is None or now.utcoffset() is None:
        raise NeighborhoodDatabaseError("persistence clock must be timezone-aware")

    statements = [_source_statement(snapshot, source_id, now)]
    statements.append(
        ParameterizedStatement(
            "INSERT INTO source_snapshots "
            "(id,source_id,dataset_version,retrieved_at,checksum_sha256,byte_size,storage_uri,"
            "row_or_feature_count,schema_fingerprint,snapshot_fingerprint,request_metadata,"
            "validation_status,created_at) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending',%s) "
            "ON CONFLICT (source_id,dataset_version,checksum_sha256) DO NOTHING",
            (
                snapshot_id,
                source_id,
                manifest.dataset_version,
                manifest.retrieved_at,
                manifest.checksum_sha256,
                manifest.byte_size,
                manifest.storage_uri,
                manifest.row_or_feature_count,
                manifest.schema_fingerprint,
                fingerprint,
                Jsonb(manifest.request_metadata),
                now,
            ),
        )
    )
    for record in snapshot.records:
        neighborhood_id = uuid5(NAMESPACE, f"{source_id}:{record.nbhd_id}")
        version_id = uuid5(NAMESPACE, f"{snapshot_id}:{record.nbhd_id}")
        statements.extend(
            (
                ParameterizedStatement(
                    "INSERT INTO neighborhoods "
                    "(id,source_id,source_neighborhood_id,created_at) VALUES (%s,%s,%s,%s) "
                    "ON CONFLICT (source_id,source_neighborhood_id) DO NOTHING",
                    (neighborhood_id, source_id, record.nbhd_id, now),
                ),
                ParameterizedStatement(
                    "INSERT INTO neighborhood_versions "
                    "(id,neighborhood_id,snapshot_id,source_object_id,name,geometry,created_at) "
                    "VALUES (%s,%s,%s,%s,%s,ST_GeomFromWKB(%s,4326),%s) "
                    "ON CONFLICT (neighborhood_id,snapshot_id) DO NOTHING",
                    (
                        version_id,
                        neighborhood_id,
                        snapshot_id,
                        record.object_id,
                        record.neighborhood,
                        bytes.fromhex(record.geometry_wkb_hex),
                        now,
                    ),
                ),
            )
        )

    statements.append(
        ParameterizedStatement(
            "WITH city AS (SELECT ST_UnaryUnion(ST_Collect(ST_Transform(geometry,3071))) "
            "AS geometry FROM neighborhood_versions WHERE snapshot_id=%s), calculated AS ("
            "SELECT g.id AS geography_id,ST_Area(ST_Transform(g.geometry,3071)) AS tract_area,"
            "ST_Area(ST_Intersection(ST_Transform(g.geometry,3071),city.geometry)) AS covered_area "
            "FROM geographies g CROSS JOIN city WHERE g.geography_type='tract' "
            "AND g.vintage='2020 TIGER/Line' AND g.state_fips='55' AND g.county_fips='079') "
            "INSERT INTO tract_neighborhood_contexts "
            "(id,geography_id,snapshot_id,tract_area_sq_m,covered_area_sq_m,"
            "city_reference_coverage,created_at) SELECT md5('context:'||geography_id::text||%s)::uuid,"
            "geography_id,%s,tract_area,LEAST(covered_area,tract_area),"
            "LEAST(covered_area,tract_area)/NULLIF(tract_area,0),%s FROM calculated "
            "ON CONFLICT (geography_id,snapshot_id) DO NOTHING",
            (snapshot_id, str(snapshot_id), snapshot_id, now),
        )
    )
    statements.append(
        ParameterizedStatement(
            "WITH city AS (SELECT ST_UnaryUnion(ST_Collect(ST_Transform(geometry,3071))) "
            "AS geometry FROM neighborhood_versions WHERE snapshot_id=%s), calculated AS ("
            "SELECT g.id AS geography_id,nv.id AS version_id,"
            "ST_Area(ST_Intersection(ST_Transform(g.geometry,3071),"
            "ST_Transform(nv.geometry,3071))) AS overlap_area,"
            "ST_Area(ST_Intersection(ST_Transform(g.geometry,3071),city.geometry)) "
            "AS covered_area FROM geographies g CROSS JOIN city "
            "JOIN neighborhood_versions nv ON nv.snapshot_id=%s WHERE g.geography_type='tract' "
            "AND g.vintage='2020 TIGER/Line' AND g.state_fips='55' AND g.county_fips='079') "
            "INSERT INTO tract_neighborhood_overlaps "
            "(id,geography_id,snapshot_id,neighborhood_version_id,overlap_area_sq_m,"
            "covered_area_share,created_at) SELECT md5('overlap:'||calculated.geography_id::text||"
            "calculated.version_id::text||%s)::uuid,calculated.geography_id,%s,"
            "calculated.version_id,calculated.overlap_area,LEAST(calculated.overlap_area/"
            "NULLIF(calculated.covered_area,0),1),%s FROM calculated "
            "JOIN tract_neighborhood_contexts context ON context.geography_id=calculated.geography_id "
            "AND context.snapshot_id=%s WHERE calculated.overlap_area>0 "
            "ON CONFLICT (geography_id,snapshot_id,neighborhood_version_id) DO NOTHING",
            (snapshot_id, snapshot_id, str(snapshot_id), snapshot_id, now, snapshot_id),
        )
    )
    return NeighborhoodPersistencePlan(
        source_id,
        snapshot_id,
        fingerprint,
        len(snapshot.records),
        tuple(statements),
    )


RECONCILE_SQL = (
    "SELECT (SELECT count(*)=%s FROM neighborhood_versions WHERE snapshot_id=%s),"
    "(SELECT count(*)=(SELECT count(*) FROM geographies WHERE geography_type='tract' "
    "AND vintage='2020 TIGER/Line' AND state_fips='55' AND county_fips='079') FROM "
    "tract_neighborhood_contexts WHERE snapshot_id=%s),NOT EXISTS (SELECT 1 FROM "
    "neighborhood_versions a JOIN neighborhood_versions b ON a.snapshot_id=%s "
    "AND b.snapshot_id=%s AND a.id<b.id WHERE ST_Area(ST_Intersection("
    "ST_Transform(a.geometry,3071),ST_Transform(b.geometry,3071)))>%s),NOT EXISTS ("
    "SELECT 1 FROM tract_neighborhood_contexts c LEFT JOIN tract_neighborhood_overlaps o "
    "ON o.geography_id=c.geography_id AND o.snapshot_id=c.snapshot_id WHERE c.snapshot_id=%s "
    "GROUP BY c.geography_id,c.tract_area_sq_m,c.covered_area_sq_m,c.city_reference_coverage "
    "HAVING abs(c.city_reference_coverage-(c.covered_area_sq_m/c.tract_area_sq_m))>%s OR "
    "(c.covered_area_sq_m=0 AND count(o.id)>0) OR (c.covered_area_sq_m>0 AND "
    "abs(coalesce(sum(o.overlap_area_sq_m),0)-c.covered_area_sq_m)>%s) OR "
    "(c.covered_area_sq_m>0 AND abs(coalesce(sum(o.covered_area_share),0)-1)>%s)),"
    "EXISTS (SELECT 1 FROM source_snapshots WHERE id=%s AND source_id=%s "
    "AND validation_status IN ('pending','valid'))"
)
MARK_VALID_SQL = (
    "UPDATE source_snapshots SET validation_status='valid' WHERE id=%s "
    "AND validation_status IN ('pending','valid') RETURNING id::text"
)


class ResultLike(Protocol):
    def fetchone(self) -> tuple[object, ...] | None: ...


class ConnectionLike(Protocol):
    def __enter__(self) -> ConnectionLike: ...

    def __exit__(self, *args: object) -> object: ...

    def execute(
        self,
        query: str,
        parameters: tuple[object, ...] | None = None,
    ) -> ResultLike: ...


Connect = Callable[[str], ConnectionLike]


def _connect(database_url: str) -> ConnectionLike:
    return cast(ConnectionLike, psycopg.connect(database_url))


class PsycopgNeighborhoodRepository:
    """Execute and reconcile one snapshot in one rollback-safe transaction."""

    def __init__(self, database_url: str, *, connect: Connect = _connect) -> None:
        if not database_url.strip():
            raise NeighborhoodDatabaseError("database URL is required")
        self._database_url = database_url
        self._connect = connect

    def __repr__(self) -> str:
        return "PsycopgNeighborhoodRepository(database_url=[REDACTED])"

    def execute(self, plan: NeighborhoodPersistencePlan) -> None:
        parameters = (
            plan.expected_feature_count,
            plan.snapshot_id,
            plan.snapshot_id,
            plan.snapshot_id,
            plan.snapshot_id,
            AREA_TOLERANCE_SQ_M,
            plan.snapshot_id,
            RATIO_TOLERANCE,
            AREA_TOLERANCE_SQ_M,
            RATIO_TOLERANCE,
            plan.snapshot_id,
            plan.source_id,
        )
        with self._connect(self._database_url) as connection:
            for statement in plan.statements:
                connection.execute(statement.sql, statement.parameters)
            reconciled = connection.execute(RECONCILE_SQL, parameters).fetchone()
            if reconciled != (True, True, True, True, True):
                labels = ("versions", "tracts", "disjoint", "areas", "snapshot")
                failed = ",".join(
                    label
                    for label, passed in zip(labels, reconciled or (), strict=False)
                    if passed is not True
                ) or "unknown"
                raise NeighborhoodDatabaseError(
                    f"neighborhood persistence reconciliation failed: {failed}"
                )
            marked = connection.execute(MARK_VALID_SQL, (plan.snapshot_id,)).fetchone()
            if marked != (str(plan.snapshot_id),):
                raise NeighborhoodDatabaseError("neighborhood snapshot could not be validated")


def require_development_environment(
    environment: Mapping[str, str] | None = None,
) -> str:
    """Allow writes only to an explicitly configured development target."""

    values: Mapping[str, str] = environment if environment is not None else os.environ
    if values.get("MKE_PIPELINE_ENV") != "development":
        raise NeighborhoodDatabaseError("database writes require MKE_PIPELINE_ENV=development")
    database_url = values.get("DATABASE_URL_UNPOOLED", "").strip()
    if not database_url:
        raise NeighborhoodDatabaseError("database writes require DATABASE_URL_UNPOOLED")
    if not database_url.startswith(("postgres://", "postgresql://")):
        raise NeighborhoodDatabaseError("DATABASE_URL_UNPOOLED must be a PostgreSQL URL")
    return database_url


__all__ = [
    "MARK_VALID_SQL",
    "RECONCILE_SQL",
    "NeighborhoodDatabaseError",
    "NeighborhoodPersistencePlan",
    "ParameterizedStatement",
    "PsycopgNeighborhoodRepository",
    "build_persistence_plan",
    "deterministic_ids",
    "require_development_environment",
]
