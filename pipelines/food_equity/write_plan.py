"""Typed, deterministic persistence planning for Food Equity v1."""

from __future__ import annotations

import hashlib
import re
import subprocess
import uuid
from collections import Counter
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from psycopg.types.json import Jsonb

from pipelines.common.artifacts import canonical_json_bytes
from pipelines.common.runner import RunCandidate
from pipelines.food_equity.database import ParameterizedStatement, ValidatedWritePlan
from pipelines.food_equity.errors import FoodEquityError
from pipelines.food_equity.models import BandLabel, Domain, MethodologyRegistry, MetricTreatment
from pipelines.food_equity.scoring import (
    PINNED_BASELINE_OUTPUT_HASH,
    PINNED_BASELINE_RUN_ID,
    FoodScoringResult,
)

SCORING_IMPLEMENTATION_VERSION = "food-equity-python-v1"
UUID_NAMESPACE = uuid.UUID("e56eb019-67cb-4b46-9fac-1de56cbe7729")
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
GEOID_PATTERN = re.compile(r"[0-9]{11}")
SCORING_SOURCE_KEYS = frozenset(
    {"sram", "snap_retailers", "acs_vehicle", "tract_origins", "mcts_gtfs", "walking_network"}
)
NON_MANIFEST_SOURCE_KEYS = frozenset({"equity_baseline", "emergency_food_context"})
SCORING_METRIC_SLUGS = frozenset(
    {
        "sram_snap_low_access_share_1mi",
        "full_service_grocery_walk_access",
        "households_no_vehicle",
        "scheduled_transit_service_intensity",
    }
)
EXPECTED_SCORE_COUNT = 302
EXPECTED_COMPLETE_COUNT = 299
EXPECTED_INSUFFICIENT_COUNT = 1
EXPECTED_ZERO_POPULATION_COUNT = 2
EXPECTED_INSUFFICIENT_GEOID = "55079187200"
EXPECTED_INSUFFICIENT_REASONS = (
    "missing_metric:full_service_grocery_walk_access",
    "missing_metric:scheduled_transit_service_intensity",
)
EXPECTED_ACCESS_METRIC_COUNT = 1208
EXPECTED_METRIC_SNAPSHOT_LINK_COUNT = 2416
EXPECTED_COMPONENT_COUNT = 1196
EXPECTED_CONTEXT_METRIC_COUNT = 1812
EXPECTED_TOTAL_ACCESS_METRIC_COUNT = 3020
EXPECTED_TOTAL_METRIC_SNAPSHOT_LINK_COUNT = 7852
REQUIRED_SNAPSHOT_SOURCES = {
    "sram_snap_low_access_share_1mi": frozenset({"sram"}),
    "full_service_grocery_walk_access": frozenset(
        {"snap_retailers", "tract_origins", "walking_network"}
    ),
    "households_no_vehicle": frozenset({"acs_vehicle"}),
    "scheduled_transit_service_intensity": frozenset(
        {"mcts_gtfs", "tract_origins", "walking_network"}
    ),
    "full_service_grocery_count_10_min_context": frozenset(
        {"snap_retailers", "tract_origins", "walking_network"}
    ),
    "full_service_grocery_count_15_min_context": frozenset(
        {"snap_retailers", "tract_origins", "walking_network"}
    ),
    "full_service_grocery_count_20_min_context": frozenset(
        {"snap_retailers", "tract_origins", "walking_network"}
    ),
    "emergency_food_count_10_min_context": frozenset(
        {"emergency_food_context", "tract_origins", "walking_network"}
    ),
    "emergency_food_count_15_min_context": frozenset(
        {"emergency_food_context", "tract_origins", "walking_network"}
    ),
    "emergency_food_count_20_min_context": frozenset(
        {"emergency_food_context", "tract_origins", "walking_network"}
    ),
}


class WritePlanError(FoodEquityError, ValueError):
    """Raised before SQL when persistence inputs violate the approved contract."""


@dataclass(frozen=True, slots=True)
class SourcePersistenceRow:
    """One shared data source identified by its database natural key."""

    key: str
    name: str
    publisher: str
    source_url: str
    dataset_version: str
    geography: str
    retrieved_at: datetime
    license: str
    status: str
    valid_from: date | None = None
    valid_to: date | None = None
    update_frequency: str | None = None
    methodology_url: str | None = None
    notes: str | None = None


@dataclass(frozen=True, slots=True)
class SnapshotNaturalKey:
    """Conflict-safe source-snapshot identity."""

    source_key: str
    dataset_version: str
    checksum_sha256: str


@dataclass(frozen=True, slots=True)
class SnapshotPersistenceRow:
    """One immutable source snapshot plus its shared-table natural identity."""

    key: SnapshotNaturalKey
    retrieved_at: datetime
    byte_size: int
    storage_uri: str
    row_or_feature_count: int
    schema_fingerprint: str
    snapshot_fingerprint: str
    request_metadata: Mapping[str, object]
    validation_status: str = "valid"


@dataclass(frozen=True, slots=True)
class ResourcePersistenceRow:
    """Stable food-resource identity independent of one historical version."""

    source_key: str
    source_record_id: str
    canonical_resource_key: str


@dataclass(frozen=True, slots=True)
class ResourceVersionNaturalKey:
    """Conflict-safe identity of a resource at one source snapshot."""

    canonical_resource_key: str
    snapshot: SnapshotNaturalKey
    valid_from: date | datetime | None
    valid_to: date | datetime | None


@dataclass(frozen=True, slots=True)
class ResourceVersionPersistenceRow:
    """Lossless historical resource state; nullable source facts stay nullable."""

    key: ResourceVersionNaturalKey
    version_fingerprint: str
    category: str
    name: str | None
    subtype: str | None
    address: str | None
    city: str | None
    postal_code: str | None
    website: str | None
    phone: str | None
    hours: Mapping[str, object] | None
    longitude: Decimal | None
    latitude: Decimal | None
    coordinate_status: str
    verification_status: str
    classification_evidence: Mapping[str, object]
    full_service_grocery: bool
    snap_authorized: bool | None
    active: bool | None
    verified_at: date | datetime | None


@dataclass(frozen=True, slots=True)
class AccessMetricNaturalKey:
    """Database natural key for an immutable tract metric calculation."""

    geoid: str
    metric_slug: str
    calculation_fingerprint: str


@dataclass(frozen=True, slots=True)
class AccessMetricPersistenceRow:
    """One normalized scoring or contextual tract access observation."""

    key: AccessMetricNaturalKey
    primary_snapshot: SnapshotNaturalKey
    nearest_resource_version: ResourceVersionNaturalKey | None
    value: Decimal | None
    state: str
    unit: str
    calculation_version: str
    quality_status: str
    quality_metadata: Mapping[str, object]
    calculated_at: datetime


@dataclass(frozen=True, slots=True)
class MetricSnapshotLinkPersistenceRow:
    """Many-to-many lineage from one metric calculation to one source snapshot."""

    metric: AccessMetricNaturalKey
    snapshot: SnapshotNaturalKey


@dataclass(frozen=True, slots=True)
class PersistenceInputs:
    """Explicit normalized records required to build the rollback-safe write plan."""

    sources: tuple[SourcePersistenceRow, ...]
    snapshots: tuple[SnapshotPersistenceRow, ...]
    resources: tuple[ResourcePersistenceRow, ...]
    resource_versions: tuple[ResourceVersionPersistenceRow, ...]
    access_metrics: tuple[AccessMetricPersistenceRow, ...]
    metric_snapshot_links: tuple[MetricSnapshotLinkPersistenceRow, ...]
    geography_ids: Mapping[str, str]
    manifests: tuple[Mapping[str, object], ...]
    data_vintages: Mapping[str, str]


def deterministic_uuid(*parts: str) -> str:
    """Return a Plan-3-owned stable UUID for exact identity parts."""

    if not parts or any(not isinstance(part, str) or not part for part in parts):
        raise WritePlanError("deterministic UUID parts must be non-empty strings")
    return str(uuid.uuid5(UUID_NAMESPACE, "\x1f".join(parts)))


def canonical_sha256(value: object) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def _require_hash(value: str, label: str) -> None:
    if SHA256_PATTERN.fullmatch(value) is None:
        raise WritePlanError(f"{label} must be a lowercase SHA-256")


def manifest_hash(manifests: Sequence[Mapping[str, object]]) -> str:
    """Hash only the closed six source artifacts that can affect scoring."""

    by_source: dict[str, Mapping[str, object]] = {}
    for manifest in manifests:
        source_key = manifest.get("source_key")
        if not isinstance(source_key, str):
            raise WritePlanError("input manifest requires a source key")
        if source_key in NON_MANIFEST_SOURCE_KEYS:
            continue
        if source_key not in SCORING_SOURCE_KEYS:
            raise WritePlanError(f"input manifest has unknown source {source_key!r}")
        if source_key in by_source:
            raise WritePlanError(f"duplicate scoring manifest for {source_key}")
        checksum = manifest.get("checksum_sha256")
        if not isinstance(checksum, str) or SHA256_PATTERN.fullmatch(checksum) is None:
            raise WritePlanError(f"manifest for {source_key} has invalid checksum")
        by_source[source_key] = manifest
    if set(by_source) != SCORING_SOURCE_KEYS:
        missing = sorted(SCORING_SOURCE_KEYS - set(by_source))
        raise WritePlanError(f"scoring manifests are incomplete: {missing}")
    return canonical_sha256([dict(by_source[key]) for key in sorted(by_source)])


def _git_commit(root: Path, environment: Mapping[str, str]) -> str:
    configured = environment.get("MKE_PIPELINE_GIT_COMMIT")
    if configured:
        return configured
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=root, check=True, capture_output=True, text=True
    )
    commit = result.stdout.strip()
    if not commit:
        raise WritePlanError("cannot resolve the pipeline Git commit")
    return commit


def _database_band(value: str | None) -> str | None:
    if value is None:
        return None
    mapping = {
        BandLabel.VERY_LOW.value: "very_low",
        BandLabel.LOW.value: "low",
        BandLabel.MODERATE.value: "moderate",
        BandLabel.HIGH.value: "high",
        BandLabel.VERY_HIGH.value: "very_high",
    }
    try:
        return mapping[value]
    except KeyError as error:
        raise WritePlanError(f"unknown score band {value!r}") from error


def _source_index(inputs: PersistenceInputs) -> dict[str, SourcePersistenceRow]:
    result: dict[str, SourcePersistenceRow] = {}
    natural_keys: set[tuple[str, str, str]] = set()
    for row in inputs.sources:
        natural_key = (row.publisher, row.name, row.dataset_version)
        if row.key in result or natural_key in natural_keys:
            raise WritePlanError("duplicate data-source identity")
        if not all((*natural_key, row.source_url, row.geography, row.license, row.status)):
            raise WritePlanError(f"source {row.key!r} has an empty required field")
        if (
            row.valid_from is not None
            and row.valid_to is not None
            and row.valid_to < row.valid_from
        ):
            raise WritePlanError(f"source {row.key!r} has reversed validity dates")
        result[row.key] = row
        natural_keys.add(natural_key)
    return result


def _snapshot_index(
    inputs: PersistenceInputs, sources: Mapping[str, SourcePersistenceRow]
) -> dict[SnapshotNaturalKey, SnapshotPersistenceRow]:
    result: dict[SnapshotNaturalKey, SnapshotPersistenceRow] = {}
    fingerprints: set[str] = set()
    for row in inputs.snapshots:
        if row.key in result or row.snapshot_fingerprint in fingerprints:
            raise WritePlanError("duplicate source-snapshot identity")
        if row.key.source_key not in sources:
            raise WritePlanError(f"snapshot references unknown source {row.key.source_key!r}")
        _require_hash(row.key.checksum_sha256, "snapshot checksum")
        _require_hash(row.schema_fingerprint, "snapshot schema fingerprint")
        _require_hash(row.snapshot_fingerprint, "snapshot fingerprint")
        if row.byte_size < 0 or row.row_or_feature_count < 0:
            raise WritePlanError("snapshot sizes and row counts cannot be negative")
        if not row.key.dataset_version or not row.storage_uri:
            raise WritePlanError("snapshot version and storage URI cannot be empty")
        result[row.key] = row
        fingerprints.add(row.snapshot_fingerprint)
    return result


def _resource_index(
    inputs: PersistenceInputs, sources: Mapping[str, SourcePersistenceRow]
) -> dict[str, ResourcePersistenceRow]:
    result: dict[str, ResourcePersistenceRow] = {}
    source_records: set[tuple[str, str]] = set()
    for row in inputs.resources:
        if row.source_key not in sources:
            raise WritePlanError(f"resource references unknown source {row.source_key!r}")
        _require_hash(row.canonical_resource_key, "canonical resource key")
        source_record = (row.source_key, row.source_record_id)
        if (
            not row.source_record_id
            or source_record in source_records
            or row.canonical_resource_key in result
        ):
            raise WritePlanError("duplicate or empty food-resource identity")
        result[row.canonical_resource_key] = row
        source_records.add(source_record)
    return result


def _resource_version_index(
    inputs: PersistenceInputs,
    snapshots: Mapping[SnapshotNaturalKey, SnapshotPersistenceRow],
    resources: Mapping[str, ResourcePersistenceRow],
) -> dict[ResourceVersionNaturalKey, ResourceVersionPersistenceRow]:
    result: dict[ResourceVersionNaturalKey, ResourceVersionPersistenceRow] = {}
    fingerprints: set[str] = set()
    evidence_dated_statuses = {"override_verified", "verified_context"}
    for row in inputs.resource_versions:
        if row.key in result or row.version_fingerprint in fingerprints:
            raise WritePlanError("duplicate resource-version identity")
        if row.key.canonical_resource_key not in resources or row.key.snapshot not in snapshots:
            raise WritePlanError("resource version references unresolved identity")
        if resources[row.key.canonical_resource_key].source_key != row.key.snapshot.source_key:
            raise WritePlanError("resource version snapshot must come from its resource source")
        _require_hash(row.version_fingerprint, "resource version fingerprint")
        if (row.longitude is None) != (row.latitude is None):
            raise WritePlanError("resource coordinates must be both present or both absent")
        if row.key.valid_from is not None and row.key.valid_to is not None:
            try:
                reversed_dates = row.key.valid_to < row.key.valid_from
            except TypeError as error:
                raise WritePlanError(
                    "resource version validity bounds must use matching temporal types"
                ) from error
            if reversed_dates:
                raise WritePlanError("resource version has reversed validity dates")
        if row.verification_status in evidence_dated_statuses and row.verified_at is None:
            raise WritePlanError("verified resource version requires an honest verification date")
        result[row.key] = row
        fingerprints.add(row.version_fingerprint)
    return result


def _scoring_slugs(registry: MethodologyRegistry) -> frozenset[str]:
    slugs = frozenset(
        metric.slug for metric in registry.metrics if metric.treatment is MetricTreatment.SCORING
    )
    if slugs != SCORING_METRIC_SLUGS:
        raise WritePlanError("registry does not expose the exact four approved scoring metrics")
    return slugs


def _access_index(
    inputs: PersistenceInputs,
    registry: MethodologyRegistry,
    snapshots: Mapping[SnapshotNaturalKey, SnapshotPersistenceRow],
    resource_versions: Mapping[ResourceVersionNaturalKey, ResourceVersionPersistenceRow],
) -> dict[AccessMetricNaturalKey, AccessMetricPersistenceRow]:
    scoring_slugs = _scoring_slugs(registry)
    contextual_slugs = {
        metric.slug for metric in registry.metrics if metric.treatment is MetricTreatment.CONTEXTUAL
    }
    approved_slugs = scoring_slugs | contextual_slugs
    result: dict[AccessMetricNaturalKey, AccessMetricPersistenceRow] = {}
    metric_pairs: set[tuple[str, str]] = set()
    fingerprints: set[str] = set()
    for row in inputs.access_metrics:
        if row.key.metric_slug not in approved_slugs:
            raise WritePlanError(f"unknown access metric {row.key.metric_slug!r}")
        if row.key in result:
            raise WritePlanError("duplicate access-metric natural key")
        metric_pair = (row.key.geoid, row.key.metric_slug)
        if metric_pair in metric_pairs:
            raise WritePlanError("duplicate access metric for one geography and metric slug")
        if row.key.calculation_fingerprint in fingerprints:
            raise WritePlanError("duplicate access calculation fingerprint")
        if (
            GEOID_PATTERN.fullmatch(row.key.geoid) is None
            or row.key.geoid not in inputs.geography_ids
        ):
            raise WritePlanError("access metric references invalid or unresolved geography")
        _require_hash(row.key.calculation_fingerprint, "access calculation fingerprint")
        if row.primary_snapshot not in snapshots:
            raise WritePlanError("access metric references unknown primary snapshot")
        if (
            row.nearest_resource_version is not None
            and row.nearest_resource_version not in resource_versions
        ):
            raise WritePlanError("access metric references unknown resource version")
        if (row.state == "observed") != (row.value is not None):
            raise WritePlanError("access metric value and state are inconsistent")
        if not row.unit or not row.calculation_version:
            raise WritePlanError("access metric unit and calculation version cannot be empty")
        result[row.key] = row
        metric_pairs.add(metric_pair)
        fingerprints.add(row.key.calculation_fingerprint)
    return result


def _metric_links(
    inputs: PersistenceInputs,
    registry: MethodologyRegistry,
    access: Mapping[AccessMetricNaturalKey, AccessMetricPersistenceRow],
    snapshots: Mapping[SnapshotNaturalKey, SnapshotPersistenceRow],
) -> tuple[tuple[MetricSnapshotLinkPersistenceRow, ...], int]:
    scoring_slugs = _scoring_slugs(registry)
    contextual_slugs = {
        metric.slug for metric in registry.metrics if metric.treatment is MetricTreatment.CONTEXTUAL
    }
    approved_slugs = scoring_slugs | contextual_slugs
    links: dict[
        tuple[AccessMetricNaturalKey, SnapshotNaturalKey], MetricSnapshotLinkPersistenceRow
    ] = {}
    for row in inputs.metric_snapshot_links:
        if row.metric.metric_slug not in approved_slugs:
            raise WritePlanError(f"unknown metric snapshot link {row.metric.metric_slug!r}")
        if row.metric not in access or row.snapshot not in snapshots:
            raise WritePlanError("metric snapshot link references unresolved identity")
        key = (row.metric, row.snapshot)
        if key in links:
            raise WritePlanError("duplicate metric snapshot link")
        links[key] = row
    ordered = sorted(
        links,
        key=lambda item: (
            item[0].geoid,
            item[0].metric_slug,
            item[1].source_key,
            item[1].dataset_version,
            item[1].checksum_sha256,
        ),
    )
    persisted = tuple(links[key] for key in ordered)
    scoring_count = sum(row.metric.metric_slug in scoring_slugs for row in persisted)
    return persisted, scoring_count


def _source_identity_parameters(row: SourcePersistenceRow) -> tuple[object, ...]:
    return (row.publisher, row.name, row.dataset_version)


def _snapshot_identity_parameters(
    key: SnapshotNaturalKey, sources: Mapping[str, SourcePersistenceRow]
) -> tuple[object, ...]:
    return (
        *_source_identity_parameters(sources[key.source_key]),
        key.dataset_version,
        key.checksum_sha256,
    )


def _source_statement(row: SourcePersistenceRow, now: datetime) -> ParameterizedStatement:
    return ParameterizedStatement(
        "INSERT INTO data_sources "
        "(id,name,publisher,source_url,dataset_version,geography,retrieved_at,valid_from,valid_to,"
        "update_frequency,license,methodology_url,status,notes,created_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
        "ON CONFLICT (publisher,name,dataset_version) DO NOTHING",
        (
            deterministic_uuid("data-source", row.publisher, row.name, row.dataset_version),
            row.name,
            row.publisher,
            row.source_url,
            row.dataset_version,
            row.geography,
            row.retrieved_at,
            row.valid_from,
            row.valid_to,
            row.update_frequency,
            row.license,
            row.methodology_url,
            row.status,
            row.notes,
            now,
        ),
    )


def _snapshot_statement(
    row: SnapshotPersistenceRow,
    sources: Mapping[str, SourcePersistenceRow],
    now: datetime,
) -> ParameterizedStatement:
    source = sources[row.key.source_key]
    return ParameterizedStatement(
        "INSERT INTO source_snapshots "
        "(id,source_id,dataset_version,retrieved_at,checksum_sha256,byte_size,storage_uri,"
        "row_or_feature_count,schema_fingerprint,snapshot_fingerprint,request_metadata,"
        "validation_status,created_at) "
        "SELECT %s,ds.id,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s FROM data_sources ds "
        "WHERE ds.publisher=%s AND ds.name=%s AND ds.dataset_version=%s "
        "ON CONFLICT (source_id,dataset_version,checksum_sha256) DO NOTHING",
        (
            deterministic_uuid(
                "source-snapshot",
                source.publisher,
                source.name,
                source.dataset_version,
                row.key.dataset_version,
                row.key.checksum_sha256,
            ),
            row.key.dataset_version,
            row.retrieved_at,
            row.key.checksum_sha256,
            row.byte_size,
            row.storage_uri,
            row.row_or_feature_count,
            row.schema_fingerprint,
            row.snapshot_fingerprint,
            Jsonb(dict(row.request_metadata)),
            row.validation_status,
            now,
            *_source_identity_parameters(source),
        ),
    )


def _resource_statement(
    row: ResourcePersistenceRow,
    sources: Mapping[str, SourcePersistenceRow],
    now: datetime,
) -> ParameterizedStatement:
    source = sources[row.source_key]
    return ParameterizedStatement(
        "INSERT INTO food_resources (id,source_id,source_record_id,canonical_resource_key,created_at) "
        "SELECT %s,ds.id,%s,%s,%s FROM data_sources ds "
        "WHERE ds.publisher=%s AND ds.name=%s AND ds.dataset_version=%s ON CONFLICT DO NOTHING",
        (
            deterministic_uuid("food-resource", row.canonical_resource_key),
            row.source_record_id,
            row.canonical_resource_key,
            now,
            *_source_identity_parameters(source),
        ),
    )


def _resource_version_statement(
    row: ResourceVersionPersistenceRow,
    sources: Mapping[str, SourcePersistenceRow],
    resources: Mapping[str, ResourcePersistenceRow],
    now: datetime,
) -> ParameterizedStatement:
    snapshot_identity = _snapshot_identity_parameters(row.key.snapshot, sources)
    resource = resources[row.key.canonical_resource_key]
    return ParameterizedStatement(
        "INSERT INTO food_resource_versions "
        "(id,resource_id,snapshot_id,version_fingerprint,category,name,subtype,address,city,"
        "postal_code,website,phone,hours,geometry,coordinate_status,verification_status,"
        "classification_evidence,full_service_grocery,snap_authorized,active,valid_from,valid_to,"
        "verified_at,created_at) "
        "SELECT %s,r.id,ss.id,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,"
        "CASE WHEN %s::double precision IS NULL "
        "THEN NULL ELSE ST_SetSRID(ST_MakePoint(%s,%s),4326) END,"
        "%s,%s,%s,%s,%s,%s,%s,%s,%s,%s FROM food_resources r "
        "JOIN source_snapshots ss ON true JOIN data_sources ds ON ds.id=ss.source_id "
        "WHERE r.canonical_resource_key=%s AND r.source_record_id=%s AND r.source_id=ds.id "
        "AND ds.publisher=%s AND ds.name=%s "
        "AND ds.dataset_version=%s AND ss.dataset_version=%s AND ss.checksum_sha256=%s "
        "ON CONFLICT DO NOTHING",
        (
            deterministic_uuid("food-resource-version", row.version_fingerprint),
            row.version_fingerprint,
            row.category,
            row.name,
            row.subtype,
            row.address,
            row.city,
            row.postal_code,
            row.website,
            row.phone,
            Jsonb(dict(row.hours)) if row.hours is not None else None,
            row.longitude,
            row.longitude,
            row.latitude,
            row.coordinate_status,
            row.verification_status,
            Jsonb(dict(row.classification_evidence)),
            row.full_service_grocery,
            row.snap_authorized,
            row.active,
            row.key.valid_from,
            row.key.valid_to,
            row.verified_at,
            now,
            row.key.canonical_resource_key,
            resource.source_record_id,
            *snapshot_identity,
        ),
    )


def _resolved_resource_version_sql() -> str:
    return (
        "SELECT rv.id FROM food_resource_versions rv JOIN food_resources r ON r.id=rv.resource_id "
        "JOIN source_snapshots ss ON ss.id=rv.snapshot_id JOIN data_sources ds ON ds.id=ss.source_id "
        "WHERE r.canonical_resource_key=%s AND r.source_record_id=%s AND r.source_id=ds.id "
        "AND ds.publisher=%s AND ds.name=%s "
        "AND ds.dataset_version=%s AND ss.dataset_version=%s AND ss.checksum_sha256=%s "
        "AND rv.valid_from IS NOT DISTINCT FROM %s AND rv.valid_to IS NOT DISTINCT FROM %s "
        "AND rv.version_fingerprint=%s"
    )


def _access_statement(
    row: AccessMetricPersistenceRow,
    inputs: PersistenceInputs,
    sources: Mapping[str, SourcePersistenceRow],
    resources: Mapping[str, ResourcePersistenceRow],
    resource_versions: Mapping[ResourceVersionNaturalKey, ResourceVersionPersistenceRow],
    now: datetime,
) -> ParameterizedStatement:
    geography_id = inputs.geography_ids[row.key.geoid]
    snapshot_identity = _snapshot_identity_parameters(row.primary_snapshot, sources)
    if row.nearest_resource_version is None:
        nearest_sql = "NULL"
        nearest_parameters: tuple[object, ...] = ()
    else:
        nearest_sql = f"({_resolved_resource_version_sql()})"
        resource = resources[row.nearest_resource_version.canonical_resource_key]
        nearest_parameters = (
            row.nearest_resource_version.canonical_resource_key,
            resource.source_record_id,
            *_snapshot_identity_parameters(row.nearest_resource_version.snapshot, sources),
            row.nearest_resource_version.valid_from,
            row.nearest_resource_version.valid_to,
            resource_versions[row.nearest_resource_version].version_fingerprint,
        )
    return ParameterizedStatement(
        "INSERT INTO food_access_metric_values "
        "(id,geography_id,primary_snapshot_id,nearest_resource_version_id,metric_slug,value,state,"
        "unit,calculation_version,calculation_fingerprint,quality_status,quality_metadata,"
        "calculated_at,created_at) SELECT %s,%s,ss.id,"
        + nearest_sql
        + ",%s,%s,%s,%s,%s,%s,%s,%s,%s,%s "
        "FROM source_snapshots ss JOIN data_sources ds ON ds.id=ss.source_id "
        "WHERE ds.publisher=%s AND ds.name=%s AND ds.dataset_version=%s "
        "AND ss.dataset_version=%s AND ss.checksum_sha256=%s "
        "ON CONFLICT (geography_id,metric_slug,calculation_fingerprint) DO NOTHING",
        (
            deterministic_uuid(
                "food-access-metric",
                geography_id,
                row.key.metric_slug,
                row.key.calculation_fingerprint,
            ),
            geography_id,
            *nearest_parameters,
            row.key.metric_slug,
            row.value,
            row.state,
            row.unit,
            row.calculation_version,
            row.key.calculation_fingerprint,
            row.quality_status,
            Jsonb(dict(row.quality_metadata)),
            row.calculated_at,
            now,
            *snapshot_identity,
        ),
    )


def _metric_snapshot_statement(
    row: MetricSnapshotLinkPersistenceRow,
    inputs: PersistenceInputs,
    sources: Mapping[str, SourcePersistenceRow],
) -> ParameterizedStatement:
    geography_id = inputs.geography_ids[row.metric.geoid]
    return ParameterizedStatement(
        "INSERT INTO food_access_metric_snapshots (access_metric_value_id,snapshot_id) "
        "SELECT amv.id,ss.id FROM food_access_metric_values amv "
        "JOIN source_snapshots ss ON true JOIN data_sources ds ON ds.id=ss.source_id "
        "WHERE amv.geography_id=%s AND amv.metric_slug=%s AND amv.calculation_fingerprint=%s "
        "AND ds.publisher=%s AND ds.name=%s AND ds.dataset_version=%s "
        "AND ss.dataset_version=%s AND ss.checksum_sha256=%s ON CONFLICT DO NOTHING",
        (
            geography_id,
            row.metric.metric_slug,
            row.metric.calculation_fingerprint,
            *_snapshot_identity_parameters(row.snapshot, sources),
        ),
    )


def build_load_statements(
    *, inputs: PersistenceInputs, registry: MethodologyRegistry, now: datetime
) -> tuple[
    tuple[ParameterizedStatement, ...],
    Mapping[AccessMetricNaturalKey, AccessMetricPersistenceRow],
    int,
]:
    """Build deterministic idempotent load SQL and return scoring access identity."""

    sources = _source_index(inputs)
    snapshots = _snapshot_index(inputs, sources)
    resources = _resource_index(inputs, sources)
    resource_versions = _resource_version_index(inputs, snapshots, resources)
    all_access = _access_index(inputs, registry, snapshots, resource_versions)
    links, scoring_link_count = _metric_links(inputs, registry, all_access, snapshots)
    scoring_slugs = _scoring_slugs(registry)
    scoring_access = {
        key: row for key, row in all_access.items() if key.metric_slug in scoring_slugs
    }
    statements: list[ParameterizedStatement] = []
    statements.extend(
        _source_statement(row, now)
        for row in sorted(
            inputs.sources, key=lambda item: (item.publisher, item.name, item.dataset_version)
        )
    )
    statements.extend(
        _snapshot_statement(row, sources, now)
        for row in sorted(
            inputs.snapshots,
            key=lambda item: (
                item.key.source_key,
                item.key.dataset_version,
                item.key.checksum_sha256,
            ),
        )
    )
    statements.extend(
        _resource_statement(row, sources, now)
        for row in sorted(inputs.resources, key=lambda item: item.canonical_resource_key)
    )
    statements.extend(
        _resource_version_statement(row, sources, resources, now)
        for row in sorted(
            inputs.resource_versions,
            key=lambda item: (
                item.key.canonical_resource_key,
                item.key.snapshot.source_key,
                item.key.snapshot.dataset_version,
                item.key.snapshot.checksum_sha256,
                item.key.valid_from.isoformat() if item.key.valid_from is not None else "",
                item.key.valid_to.isoformat() if item.key.valid_to is not None else "",
            ),
        )
    )
    statements.extend(
        _access_statement(all_access[key], inputs, sources, resources, resource_versions, now)
        for key in sorted(
            all_access,
            key=lambda item: (item.geoid, item.metric_slug, item.calculation_fingerprint),
        )
    )
    statements.extend(_metric_snapshot_statement(row, inputs, sources) for row in links)
    return tuple(statements), scoring_access, scoring_link_count


def _validate_production_counts(
    scoring: FoodScoringResult,
    inputs: PersistenceInputs,
    access: Mapping[AccessMetricNaturalKey, AccessMetricPersistenceRow],
    link_count: int,
) -> None:
    score_counts = Counter(score.status for score in scoring.scores)
    expected = {
        "complete": EXPECTED_COMPLETE_COUNT,
        "insufficient_data": EXPECTED_INSUFFICIENT_COUNT,
        "ineligible_zero_population": EXPECTED_ZERO_POPULATION_COUNT,
    }
    if len(scoring.scores) != EXPECTED_SCORE_COUNT or score_counts != expected:
        raise WritePlanError(
            "Food score reconciliation must be 302 total, 299 complete, 1 insufficient, and 2 zero"
        )
    if len(scoring.components) != EXPECTED_COMPONENT_COUNT:
        raise WritePlanError("Food score component reconciliation must equal 1,196")
    _validate_approved_insufficient(scoring, access)
    if len(access) != EXPECTED_ACCESS_METRIC_COUNT:
        raise WritePlanError("Food access metric reconciliation must equal 1,208")
    _validate_production_metric_counts(scoring, inputs, access, link_count)


def _validate_approved_insufficient(
    scoring: FoodScoringResult,
    access: Mapping[AccessMetricNaturalKey, AccessMetricPersistenceRow],
) -> None:
    insufficient = tuple(score for score in scoring.scores if score.status == "insufficient_data")
    if (
        len(insufficient) != 1
        or insufficient[0].geoid != EXPECTED_INSUFFICIENT_GEOID
        or insufficient[0].exclusion_reasons != EXPECTED_INSUFFICIENT_REASONS
    ):
        raise WritePlanError(
            "Food insufficient-data reconciliation must match the approved unsnapped tract"
        )
    required_metrics = frozenset(
        {"full_service_grocery_walk_access", "scheduled_transit_service_intensity"}
    )
    missing_rows = {
        key.metric_slug: row
        for key, row in access.items()
        if key.geoid == EXPECTED_INSUFFICIENT_GEOID and key.metric_slug in required_metrics
    }
    if set(missing_rows) != required_metrics or any(
        row.value is not None
        or row.state != "missing"
        or row.quality_status != "missing"
        or row.quality_metadata.get("quality_reason") != "origin_unsnapped"
        for row in missing_rows.values()
    ):
        raise WritePlanError(
            "Food insufficient-data metrics must match the approved unsnapped-origin cause"
        )


def _validate_production_metric_counts(
    scoring: FoodScoringResult,
    inputs: PersistenceInputs,
    access: Mapping[AccessMetricNaturalKey, AccessMetricPersistenceRow],
    link_count: int,
) -> None:
    if link_count != EXPECTED_METRIC_SNAPSHOT_LINK_COUNT:
        raise WritePlanError("Food access snapshot lineage reconciliation must equal 2,416")
    if set(inputs.geography_ids) != {score.geoid for score in scoring.scores}:
        raise WritePlanError("resolved geography IDs do not match Food score GEOIDs")

    geoids = frozenset(inputs.geography_ids)
    scoring_pairs = {(key.geoid, key.metric_slug) for key in access}
    expected_scoring_pairs = {
        (geoid, metric_slug) for geoid in geoids for metric_slug in SCORING_METRIC_SLUGS
    }
    if scoring_pairs != expected_scoring_pairs:
        raise WritePlanError("Food access metrics must form the exact 302-by-4 scoring grid")

    all_pairs = {(row.key.geoid, row.key.metric_slug) for row in inputs.access_metrics}
    if len(inputs.access_metrics) != EXPECTED_TOTAL_ACCESS_METRIC_COUNT:
        raise WritePlanError("Food access persistence must contain 3,020 scoring and context rows")
    expected_all_pairs = {
        (geoid, metric_slug) for geoid in geoids for metric_slug in REQUIRED_SNAPSHOT_SOURCES
    }
    if all_pairs != expected_all_pairs:
        raise WritePlanError("Food access persistence must form the exact 302-by-10 metric grid")

    links_by_metric: dict[AccessMetricNaturalKey, set[str]] = {}
    for link in inputs.metric_snapshot_links:
        links_by_metric.setdefault(link.metric, set()).add(link.snapshot.source_key)
    for row in inputs.access_metrics:
        expected_sources = REQUIRED_SNAPSHOT_SOURCES[row.key.metric_slug]
        if links_by_metric.get(row.key, set()) != expected_sources:
            raise WritePlanError(
                f"metric lineage sources do not match the approved contract for {row.key.metric_slug}"
            )
    if len(inputs.metric_snapshot_links) != EXPECTED_TOTAL_METRIC_SNAPSHOT_LINK_COUNT:
        raise WritePlanError("Food access persistence must contain 7,852 source lineage links")

    complete_geoids = {score.geoid for score in scoring.scores if score.status == "complete"}
    component_pairs = {(item.geoid, item.metric_slug) for item in scoring.components}
    expected_component_pairs = {
        (geoid, metric_slug) for geoid in complete_geoids for metric_slug in SCORING_METRIC_SLUGS
    }
    if component_pairs != expected_component_pairs:
        raise WritePlanError("Food score components must form the exact 299-by-4 scoring grid")


def _reconciliation_statements(
    *, inputs: PersistenceInputs, scoring: FoodScoringResult, run_id: str
) -> tuple[ParameterizedStatement, ...]:
    """Verify actual persisted identities before a draft may become validated."""

    snapshot_fingerprints = sorted({row.snapshot_fingerprint for row in inputs.snapshots})
    resource_keys = sorted({row.canonical_resource_key for row in inputs.resources})
    version_fingerprints = sorted({row.version_fingerprint for row in inputs.resource_versions})
    calculation_fingerprints = sorted(
        {row.key.calculation_fingerprint for row in inputs.access_metrics}
    )
    link_pairs = sorted(
        (
            {
                "calculation_fingerprint": row.metric.calculation_fingerprint,
                "snapshot_fingerprint": next(
                    snapshot.snapshot_fingerprint
                    for snapshot in inputs.snapshots
                    if snapshot.key == row.snapshot
                ),
            }
            for row in inputs.metric_snapshot_links
        ),
        key=lambda item: (
            item["calculation_fingerprint"],
            item["snapshot_fingerprint"],
        ),
    )
    exact_links_sql = (
        "WITH expected AS (SELECT calculation_fingerprint,snapshot_fingerprint "
        "FROM jsonb_to_recordset(%s) AS item("
        "calculation_fingerprint text,snapshot_fingerprint text)), actual AS ("
        "SELECT amv.calculation_fingerprint,ss.snapshot_fingerprint "
        "FROM food_access_metric_snapshots links "
        "JOIN food_access_metric_values amv ON amv.id=links.access_metric_value_id "
        "JOIN source_snapshots ss ON ss.id=links.snapshot_id "
        "WHERE amv.calculation_fingerprint IN ("
        "SELECT calculation_fingerprint FROM expected)) "
        "SELECT NOT EXISTS (SELECT * FROM expected EXCEPT SELECT * FROM actual) "
        "AND NOT EXISTS (SELECT * FROM actual EXCEPT SELECT * FROM expected)"
    )
    return (
        ParameterizedStatement(
            "SELECT count(*)=%s FROM source_snapshots WHERE snapshot_fingerprint=ANY(%s)",
            (len(snapshot_fingerprints), snapshot_fingerprints),
        ),
        ParameterizedStatement(
            "SELECT count(*)=%s FROM food_resources WHERE canonical_resource_key=ANY(%s)",
            (len(resource_keys), resource_keys),
        ),
        ParameterizedStatement(
            "SELECT count(*)=%s FROM food_resource_versions WHERE version_fingerprint=ANY(%s)",
            (len(version_fingerprints), version_fingerprints),
        ),
        ParameterizedStatement(
            "SELECT count(*)=%s FROM food_access_metric_values "
            "WHERE calculation_fingerprint=ANY(%s)",
            (len(calculation_fingerprints), calculation_fingerprints),
        ),
        ParameterizedStatement(exact_links_sql, (Jsonb(link_pairs),)),
        ParameterizedStatement(
            "SELECT count(*)=%s FROM food_score_components WHERE food_score_run_id=%s",
            (len(scoring.components), run_id),
        ),
        ParameterizedStatement(
            "SELECT count(*)=%s FROM food_scores WHERE food_score_run_id=%s",
            (len(scoring.scores), run_id),
        ),
    )


def build_write_plan(
    *,
    root: Path,
    environment: Mapping[str, str],
    clock: Callable[[], datetime],
    registry: MethodologyRegistry,
    scoring: FoodScoringResult,
    inputs: PersistenceInputs,
    require_production_counts: bool = True,
) -> tuple[RunCandidate, ValidatedWritePlan]:
    """Build bound base, analytical, and lifecycle writes without opaque SQL input."""

    if scoring.baseline_run.run_id != PINNED_BASELINE_RUN_ID:
        raise WritePlanError("scoring output does not reference the pinned baseline run")
    if scoring.baseline_run.output_hash != PINNED_BASELINE_OUTPUT_HASH:
        raise WritePlanError("scoring output does not reference the pinned baseline output hash")
    now = clock()
    load_statements, access, link_count = build_load_statements(
        inputs=inputs, registry=registry, now=now
    )
    if require_production_counts:
        _validate_production_counts(scoring, inputs, access, link_count)
    scoring_manifest_hash = manifest_hash(inputs.manifests)
    git_commit = _git_commit(root, environment)
    run_fingerprint = canonical_sha256(
        {
            "methodology_version": registry.methodology_version,
            "scoring_registry_hash": registry.scoring_sha256,
            "input_manifest_hash": scoring_manifest_hash,
            "score_input_fingerprint": scoring.score_input_fingerprint,
            "scoring_implementation_version": SCORING_IMPLEMENTATION_VERSION,
            "git_commit": git_commit,
            "equity_baseline_run_id": scoring.baseline_run.run_id,
            "equity_baseline_output_hash": scoring.baseline_run.output_hash,
        }
    )
    run_id = deterministic_uuid("food-run", run_fingerprint)
    access_by_score_key = {(key.geoid, key.metric_slug): key for key in access}
    analytical: list[ParameterizedStatement] = []
    for component in sorted(scoring.components, key=lambda item: (item.geoid, item.metric_slug)):
        key = access_by_score_key.get((component.geoid, component.metric_slug))
        if key is None:
            raise WritePlanError(
                f"unresolved component metric for {component.geoid} {component.metric_slug}"
            )
        geography_id = inputs.geography_ids[component.geoid]
        analytical.append(
            ParameterizedStatement(
                "INSERT INTO food_score_components "
                "(id,food_score_run_id,geography_id,access_metric_value_id,domain,indicator_percentile,"
                "effective_weight,quality_status,created_at) "
                "SELECT %s,%s,%s,amv.id,%s,%s,%s,%s,%s FROM food_access_metric_values amv "
                "WHERE amv.geography_id=%s AND amv.metric_slug=%s AND amv.calculation_fingerprint=%s",
                (
                    deterministic_uuid(
                        "food-component", run_id, component.geoid, component.metric_slug
                    ),
                    run_id,
                    geography_id,
                    component.domain.value,
                    component.percentile,
                    component.effective_weight,
                    component.quality_status,
                    now,
                    geography_id,
                    key.metric_slug,
                    key.calculation_fingerprint,
                ),
            )
        )
    for score in sorted(scoring.scores, key=lambda item: item.geoid):
        try:
            geography_id = inputs.geography_ids[score.geoid]
        except KeyError as error:
            raise WritePlanError(f"unresolved geography foreign key for {score.geoid}") from error
        analytical.append(
            ParameterizedStatement(
                "INSERT INTO food_scores "
                "(id,food_score_run_id,geography_id,equity_baseline_score_id,retail_access_score,"
                "transportation_constraint_score,raw_food_access_need,food_access_need_percentile,"
                "food_access_need_band,equity_baseline_band,priority,quality_status,exclusion_reasons,created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    deterministic_uuid("food-score", run_id, score.geoid),
                    run_id,
                    geography_id,
                    score.equity_baseline_score_id,
                    score.domains.get(Domain.RETAIL_ACCESS),
                    score.domains.get(Domain.TRANSPORTATION_CONSTRAINT),
                    score.raw_food_access_need,
                    score.food_access_need_percentile,
                    _database_band(score.food_access_need_band),
                    _database_band(score.equity_baseline_band),
                    score.priority,
                    score.status,
                    Jsonb(list(score.exclusion_reasons)),
                    now,
                ),
            )
        )
    quality_counts = Counter(score.status for score in scoring.scores)
    validation_result: dict[str, object] = {
        "valid": True,
        "publishable": False,
        "baseline_run_id": scoring.baseline_run.run_id,
        "baseline_output_hash": scoring.baseline_run.output_hash,
        "baseline_score_count": len(scoring.scores),
        "source_snapshot_count": len(inputs.snapshots),
        "resource_count": len(inputs.resources),
        "resource_version_count": len(inputs.resource_versions),
        "access_metric_value_count": len(access),
        "metric_snapshot_link_count": link_count,
        "component_count": len(scoring.components),
        "food_score_count": len(scoring.scores),
        "quality_counts": dict(sorted(quality_counts.items())),
        "score_input_fingerprint": scoring.score_input_fingerprint,
        "output_hash": scoring.canonical_output_hash,
        "prohibited_contextual_score_input_count": 0,
    }
    plan = ValidatedWritePlan(
        run_id=run_id,
        methodology_version=registry.methodology_version,
        registry_hash=registry.sha256,
        input_manifest_hash=scoring_manifest_hash,
        scoring_implementation_version=SCORING_IMPLEMENTATION_VERSION,
        equity_baseline_run_id=scoring.baseline_run.run_id,
        equity_baseline_output_hash=scoring.baseline_run.output_hash,
        data_vintages=dict(inputs.data_vintages),
        git_commit=git_commit,
        load_statements=load_statements,
        analytical_statements=tuple(analytical),
        validation_result=validation_result,
        reconciliation_statements=_reconciliation_statements(
            inputs=inputs,
            scoring=scoring,
            run_id=run_id,
        ),
    )
    return RunCandidate(run_fingerprint, scoring.canonical_output_hash, plan), plan


__all__ = [
    "AccessMetricNaturalKey",
    "AccessMetricPersistenceRow",
    "MetricSnapshotLinkPersistenceRow",
    "PersistenceInputs",
    "ResourcePersistenceRow",
    "ResourceVersionNaturalKey",
    "ResourceVersionPersistenceRow",
    "SCORING_IMPLEMENTATION_VERSION",
    "SnapshotNaturalKey",
    "SnapshotPersistenceRow",
    "SourcePersistenceRow",
    "WritePlanError",
    "build_load_statements",
    "build_write_plan",
    "canonical_sha256",
    "deterministic_uuid",
    "manifest_hash",
]
