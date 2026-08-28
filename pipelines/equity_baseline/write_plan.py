"""Deterministic parameterized persistence plans for normalized baseline data."""

from __future__ import annotations

import hashlib
import subprocess
import uuid
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Protocol, cast

from psycopg.types.json import Jsonb

from pipelines.equity_baseline.acs import AcsNormalizationResult
from pipelines.equity_baseline.artifacts import canonical_json_bytes
from pipelines.equity_baseline.database import ParameterizedStatement, ValidatedWritePlan
from pipelines.equity_baseline.errors import EquityBaselineError
from pipelines.equity_baseline.geography import GeographyRecord, TIGER_2020_WISCONSIN_TRACTS_URL
from pipelines.equity_baseline.models import Domain, FormulaDefinition, MethodologyRegistry
from pipelines.equity_baseline.places import CDC_PLACES_ENDPOINT, PlacesNormalizationResult
from pipelines.equity_baseline.runner import RunCandidate
from pipelines.equity_baseline.scoring import ScoringResult

SCORING_IMPLEMENTATION_VERSION = "equity-baseline-python-v1"
UUID_NAMESPACE = uuid.UUID("844f349a-46b5-4e30-b07d-077b4160cb40")


class WritePlanError(EquityBaselineError, ValueError):
    """Raised when normalized inputs cannot produce a valid write plan."""


class SnapshotLike(Protocol):
    @property
    def logical_source(self) -> str: ...

    @property
    def manifest(self) -> Mapping[str, object]: ...


class BundleLike(Protocol):
    @property
    def geographies(self) -> Sequence[GeographyRecord]: ...

    @property
    def acs(self) -> AcsNormalizationResult: ...

    @property
    def places(self) -> PlacesNormalizationResult: ...

    @property
    def snapshots(self) -> Sequence[SnapshotLike]: ...


def _uuid(*parts: str) -> str:
    return str(uuid.uuid5(UUID_NAMESPACE, "\x1f".join(parts)))


def _json_metadata(value: Mapping[str, object]) -> dict[str, object]:
    output: dict[str, object] = {}
    for key, item in value.items():
        if isinstance(item, Decimal):
            output[key] = format(item, "f")
        elif isinstance(item, Mapping):
            output[key] = _json_metadata(cast(Mapping[str, object], item))
        elif isinstance(item, (str, int, bool)) or item is None:
            output[key] = item
        else:
            output[key] = str(item)
    return output


def _formula_document(formula: FormulaDefinition) -> dict[str, object]:
    return {
        "type": formula.kind.value,
        "numerator": list(formula.numerator),
        "numerator_subtract": list(formula.numerator_subtract),
        "denominator": list(formula.denominator),
        "denominator_subtract": list(formula.denominator_subtract),
        "measure_id": formula.measure_id,
        "data_value_type_id": formula.data_value_type_id,
    }


def _manifest_string(manifest: Mapping[str, object], key: str) -> str:
    value = manifest.get(key)
    if not isinstance(value, str) or not value:
        raise WritePlanError(f"snapshot manifest has invalid {key}")
    return value


def _manifest_hash(snapshots: Sequence[SnapshotLike]) -> str:
    document = [dict(item.manifest) for item in snapshots]
    document.sort(
        key=lambda item: (cast(str, item["source_key"]), cast(str, item["checksum_sha256"]))
    )
    return hashlib.sha256(canonical_json_bytes(document)).hexdigest()


def _git_commit(root: Path, environment: Mapping[str, str]) -> str:
    configured = environment.get("MKE_PIPELINE_GIT_COMMIT")
    if configured:
        return configured
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    commit = result.stdout.strip()
    if not commit:
        raise WritePlanError("cannot resolve the pipeline Git commit")
    return commit


def _source_metadata(key: str) -> tuple[str, str, str]:
    if key == "tiger":
        return "United States Census Bureau", TIGER_2020_WISCONSIN_TRACTS_URL, "annual"
    if key == "acs":
        return "United States Census Bureau", "https://api.census.gov/data/2024/acs/acs5", "annual"
    if key == "places":
        return "Centers for Disease Control and Prevention", CDC_PLACES_ENDPOINT, "annual"
    raise WritePlanError(f"unsupported source key {key!r}")


def _timestamp(value: object) -> datetime:
    if not isinstance(value, str):
        raise WritePlanError("snapshot retrieved_at must be a string")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise WritePlanError("snapshot retrieved_at must include a timezone")
    return parsed


def _snapshot_fingerprint(item: SnapshotLike, source_id: str) -> str:
    return hashlib.sha256(
        canonical_json_bytes(
            {
                "source_id": source_id,
                "dataset_version": item.manifest["dataset_version"],
                "checksum_sha256": item.manifest["checksum_sha256"],
            }
        )
    ).hexdigest()


def _quality_status(status: str) -> str:
    return status if status in {"verified", "provisional", "stale"} else "missing"


def build_write_plan(
    *,
    root: Path,
    environment: Mapping[str, str],
    clock: Callable[[], datetime],
    registry: MethodologyRegistry,
    bundle: BundleLike,
    scoring: ScoringResult,
) -> tuple[RunCandidate, ValidatedWritePlan]:
    """Build deterministic base and analytical statements without executing SQL."""

    now = clock()
    source_ids = {
        source_definition.key: _uuid("source", source_definition.key, source_definition.vintage)
        for source_definition in registry.sources
    }
    source_snapshots: dict[str, list[SnapshotLike]] = {key: [] for key in source_ids}
    for snapshot in bundle.snapshots:
        source_snapshots[snapshot.logical_source].append(snapshot)

    load: list[ParameterizedStatement] = []
    for definition in registry.sources:
        publisher, url, frequency = _source_metadata(definition.key)
        retrieved = max(
            _timestamp(source_snapshot.manifest["retrieved_at"])
            for source_snapshot in source_snapshots[definition.key]
        )
        load.append(
            ParameterizedStatement(
                "INSERT INTO data_sources "
                "(id,name,publisher,source_url,dataset_version,geography,retrieved_at,"
                "update_frequency,license,methodology_url,status,notes,created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active',%s,%s) "
                "ON CONFLICT (publisher,name,dataset_version) DO NOTHING",
                (
                    source_ids[definition.key],
                    definition.name,
                    publisher,
                    url,
                    definition.vintage,
                    "Milwaukee County, Wisconsin census tracts",
                    retrieved,
                    frequency,
                    definition.license_notes,
                    "docs/methodology/equity-baseline.md",
                    definition.dataset_identifier,
                    now,
                ),
            )
        )

    snapshot_ids: dict[str, str] = {}
    for source_snapshot in bundle.snapshots:
        checksum = _manifest_string(source_snapshot.manifest, "checksum_sha256")
        source_id = source_ids[source_snapshot.logical_source]
        snapshot_id = _uuid("snapshot", source_id, checksum)
        snapshot_ids[_manifest_string(source_snapshot.manifest, "source_key")] = snapshot_id
        load.append(
            ParameterizedStatement(
                "INSERT INTO source_snapshots "
                "(id,source_id,dataset_version,retrieved_at,checksum_sha256,byte_size,"
                "storage_uri,row_or_feature_count,schema_fingerprint,snapshot_fingerprint,"
                "request_metadata,validation_status,created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'valid',%s) "
                "ON CONFLICT (source_id,dataset_version,checksum_sha256) DO NOTHING",
                (
                    snapshot_id,
                    source_id,
                    source_snapshot.manifest["dataset_version"],
                    _timestamp(source_snapshot.manifest["retrieved_at"]),
                    checksum,
                    source_snapshot.manifest["byte_size"],
                    source_snapshot.manifest["storage_uri"],
                    source_snapshot.manifest["row_or_feature_count"],
                    source_snapshot.manifest["schema_fingerprint"],
                    _snapshot_fingerprint(source_snapshot, source_id),
                    Jsonb(
                        dict(
                            cast(
                                Mapping[str, object],
                                source_snapshot.manifest["request_metadata"],
                            )
                        )
                    ),
                    now,
                ),
            )
        )

    population_by_geoid = {
        population.geoid: population.value for population in bundle.acs.populations
    }
    geography_ids: dict[str, str] = {}
    for geography in bundle.geographies:
        geography_id = _uuid("geography", "tract", geography.geoid, geography.vintage)
        geography_ids[geography.geoid] = geography_id
        population = population_by_geoid[geography.geoid]
        if population is not None and population != population.to_integral_value():
            raise WritePlanError(f"ACS population is not integral for {geography.geoid}")
        load.append(
            ParameterizedStatement(
                "INSERT INTO geographies "
                "(id,geoid,geography_type,name,state_fips,county_fips,geometry,centroid,"
                "population,vintage,created_at) "
                "VALUES (%s,%s,'tract',%s,%s,%s,ST_GeomFromWKB(decode(%s,'hex'),4326),"
                "ST_GeomFromWKB(decode(%s,'hex'),4326),%s,%s,%s) "
                "ON CONFLICT (geography_type,geoid,vintage) DO NOTHING",
                (
                    geography_id,
                    geography.geoid,
                    geography.name,
                    geography.state_fips,
                    geography.county_fips,
                    geography.geometry.wkb_hex,
                    geography.centroid.wkb_hex,
                    int(population) if population is not None else None,
                    geography.vintage,
                    now,
                ),
            )
        )

    indicator_ids: dict[str, str] = {}
    for indicator in registry.indicators:
        indicator_id = _uuid("indicator", registry.methodology_version, indicator.slug)
        indicator_ids[indicator.slug] = indicator_id
        load.append(
            ParameterizedStatement(
                "INSERT INTO indicator_definitions "
                "(id,methodology_version,slug,name,description,domain,unit,source_id,"
                "higher_is_worse,baseline_included,weight,vintage,methodology_notes,"
                "formula_definition,created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT (methodology_version,slug) DO NOTHING",
                (
                    indicator_id,
                    registry.methodology_version,
                    indicator.slug,
                    indicator.name,
                    indicator.name,
                    indicator.domain.value,
                    indicator.unit,
                    source_ids[indicator.source],
                    indicator.higher_is_worse,
                    indicator.baseline_included,
                    indicator.within_domain_weight,
                    indicator.vintage,
                    "Approved Equity Baseline v1 registry",
                    Jsonb(_formula_document(indicator.formula)),
                    now,
                ),
            )
        )

    indicator_value_ids: dict[tuple[str, str], str] = {}
    indicators = {indicator.slug: indicator for indicator in registry.indicators}
    all_observations = [
        (
            "acs",
            item.geoid,
            item.indicator_slug,
            item.value,
            item.margin_of_error,
            None,
            None,
            item.quality_status,
            item.quality_reason,
            item.quality_metadata,
            "2024",
        )
        for item in bundle.acs.observations
    ] + [
        (
            "places",
            item.geoid,
            item.indicator_slug,
            item.value,
            None,
            item.low_confidence_limit,
            item.high_confidence_limit,
            item.quality_status,
            item.quality_reason,
            item.quality_metadata,
            item.source_year,
        )
        for item in bundle.places.observations
    ]
    for (
        logical_source,
        geoid,
        slug,
        value,
        margin,
        low,
        high,
        status,
        reason,
        metadata,
        data_year,
    ) in sorted(all_observations, key=lambda row: (row[1], row[2])):
        indicator_definition = indicators[slug]
        if logical_source == "acs":
            group = indicator_definition.formula.estimate_variables[0].split("_", 1)[0].casefold()
            snapshot_id = snapshot_ids[f"acs-{group}"]
        else:
            snapshot_id = snapshot_ids["places"]
        value_id = _uuid("indicator-value", geoid, slug, snapshot_id)
        indicator_value_ids[(geoid, slug)] = value_id
        quality_metadata = {**_json_metadata(metadata), "reason": reason}
        load.append(
            ParameterizedStatement(
                "INSERT INTO indicator_values "
                "(id,geography_id,indicator_id,snapshot_id,value,margin_of_error,confidence_low,"
                "confidence_high,data_year,quality_status,quality_metadata,created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT (geography_id,indicator_id,snapshot_id) DO NOTHING",
                (
                    value_id,
                    geography_ids[geoid],
                    indicator_ids[slug],
                    snapshot_id,
                    value,
                    margin,
                    low,
                    high,
                    data_year,
                    _quality_status(status),
                    Jsonb(quality_metadata),
                    now,
                ),
            )
        )

    input_manifest_hash = _manifest_hash(bundle.snapshots)
    git_commit = _git_commit(root, environment)
    fingerprint = hashlib.sha256(
        canonical_json_bytes(
            {
                "methodology_version": registry.methodology_version,
                "registry_hash": registry.sha256,
                "input_manifest_hash": input_manifest_hash,
                "scoring_implementation_version": SCORING_IMPLEMENTATION_VERSION,
                "git_commit": git_commit,
            }
        )
    ).hexdigest()
    run_id = _uuid("run", fingerprint)
    analytical: list[ParameterizedStatement] = []
    for component in scoring.components:
        analytical.append(
            ParameterizedStatement(
                "INSERT INTO score_components "
                "(id,score_run_id,geography_id,indicator_value_id,indicator_percentile,"
                "effective_weight,quality_status,created_at) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    _uuid("component", run_id, component.geoid, component.indicator_slug),
                    run_id,
                    geography_ids[component.geoid],
                    indicator_value_ids[(component.geoid, component.indicator_slug)],
                    component.percentile,
                    component.effective_weight,
                    _quality_status(component.quality_status),
                    now,
                ),
            )
        )
    for tract_score in scoring.scores:
        analytical.append(
            ParameterizedStatement(
                "INSERT INTO scores "
                "(id,score_run_id,geography_id,demographic_score,socioeconomic_score,"
                "health_score,composite_score,equity_baseline_percentile,equity_baseline_band,"
                "quality_status,created_at) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    _uuid("score", run_id, tract_score.geoid),
                    run_id,
                    geography_ids[tract_score.geoid],
                    tract_score.subindices.get(Domain.DEMOGRAPHIC),
                    tract_score.subindices.get(Domain.SOCIOECONOMIC),
                    tract_score.subindices.get(Domain.HEALTH),
                    tract_score.composite_score,
                    tract_score.final_percentile,
                    (
                        tract_score.band.casefold().replace(" ", "_")
                        if tract_score.band is not None
                        else None
                    ),
                    tract_score.status,
                    now,
                ),
            )
        )

    quality_counts: dict[str, int] = {}
    for tract_score in scoring.scores:
        quality_counts[tract_score.status] = quality_counts.get(tract_score.status, 0) + 1
    validation_result = {
        "geography_count": len(bundle.geographies),
        "indicator_value_count": len(all_observations),
        "component_count": len(scoring.components),
        "score_count": len(scoring.scores),
        "quality_counts": quality_counts,
    }
    plan = ValidatedWritePlan(
        run_id=run_id,
        methodology_version=registry.methodology_version,
        registry_hash=registry.sha256,
        input_manifest_hash=input_manifest_hash,
        scoring_implementation_version=SCORING_IMPLEMENTATION_VERSION,
        data_vintages={
            source_definition.key: source_definition.vintage
            for source_definition in registry.sources
        },
        git_commit=git_commit,
        load_statements=tuple(load),
        analytical_statements=tuple(analytical),
        validation_result=validation_result,
    )
    return RunCandidate(fingerprint, scoring.canonical_output_hash, plan), plan


__all__ = ["WritePlanError", "build_write_plan"]
