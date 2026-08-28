"""Load and validate the approved equity-baseline methodology registry."""

from __future__ import annotations

import hashlib
import tomllib
from collections.abc import Mapping, Sequence
from decimal import Decimal, InvalidOperation
from pathlib import Path
from types import MappingProxyType
from typing import Any, Never

from pipelines.equity_baseline.errors import RegistryValidationError
from pipelines.equity_baseline.models import (
    Domain,
    FormulaDefinition,
    FormulaKind,
    GeographyPolicy,
    IndicatorDefinition,
    MethodologyRegistry,
    PriorityBand,
    ReliabilityPolicy,
    SourceDefinition,
)

REGISTRY_PATH = Path(__file__).with_name("registry.toml")
WEIGHT_TOLERANCE = Decimal("1e-26")
EXPECTED_DOMAIN_COUNTS = {
    Domain.DEMOGRAPHIC: 3,
    Domain.SOCIOECONOMIC: 4,
    Domain.HEALTH: 6,
}


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


def _boolean(table: Mapping[str, Any], key: str, context: str) -> bool:
    value = table.get(key)
    if not isinstance(value, bool):
        _invalid(f"{context}.{key} must be a boolean")
    return value


def _decimal(table: Mapping[str, Any], key: str, context: str) -> Decimal:
    raw = _string(table, key, context)
    try:
        return Decimal(raw)
    except InvalidOperation:
        _invalid(f"{context}.{key} must be a decimal string")


def _strings(table: Mapping[str, Any], key: str, context: str) -> tuple[str, ...]:
    values = table.get(key, [])
    sequence = _sequence(values, f"{context}.{key}")
    if any(not isinstance(value, str) or not value for value in sequence):
        _invalid(f"{context}.{key} must contain only non-empty strings")
    return tuple(sequence)  # type: ignore[arg-type]


def _enum_value(enum_type: type[Domain] | type[FormulaKind], value: str, context: str) -> Any:
    try:
        return enum_type(value)
    except ValueError:
        label = "formula type" if enum_type is FormulaKind else "domain"
        _invalid(f"unknown {label} {value!r} in {context}")


def _parse_formula(table: Mapping[str, Any], context: str) -> FormulaDefinition:
    kind_text = _string(table, "type", context)
    kind = _enum_value(FormulaKind, kind_text, context)
    formula = FormulaDefinition(
        kind=kind,
        numerator=_strings(table, "numerator", context),
        numerator_subtract=_strings(table, "numerator_subtract", context),
        denominator=_strings(table, "denominator", context),
        denominator_subtract=_strings(table, "denominator_subtract", context),
        measure_id=table.get("measure_id"),
        data_value_type_id=table.get("data_value_type_id"),
    )
    if kind is FormulaKind.PLACES_MEASURE:
        if not isinstance(formula.measure_id, str) or not formula.measure_id:
            _invalid(f"{context} requires a PLACES measure_id")
        if formula.data_value_type_id != "CrdPrv":
            _invalid(f"{context} requires PLACES data_value_type_id 'CrdPrv'")
        if formula.estimate_variables:
            _invalid(f"{context} cannot mix PLACES and ACS variables")
        return formula

    if formula.measure_id is not None or formula.data_value_type_id is not None:
        _invalid(f"{context} cannot attach PLACES identifiers to an ACS formula")
    if not formula.numerator:
        _invalid(f"{context} requires numerator variables")
    if not formula.denominator:
        _invalid(f"{context} requires denominator variables")
    if any(not variable.endswith("E") for variable in formula.estimate_variables):
        _invalid(f"{context} ACS variables must be estimate variables ending in E")
    if kind is FormulaKind.DIFFERENCE_RATIO and not formula.numerator_subtract:
        _invalid(f"{context} difference_ratio requires numerator_subtract variables")
    return formula


def _parse_indicators(raw: object) -> tuple[IndicatorDefinition, ...]:
    indicators: list[IndicatorDefinition] = []
    for index, value in enumerate(_sequence(raw, "indicators")):
        context = f"indicators[{index}]"
        table = _mapping(value, context)
        formula = _parse_formula(
            _mapping(table.get("formula"), f"{context}.formula"), f"{context}.formula"
        )
        domain_text = _string(table, "domain", context)
        indicators.append(
            IndicatorDefinition(
                slug=_string(table, "slug", context),
                name=_string(table, "name", context),
                domain=_enum_value(Domain, domain_text, context),
                source=_string(table, "source", context),
                vintage=_string(table, "vintage", context),
                unit=_string(table, "unit", context),
                higher_is_worse=_boolean(table, "higher_is_worse", context),
                baseline_included=_boolean(table, "baseline_included", context),
                within_domain_weight=_decimal(table, "within_domain_weight", context),
                formula=formula,
            )
        )
    return tuple(indicators)


def _parse_sources(raw: object) -> tuple[SourceDefinition, ...]:
    sources: list[SourceDefinition] = []
    for index, value in enumerate(_sequence(raw, "sources")):
        context = f"sources[{index}]"
        table = _mapping(value, context)
        sources.append(
            SourceDefinition(
                key=_string(table, "key", context),
                name=_string(table, "name", context),
                vintage=_string(table, "vintage", context),
                dataset_identifier=_string(table, "dataset_identifier", context),
                license_notes=_string(table, "license_notes", context),
            )
        )
    return tuple(sources)


def _parse_bands(raw: object) -> tuple[PriorityBand, ...]:
    bands: list[PriorityBand] = []
    for index, value in enumerate(_sequence(raw, "bands")):
        context = f"bands[{index}]"
        table = _mapping(value, context)
        bands.append(
            PriorityBand(
                label=_string(table, "label", context),
                minimum=_decimal(table, "minimum", context),
                maximum=_decimal(table, "maximum", context),
                includes_maximum=_boolean(table, "includes_maximum", context),
            )
        )
    return tuple(bands)


def _validate_weights(
    domain_weights: Mapping[Domain, Decimal], indicators: tuple[IndicatorDefinition, ...]
) -> None:
    if set(domain_weights) != set(Domain):
        _invalid("domain weights must define all and only approved domains")
    if abs(sum(domain_weights.values()) - Decimal(1)) > WEIGHT_TOLERANCE:
        _invalid("domain weights must sum to 1")
    if max(domain_weights.values()) - min(domain_weights.values()) > WEIGHT_TOLERANCE:
        _invalid("domain weights must be equal")
    for domain in Domain:
        weights = [item.within_domain_weight for item in indicators if item.domain is domain]
        if abs(sum(weights) - Decimal(1)) > WEIGHT_TOLERANCE:
            _invalid(f"{domain.value} weights must sum to 1")
        if max(weights) - min(weights) > WEIGHT_TOLERANCE:
            _invalid(f"{domain.value} weights must be equal")


def _validate_bands(bands: tuple[PriorityBand, ...]) -> None:
    if not bands or bands[0].minimum != Decimal(0) or bands[-1].maximum != Decimal(100):
        _invalid("priority bands must cover 0 through 100")
    for index, band in enumerate(bands):
        if band.minimum >= band.maximum:
            _invalid(f"priority band {band.label!r} must have positive width")
        if band.includes_maximum is not (index == len(bands) - 1):
            _invalid("only the final priority band may include its maximum")
        if index:
            prior = bands[index - 1]
            if band.minimum < prior.maximum:
                _invalid(f"priority bands overlap at {band.minimum}")
            if band.minimum > prior.maximum:
                _invalid(f"priority bands have a gap before {band.minimum}")


def _validate_registry(registry: MethodologyRegistry, expected_count: int) -> None:
    if len(registry.indicators) != expected_count or expected_count != 13:
        _invalid("registry must contain exactly 13 indicators")
    slugs = [indicator.slug for indicator in registry.indicators]
    if len(slugs) != len(set(slugs)):
        _invalid("duplicate indicator slug")
    source_keys = {source.key for source in registry.sources}
    if len(source_keys) != len(registry.sources):
        _invalid("duplicate source key")
    if any(indicator.source not in source_keys for indicator in registry.indicators):
        _invalid("indicator references an unknown source")
    counts = {
        domain: sum(indicator.domain is domain for indicator in registry.indicators)
        for domain in Domain
    }
    if counts != EXPECTED_DOMAIN_COUNTS:
        _invalid("registry must contain the approved 3/4/6 domain distribution")
    if any(not indicator.higher_is_worse for indicator in registry.indicators):
        _invalid("all approved indicators must use higher-is-worse direction")
    if any(not indicator.baseline_included for indicator in registry.indicators):
        _invalid("all 13 approved indicators must be included in the baseline")
    if registry.completeness_rule != "all_required":
        _invalid("registry must require strict all-indicator completeness")
    if registry.tie_method != "average":
        _invalid("registry must use average ranks for ties")
    _validate_weights(registry.domain_weights, registry.indicators)
    _validate_bands(registry.bands)


def registry_sha256(path: Path = REGISTRY_PATH) -> str:
    """Hash the exact registry bytes committed to disk."""

    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_registry(path: Path = REGISTRY_PATH) -> MethodologyRegistry:
    """Parse and validate a methodology registry without evaluating its content."""

    raw_bytes = path.read_bytes()
    try:
        root = _mapping(tomllib.loads(raw_bytes.decode("utf-8")), "registry")
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as error:
        raise RegistryValidationError(f"invalid registry TOML: {error}") from error

    domain_table = _mapping(root.get("domain_weights"), "domain_weights")
    domain_weights = MappingProxyType(
        {domain: _decimal(domain_table, domain.value, "domain_weights") for domain in Domain}
    )
    geography_table = _mapping(root.get("geography"), "geography")
    reliability_table = _mapping(root.get("acs_reliability"), "acs_reliability")
    registry = MethodologyRegistry(
        methodology_version=_string(root, "methodology_version", "registry"),
        completeness_rule=_string(root, "completeness_rule", "registry"),
        tie_method=_string(root, "tie_method", "registry"),
        single_geography_percentile=_decimal(root, "single_geography_percentile", "registry"),
        sources=_parse_sources(root.get("sources")),
        geography=GeographyPolicy(
            source=_string(geography_table, "source", "geography"),
            vintage=_string(geography_table, "vintage", "geography"),
            state_fips=_string(geography_table, "state_fips", "geography"),
            county_fips=_string(geography_table, "county_fips", "geography"),
            population_variable=_string(geography_table, "population_variable", "geography"),
            positive_population_status=_string(
                geography_table, "positive_population_status", "geography"
            ),
            zero_population_status=_string(geography_table, "zero_population_status", "geography"),
            missing_population_status=_string(
                geography_table, "missing_population_status", "geography"
            ),
        ),
        reliability=ReliabilityPolicy(
            reliable_max_cv=_decimal(reliability_table, "reliable_max_cv", "acs_reliability"),
            caution_max_cv=_decimal(reliability_table, "caution_max_cv", "acs_reliability"),
            zero_estimate_status=_string(
                reliability_table, "zero_estimate_status", "acs_reliability"
            ),
            excludes_from_scoring=_boolean(
                reliability_table, "excludes_from_scoring", "acs_reliability"
            ),
        ),
        domain_weights=domain_weights,
        indicators=_parse_indicators(root.get("indicators")),
        bands=_parse_bands(root.get("bands")),
        sha256=hashlib.sha256(raw_bytes).hexdigest(),
    )
    expected_count = root.get("expected_indicator_count")
    if not isinstance(expected_count, int) or isinstance(expected_count, bool):
        _invalid("registry.expected_indicator_count must be an integer")
    _validate_registry(registry, expected_count)
    return registry
