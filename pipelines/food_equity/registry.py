"""Load and validate the approved food-equity methodology registry."""

from __future__ import annotations

import hashlib
import tomllib
from collections.abc import Mapping, Sequence
from decimal import Decimal, InvalidOperation
from pathlib import Path
from types import MappingProxyType
from typing import Any, Never, TypeVar

from pipelines.food_equity.errors import RegistryValidationError
from pipelines.food_equity.models import (
    AccessPolicy,
    BandLabel,
    ClassificationRule,
    Domain,
    MethodologyRegistry,
    MetricDefinition,
    MetricTreatment,
    PriorityBand,
    ResourceCategory,
    SourceDefinition,
    SourceRole,
)

REGISTRY_PATH = Path(__file__).with_name("registry.toml")
WEIGHT_TOLERANCE = Decimal("1e-26")
APPROVED_SOURCE_KEYS = frozenset(
    {
        "acs_vehicle",
        "emergency_food_context",
        "equity_baseline",
        "mcts_gtfs",
        "snap_retailers",
        "sram",
        "tract_origins",
        "walking_network",
    }
)
EnumValue = TypeVar("EnumValue", SourceRole, Domain, MetricTreatment, ResourceCategory, BandLabel)


def _invalid(message: str) -> Never:
    raise RegistryValidationError(message)


def _mapping(value: object, context: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        _invalid(f"{context} must be a table")
    return value


def _sequence(value: object, context: str) -> Sequence[object]:
    if not isinstance(value, list):
        _invalid(f"{context} must be an array")
    return value


def _string(table: Mapping[str, Any], key: str, context: str) -> str:
    value = table.get(key)
    if not isinstance(value, str) or not value:
        _invalid(f"{context}.{key} must be a non-empty string")
    return value


def _optional_string(table: Mapping[str, Any], key: str, context: str) -> str | None:
    value = table.get(key)
    if value is None:
        return None
    if not isinstance(value, str) or not value:
        _invalid(f"{context}.{key} must be a non-empty string when present")
    return value


def _boolean(table: Mapping[str, Any], key: str, context: str) -> bool:
    value = table.get(key)
    if not isinstance(value, bool):
        _invalid(f"{context}.{key} must be a boolean")
    return value


def _integer(table: Mapping[str, Any], key: str, context: str) -> int:
    value = table.get(key)
    if not isinstance(value, int) or isinstance(value, bool):
        _invalid(f"{context}.{key} must be an integer")
    return value


def _optional_integer(table: Mapping[str, Any], key: str, context: str) -> int | None:
    value = table.get(key)
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool):
        _invalid(f"{context}.{key} must be an integer when present")
    return value


def _decimal(table: Mapping[str, Any], key: str, context: str) -> Decimal:
    raw = _string(table, key, context)
    try:
        return Decimal(raw)
    except InvalidOperation:
        _invalid(f"{context}.{key} must be a decimal string")


def _strings(table: Mapping[str, Any], key: str, context: str) -> tuple[str, ...]:
    values = _sequence(table.get(key), f"{context}.{key}")
    if any(not isinstance(value, str) or not value for value in values):
        _invalid(f"{context}.{key} must contain only non-empty strings")
    return tuple(values)  # type: ignore[arg-type]


def _integers(table: Mapping[str, Any], key: str, context: str) -> tuple[int, ...]:
    values = _sequence(table.get(key), f"{context}.{key}")
    if any(not isinstance(value, int) or isinstance(value, bool) for value in values):
        _invalid(f"{context}.{key} must contain only integers")
    return tuple(values)  # type: ignore[arg-type]


def _enum(enum_type: type[EnumValue], value: str, context: str, label: str) -> EnumValue:
    try:
        return enum_type(value)
    except ValueError:
        _invalid(f"unknown {label} {value!r} in {context}")


def _parse_sources(raw: object) -> tuple[SourceDefinition, ...]:
    sources: list[SourceDefinition] = []
    for index, value in enumerate(_sequence(raw, "sources")):
        context = f"sources[{index}]"
        table = _mapping(value, context)
        role_text = _string(table, "role", context)
        sources.append(
            SourceDefinition(
                key=_string(table, "key", context),
                name=_string(table, "name", context),
                vintage=_string(table, "vintage", context),
                dataset_identifier=_string(table, "dataset_identifier", context),
                source_url=_string(table, "source_url", context),
                methodology_url=_string(table, "methodology_url", context),
                license_notes=_string(table, "license_notes", context),
                role=_enum(SourceRole, role_text, context, "source role"),
                freshness_policy=_string(table, "freshness_policy", context),
                immutable=_boolean(table, "immutable", context),
                max_age_days=_optional_integer(table, "max_age_days", context),
                published_checksum=_optional_string(table, "published_checksum", context),
            )
        )
    return tuple(sources)


def _parse_classifications(raw: object) -> tuple[ClassificationRule, ...]:
    rules: list[ClassificationRule] = []
    for index, value in enumerate(_sequence(raw, "classifications")):
        context = f"classifications[{index}]"
        table = _mapping(value, context)
        category_text = _string(table, "category", context)
        rules.append(
            ClassificationRule(
                source=_string(table, "source", context),
                source_value=_string(table, "source_value", context),
                category=_enum(
                    ResourceCategory,
                    category_text,
                    context,
                    "category",
                ),
                scoring_eligible=_boolean(table, "scoring_eligible", context),
                requires_override=_boolean(table, "requires_override", context),
            )
        )
    return tuple(rules)


def _parse_metrics(raw: object) -> tuple[MetricDefinition, ...]:
    metrics: list[MetricDefinition] = []
    for index, value in enumerate(_sequence(raw, "metrics")):
        context = f"metrics[{index}]"
        table = _mapping(value, context)
        treatment_text = _string(table, "treatment", context)
        treatment = _enum(MetricTreatment, treatment_text, context, "metric treatment")
        domain_text = table.get("domain")
        domain = None
        if domain_text is not None:
            if not isinstance(domain_text, str) or not domain_text:
                _invalid(f"{context}.domain must be a non-empty string when present")
            domain = _enum(Domain, domain_text, context, "domain")
        weight = Decimal(0)
        if "weight" in table:
            weight = _decimal(table, "weight", context)
        metrics.append(
            MetricDefinition(
                slug=_string(table, "slug", context),
                name=_string(table, "name", context),
                treatment=treatment,
                source=_string(table, "source", context),
                unit=_string(table, "unit", context),
                higher_is_worse=_boolean(table, "higher_is_worse", context),
                source_fields=_strings(table, "source_fields", context),
                domain=domain,
                weight=weight,
            )
        )
    return tuple(metrics)


def _parse_access(raw: object) -> AccessPolicy:
    table = _mapping(raw, "access")
    return AccessPolicy(
        origin_source=_string(table, "origin_source", "access"),
        projected_crs=_string(table, "projected_crs", "access"),
        review_buffer_miles=_decimal(table, "review_buffer_miles", "access"),
        snap_tolerance_m=_decimal(table, "snap_tolerance_m", "access"),
        walk_speed_m_per_minute=_decimal(table, "walk_speed_m_per_minute", "access"),
        walk_threshold_minutes=_integers(table, "walk_threshold_minutes", "access"),
        transit_window_start=_string(table, "transit_window_start", "access"),
        transit_window_end=_string(table, "transit_window_end", "access"),
        transit_weekdays=_strings(table, "transit_weekdays", "access"),
        transit_stop_threshold_minutes=_integer(table, "transit_stop_threshold_minutes", "access"),
        inaccessible_ranking=_string(table, "inaccessible_ranking", "access"),
    )


def _parse_bands(raw: object) -> tuple[PriorityBand, ...]:
    bands: list[PriorityBand] = []
    for index, value in enumerate(_sequence(raw, "bands")):
        context = f"bands[{index}]"
        table = _mapping(value, context)
        label_text = _string(table, "label", context)
        bands.append(
            PriorityBand(
                label=_enum(BandLabel, label_text, context, "band label"),
                minimum=_decimal(table, "minimum", context),
                maximum=_decimal(table, "maximum", context),
                includes_maximum=_boolean(table, "includes_maximum", context),
            )
        )
    return tuple(bands)


def _parse_priority_matrix(raw: object) -> Mapping[tuple[BandLabel, BandLabel], int]:
    matrix: dict[tuple[BandLabel, BandLabel], int] = {}
    for index, value in enumerate(_sequence(raw, "priority_matrix")):
        context = f"priority_matrix[{index}]"
        table = _mapping(value, context)
        equity_text = _string(table, "equity_band", context)
        need_text = _string(table, "food_need_band", context)
        key = (
            _enum(BandLabel, equity_text, context, "equity band"),
            _enum(BandLabel, need_text, context, "food-need band"),
        )
        if key in matrix:
            _invalid(f"duplicate priority matrix cell {key!r}")
        priority = _integer(table, "priority", context)
        if priority not in {1, 2, 3, 4, 5}:
            _invalid(f"{context}.priority must be between 1 and 5")
        matrix[key] = priority
    return MappingProxyType(matrix)


def _validate_sources(sources: tuple[SourceDefinition, ...]) -> None:
    keys = [source.key for source in sources]
    if len(keys) != len(set(keys)):
        _invalid("duplicate source key")
    if set(keys) != APPROVED_SOURCE_KEYS:
        _invalid("sources must define all and only approved source keys")
    for source in sources:
        if source.max_age_days is not None and source.max_age_days <= 0:
            _invalid(f"source {source.key!r} max_age_days must be positive")
        if source.freshness_policy == "verified_within_days" and source.max_age_days is None:
            _invalid(f"source {source.key!r} requires max_age_days")
        if source.role is SourceRole.SCORING and source.max_age_days is not None:
            _invalid(f"scoring source {source.key!r} cannot use contextual age tolerance")


def _validate_classifications(
    classifications: tuple[ClassificationRule, ...], sources: tuple[SourceDefinition, ...]
) -> None:
    source_keys = {source.key for source in sources}
    identities = [(rule.source, rule.source_value) for rule in classifications]
    if len(identities) != len(set(identities)):
        _invalid("duplicate classification source value")
    if any(rule.source not in source_keys for rule in classifications):
        _invalid("classification references an unknown source")
    for rule in classifications:
        if rule.requires_override and rule.scoring_eligible:
            _invalid("classification requiring an override cannot already be scoring eligible")
        if rule.scoring_eligible and rule.category is not ResourceCategory.FULL_SERVICE_GROCERY:
            _invalid("only full-service groceries may be scoring eligible")


def _validate_weights(
    domain_weights: Mapping[Domain, Decimal], metrics: tuple[MetricDefinition, ...]
) -> None:
    if set(domain_weights) != set(Domain):
        _invalid("domain weights must define all and only approved domains")
    if abs(sum(domain_weights.values()) - Decimal(1)) > WEIGHT_TOLERANCE:
        _invalid("domain weights must sum to 1")
    if max(domain_weights.values()) - min(domain_weights.values()) > WEIGHT_TOLERANCE:
        _invalid("domain weights must be equal")
    for domain in Domain:
        weights = [
            metric.weight
            for metric in metrics
            if metric.treatment is MetricTreatment.SCORING and metric.domain is domain
        ]
        if len(weights) != 2:
            _invalid(f"{domain.value} must contain exactly two scoring metrics")
        if abs(sum(weights) - Decimal(1)) > WEIGHT_TOLERANCE:
            _invalid(f"{domain.value} weights must sum to 1")
        if max(weights) - min(weights) > WEIGHT_TOLERANCE:
            _invalid(f"{domain.value} weights must be equal")


def _validate_metrics(
    metrics: tuple[MetricDefinition, ...], sources: tuple[SourceDefinition, ...], expected: int
) -> None:
    slugs = [metric.slug for metric in metrics]
    if len(slugs) != len(set(slugs)):
        _invalid("duplicate metric slug")
    source_by_key = {source.key: source for source in sources}
    if any(metric.source not in source_by_key for metric in metrics):
        _invalid("metric references an unknown source")
    scoring = [metric for metric in metrics if metric.treatment is MetricTreatment.SCORING]
    for metric in metrics:
        if metric.treatment is MetricTreatment.SCORING:
            if metric.slug == "public_investment":
                _invalid("public investment cannot be a scoring metric")
            if metric.domain is None or metric.weight <= 0:
                _invalid(f"scoring metric {metric.slug!r} requires a scoring domain and weight")
            if source_by_key[metric.source].role is not SourceRole.SCORING:
                _invalid(f"scoring metric {metric.slug!r} references a contextual source")
        elif metric.domain is not None or metric.weight != 0:
            _invalid(f"contextual metric {metric.slug!r} cannot belong to a scoring domain")
    if len(scoring) != expected or expected != 4:
        _invalid("registry must contain exactly four scoring metrics")


def _validate_access(access: AccessPolicy, source_keys: set[str]) -> None:
    if access.origin_source not in source_keys:
        _invalid("access origin references an unknown source")
    approved = (
        access.projected_crs == "EPSG:3071"
        and access.review_buffer_miles == Decimal(2)
        and access.snap_tolerance_m == Decimal(200)
        and access.walk_speed_m_per_minute == Decimal("80.4672")
        and access.walk_threshold_minutes == (10, 15, 20)
        and access.transit_window_start == "10:00:00"
        and access.transit_window_end == "14:00:00"
        and access.transit_weekdays == ("tuesday", "saturday")
        and access.transit_stop_threshold_minutes == 10
        and access.inaccessible_ranking == "above_finite_tied"
    )
    if not approved:
        _invalid("access policy differs from the approved v1 contract")


def _validate_bands(bands: tuple[PriorityBand, ...]) -> None:
    if tuple(band.label for band in bands) != tuple(BandLabel):
        _invalid("bands must define the five approved labels in order")
    if not bands or bands[0].minimum != Decimal(0) or bands[-1].maximum != Decimal(100):
        _invalid("bands must cover 0 through 100")
    for index, band in enumerate(bands):
        if band.minimum >= band.maximum:
            _invalid(f"band {band.label.value!r} must have positive width")
        if band.includes_maximum is not (index == len(bands) - 1):
            _invalid("only the final band may include its maximum")
        if index:
            prior = bands[index - 1]
            if band.minimum < prior.maximum:
                _invalid(f"bands overlap at {band.minimum}")
            if band.minimum > prior.maximum:
                _invalid(f"bands have a gap before {band.minimum}")


def _validate_priority_matrix(matrix: Mapping[tuple[BandLabel, BandLabel], int]) -> None:
    expected = {(equity, need) for equity in BandLabel for need in BandLabel}
    if set(matrix) != expected:
        _invalid("priority matrix must define all 25 band combinations")


def registry_sha256(path: Path = REGISTRY_PATH) -> str:
    """Hash the exact registry bytes committed to disk."""

    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_registry(path: Path = REGISTRY_PATH) -> MethodologyRegistry:
    """Parse and validate declarative methodology without evaluating it."""

    raw_bytes = path.read_bytes()
    try:
        root = _mapping(tomllib.loads(raw_bytes.decode("utf-8")), "registry")
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        raise RegistryValidationError(f"invalid registry TOML: {error}") from error

    domain_table = _mapping(root.get("domain_weights"), "domain_weights")
    domain_weights = MappingProxyType(
        {domain: _decimal(domain_table, domain.value, "domain_weights") for domain in Domain}
    )
    sources = _parse_sources(root.get("sources"))
    classifications = _parse_classifications(root.get("classifications"))
    metrics = _parse_metrics(root.get("metrics"))
    access = _parse_access(root.get("access"))
    bands = _parse_bands(root.get("bands"))
    matrix = _parse_priority_matrix(root.get("priority_matrix"))
    expected_count = root.get("expected_scoring_metric_count")
    if not isinstance(expected_count, int) or isinstance(expected_count, bool):
        _invalid("registry.expected_scoring_metric_count must be an integer")

    _validate_sources(sources)
    _validate_classifications(classifications, sources)
    _validate_metrics(metrics, sources, expected_count)
    _validate_weights(domain_weights, metrics)
    _validate_access(access, {source.key for source in sources})
    _validate_bands(bands)
    _validate_priority_matrix(matrix)
    if _string(root, "completeness_rule", "registry") != "all_required":
        _invalid("registry must require strict all-indicator completeness")
    if _string(root, "tie_method", "registry") != "average":
        _invalid("registry must use average ranks for ties")

    return MethodologyRegistry(
        methodology_version=_string(root, "methodology_version", "registry"),
        completeness_rule="all_required",
        tie_method="average",
        single_geography_percentile=_decimal(root, "single_geography_percentile", "registry"),
        sources=sources,
        classifications=classifications,
        metrics=metrics,
        access=access,
        domain_weights=domain_weights,
        bands=bands,
        priority_matrix=matrix,
        sha256=hashlib.sha256(raw_bytes).hexdigest(),
    )


__all__ = ["REGISTRY_PATH", "load_registry", "registry_sha256"]
