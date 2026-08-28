"""Acquire and normalize the approved 2024 ACS 5-year equity indicators."""

from __future__ import annotations

import json
import os
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from types import MappingProxyType
from typing import Callable, TypeAlias, cast
from urllib.parse import urlencode

from pipelines.equity_baseline.artifacts import StoredSnapshot, preserve_snapshot
from pipelines.equity_baseline.errors import AcsGeographyError, AcsSourceError
from pipelines.equity_baseline.http import Opener, Sleeper, fetch_bytes
from pipelines.equity_baseline.models import FormulaDefinition, FormulaKind, MethodologyRegistry
from pipelines.equity_baseline.quality import (
    ReliabilityState,
    coefficient_of_variation,
    proportion_margin_of_error,
    sum_or_difference_margin_of_error,
)
from pipelines.equity_baseline.registry import load_registry

ACS_2024_5_YEAR_ENDPOINT = "https://api.census.gov/data/2024/acs/acs5"
APPROVED_ACS_GROUPS = (
    "B01003",
    "B03002",
    "C16001",
    "B05002",
    "C17002",
    "B23025",
    "B15003",
    "B25106",
)
JAM_VALUE_MAXIMUM = Decimal("-100000000")
GEOID_PATTERN = re.compile(r"^\d{11}$")
JsonResponse: TypeAlias = list[list[str | None]]


@dataclass(frozen=True, slots=True)
class AcsGroupRequest:
    """One approved group request and its credential-free manifest metadata."""

    group: str
    url: str
    manifest_metadata: Mapping[str, str]


@dataclass(frozen=True, slots=True)
class AcsCell:
    """One ACS estimate/MOE pair after annotation and jam-value validation."""

    estimate: Decimal | None
    margin_of_error: Decimal | None
    unusable_reason: str | None


@dataclass(frozen=True, slots=True)
class AcsPopulation:
    """Population retained as an explicit later-stage eligibility input."""

    geoid: str
    value: Decimal | None
    margin_of_error: Decimal | None
    quality_status: str
    quality_reason: str | None


@dataclass(frozen=True, slots=True)
class AcsObservation:
    """One normalized ACS indicator, including uncertainty and quality state."""

    geoid: str
    indicator_slug: str
    value: Decimal | None
    margin_of_error: Decimal | None
    coefficient_of_variation: Decimal | None
    reliability: ReliabilityState | None
    quality_status: str
    quality_reason: str | None
    quality_metadata: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class AcsNormalizationResult:
    """Complete population and seven-indicator output for canonical tracts."""

    populations: tuple[AcsPopulation, ...]
    observations: tuple[AcsObservation, ...]


@dataclass(frozen=True, slots=True)
class FetchedAcsGroup:
    """Exact fetched bytes and their immutable provenance snapshot."""

    group: str
    content: bytes
    snapshot: StoredSnapshot


@dataclass(frozen=True, slots=True)
class ParsedGroup:
    """Validated group rows plus duplicate identifiers retained for reporting."""

    rows: Mapping[str, Mapping[str, AcsCell]]
    duplicate_geoids: tuple[str, ...]


def build_group_request(group: str) -> AcsGroupRequest:
    """Build one bounded group request, reading the optional key at call time."""

    if group not in APPROVED_ACS_GROUPS:
        raise AcsSourceError(f"{group!r} is not an approved ACS group")
    metadata = {
        "get": f"NAME,group({group})",
        "for": "tract:*",
        "in": "state:55 county:079",
        "group": group,
    }
    query = {key: value for key, value in metadata.items() if key != "group"}
    api_key = os.getenv("CENSUS_API_KEY")
    if api_key:
        query["key"] = api_key
    return AcsGroupRequest(
        group=group,
        url=f"{ACS_2024_5_YEAR_ENDPOINT}?{urlencode(query)}",
        manifest_metadata=MappingProxyType(metadata),
    )


def _required_estimates(registry: MethodologyRegistry) -> dict[str, tuple[str, ...]]:
    grouped: dict[str, set[str]] = {group: set() for group in APPROVED_ACS_GROUPS}
    grouped["B01003"].add(registry.geography.population_variable)
    for indicator in registry.indicators:
        if indicator.source != "acs":
            continue
        for variable in indicator.formula.estimate_variables:
            group = variable.split("_", 1)[0]
            if group not in grouped:
                raise AcsSourceError(f"registry uses unapproved ACS group {group!r}")
            grouped[group].add(variable)
    return {group: tuple(sorted(variables)) for group, variables in grouped.items()}


def validate_group_metadata(
    group: str,
    metadata: Mapping[str, object],
    *,
    required_estimates: Sequence[str],
) -> None:
    """Validate an official group-metadata payload before normalizing values."""

    variables = metadata.get("variables")
    if not isinstance(variables, Mapping):
        raise AcsSourceError(f"ACS group {group} metadata has no variables table")
    required_headers = _variable_headers(required_estimates)
    missing = sorted(required_headers - set(cast(Mapping[object, object], variables)))
    if missing:
        raise AcsSourceError(f"ACS group {group} metadata missing variables: {missing}")
    for header in required_headers:
        definition = variables[header]
        if not isinstance(definition, Mapping):
            raise AcsSourceError(f"ACS metadata variable {header} must be an object")
        declared_group = definition.get("group")
        if declared_group is not None and declared_group != group:
            raise AcsSourceError(
                f"ACS metadata variable {header} declares unexpected group {declared_group!r}"
            )


def _variable_headers(required_estimates: Sequence[str]) -> set[str]:
    headers: set[str] = set()
    for estimate in required_estimates:
        base = estimate[:-1]
        headers.update((estimate, f"{base}M", f"{base}EA", f"{base}MA"))
    return headers


def _decode_response(group: str, content: bytes) -> JsonResponse:
    try:
        raw = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AcsSourceError(f"ACS group {group} response is not valid JSON") from error
    if not isinstance(raw, list) or len(raw) < 2 or any(not isinstance(row, list) for row in raw):
        raise AcsSourceError(f"ACS group {group} response must be a header and data rows")
    if any(any(value is not None and not isinstance(value, str) for value in row) for row in raw):
        raise AcsSourceError(f"ACS group {group} response cells must be strings or null")
    return cast(JsonResponse, raw)


def _annotation_present(raw: str | None) -> bool:
    return raw is not None and raw.strip().casefold() not in {"", "null"}


def _decimal_cell(raw: str | None, missing_reason: str) -> tuple[Decimal | None, str | None]:
    if raw is None or not raw.strip() or raw.strip().casefold() == "null":
        return None, missing_reason
    try:
        value = Decimal(raw)
    except InvalidOperation:
        return None, "invalid_number"
    if not value.is_finite():
        return None, "invalid_number"
    if value <= JAM_VALUE_MAXIMUM:
        return None, "jam_value"
    return value, None


def _parse_cell(row: Mapping[str, str | None], estimate_header: str) -> AcsCell:
    base = estimate_header[:-1]
    estimate_annotation = row[f"{base}EA"]
    margin_annotation = row[f"{base}MA"]
    if _annotation_present(estimate_annotation):
        return AcsCell(None, None, "estimate_annotation")
    if _annotation_present(margin_annotation):
        return AcsCell(None, None, "margin_of_error_annotation")
    estimate, estimate_error = _decimal_cell(row[estimate_header], "missing_estimate")
    if estimate_error is not None:
        return AcsCell(None, None, estimate_error)
    margin, margin_error = _decimal_cell(row[f"{base}M"], "missing_margin_of_error")
    if margin_error is not None:
        return AcsCell(None, None, margin_error)
    if margin is not None and margin < 0:
        return AcsCell(None, None, "jam_value")
    return AcsCell(estimate, margin, None)


def parse_group_response(
    group: str,
    content: bytes,
    *,
    required_estimates: Sequence[str],
) -> ParsedGroup:
    """Validate and parse a raw Census group response without dropping duplicates."""

    payload = _decode_response(group, content)
    raw_headers = payload[0]
    if any(header is None for header in raw_headers):
        raise AcsSourceError(f"ACS group {group} response contains a null header")
    headers = cast(list[str], raw_headers)
    if len(headers) != len(set(headers)):
        raise AcsSourceError(f"ACS group {group} response contains duplicate headers")
    required_headers = {"NAME", "state", "county", "tract"} | _variable_headers(
        required_estimates
    )
    missing_headers = sorted(required_headers - set(headers))
    if missing_headers:
        raise AcsSourceError(
            f"ACS group {group} response missing required headers: {missing_headers}"
        )

    rows: dict[str, Mapping[str, AcsCell]] = {}
    duplicates: set[str] = set()
    for position, values in enumerate(payload[1:], start=1):
        if len(values) != len(headers):
            raise AcsSourceError(f"ACS group {group} row {position} has the wrong width")
        source = dict(zip(headers, values, strict=True))
        geoid = f"{source['state'] or ''}{source['county'] or ''}{source['tract'] or ''}"
        if not GEOID_PATTERN.fullmatch(geoid):
            raise AcsGeographyError(f"ACS group {group} contains invalid GEOID {geoid!r}")
        if geoid in rows:
            duplicates.add(geoid)
            continue
        rows[geoid] = MappingProxyType(
            {variable: _parse_cell(source, variable) for variable in required_estimates}
        )
    return ParsedGroup(MappingProxyType(rows), tuple(sorted(duplicates)))


def fetch_and_preserve_acs_groups(
    root: Path,
    *,
    clock: Callable[[], datetime],
    registry: MethodologyRegistry | None = None,
    opener: Opener | None = None,
    sleeper: Sleeper | None = None,
) -> tuple[FetchedAcsGroup, ...]:
    """Fetch each approved group once on success and preserve its exact bytes."""

    methodology = registry or load_registry()
    required = _required_estimates(methodology)
    source = next(item for item in methodology.sources if item.key == "acs")
    fetched: list[FetchedAcsGroup] = []
    for group in APPROVED_ACS_GROUPS:
        request = build_group_request(group)

        def validate(content: bytes, current_group: str = group) -> None:
            parse_group_response(
                current_group,
                content,
                required_estimates=required[current_group],
            )

        if opener is None and sleeper is None:
            content = fetch_bytes(request.url, validator=validate)
        elif opener is None:
            content = fetch_bytes(request.url, sleeper=cast(Sleeper, sleeper), validator=validate)
        elif sleeper is None:
            content = fetch_bytes(request.url, opener=opener, validator=validate)
        else:
            content = fetch_bytes(
                request.url,
                opener=opener,
                sleeper=sleeper,
                validator=validate,
            )
        payload = _decode_response(group, content)
        snapshot = preserve_snapshot(
            root=root,
            source_key=f"acs-{group.casefold()}",
            source_url=request.url,
            dataset_version=source.vintage,
            content=content,
            schema={"columns": payload[0]},
            row_or_feature_count=len(payload) - 1,
            license=source.license_notes,
            methodology_reference=methodology.methodology_version,
            request_metadata=dict(request.manifest_metadata),
            clock=clock,
        )
        fetched.append(FetchedAcsGroup(group, content, snapshot))
    return tuple(fetched)


def derive_percentage(
    formula: FormulaDefinition,
    estimates: Mapping[str, Decimal],
) -> tuple[Decimal, Decimal, Decimal]:
    """Evaluate one closed formula shape and return value, numerator, denominator."""

    if formula.kind not in {
        FormulaKind.RATIO,
        FormulaKind.SUM_RATIO,
        FormulaKind.DIFFERENCE_RATIO,
    }:
        raise AcsSourceError(f"unsupported ACS formula type {formula.kind.value!r}")
    numerator = sum((estimates[name] for name in formula.numerator), start=Decimal(0))
    numerator -= sum(
        (estimates[name] for name in formula.numerator_subtract), start=Decimal(0)
    )
    denominator = sum((estimates[name] for name in formula.denominator), start=Decimal(0))
    denominator -= sum(
        (estimates[name] for name in formula.denominator_subtract), start=Decimal(0)
    )
    if denominator <= 0:
        raise ValueError("nonpositive_denominator")
    return numerator / denominator * Decimal(100), numerator, denominator


def _missing_observation(geoid: str, slug: str, reason: str) -> AcsObservation:
    return AcsObservation(
        geoid=geoid,
        indicator_slug=slug,
        value=None,
        margin_of_error=None,
        coefficient_of_variation=None,
        reliability=None,
        quality_status="missing",
        quality_reason=reason,
        quality_metadata=MappingProxyType({"reason": reason}),
    )


def _normalize_observation(
    geoid: str,
    slug: str,
    formula: FormulaDefinition,
    cells: Mapping[str, AcsCell],
    registry: MethodologyRegistry,
) -> AcsObservation:
    for variable in formula.estimate_variables:
        cell = cells[variable]
        if cell.unusable_reason is not None:
            return _missing_observation(
                geoid, slug, f"{cell.unusable_reason}:{variable}"
            )
    estimates = {
        variable: cast(Decimal, cells[variable].estimate)
        for variable in formula.estimate_variables
    }
    try:
        value, numerator, denominator = derive_percentage(formula, estimates)
    except ValueError as error:
        if str(error) == "nonpositive_denominator":
            return _missing_observation(geoid, slug, "nonpositive_denominator")
        raise
    if value < 0 or value > 100:
        return _missing_observation(geoid, slug, "out_of_range")

    numerator_variables = formula.numerator + formula.numerator_subtract
    denominator_variables = formula.denominator + formula.denominator_subtract
    numerator_moe = sum_or_difference_margin_of_error(
        tuple(cast(Decimal, cells[variable].margin_of_error) for variable in numerator_variables)
    )
    denominator_moe = sum_or_difference_margin_of_error(
        tuple(cast(Decimal, cells[variable].margin_of_error) for variable in denominator_variables)
    )
    margin = proportion_margin_of_error(
        numerator=numerator,
        denominator=denominator,
        numerator_moe=numerator_moe,
        denominator_moe=denominator_moe,
    )
    reliability = coefficient_of_variation(value, margin, registry.reliability)
    return AcsObservation(
        geoid=geoid,
        indicator_slug=slug,
        value=value,
        margin_of_error=margin,
        coefficient_of_variation=reliability.cv,
        reliability=reliability.state,
        quality_status="verified",
        quality_reason=None,
        quality_metadata=MappingProxyType(
            {
                "cv_state": reliability.state.value,
                "source_confidence_level": "90_percent",
            }
        ),
    )


def normalize_acs(
    group_responses: Mapping[str, bytes],
    *,
    expected_geoids: Sequence[str],
    registry: MethodologyRegistry | None = None,
    group_metadata: Mapping[str, Mapping[str, object]] | None = None,
) -> AcsNormalizationResult:
    """Normalize ACS population and seven indicators for an exact tract universe."""

    methodology = registry or load_registry()
    supplied = set(group_responses)
    approved = set(APPROVED_ACS_GROUPS)
    missing_groups = sorted(approved - supplied)
    extra_groups = sorted(supplied - approved)
    if missing_groups or extra_groups:
        raise AcsSourceError(
            f"ACS response group mismatch: missing groups={missing_groups}; extra groups={extra_groups}"
        )
    if len(expected_geoids) != len(set(expected_geoids)):
        raise AcsGeographyError("canonical expected GEOIDs must be unique")
    expected = set(expected_geoids)
    required = _required_estimates(methodology)
    if group_metadata is not None:
        if set(group_metadata) != approved:
            raise AcsSourceError("ACS group metadata must cover all and only approved groups")
        for group in APPROVED_ACS_GROUPS:
            validate_group_metadata(
                group, group_metadata[group], required_estimates=required[group]
            )

    parsed: dict[str, ParsedGroup] = {}
    for group in APPROVED_ACS_GROUPS:
        parsed[group] = parse_group_response(
            group, group_responses[group], required_estimates=required[group]
        )
        actual = set(parsed[group].rows)
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        duplicate = list(parsed[group].duplicate_geoids)
        if missing or extra or duplicate:
            raise AcsGeographyError(
                f"ACS group {group} geography mismatch: missing={missing}; "
                f"extra={extra}; duplicate={duplicate}"
            )

    populations: list[AcsPopulation] = []
    observations: list[AcsObservation] = []
    population_variable = methodology.geography.population_variable
    for geoid in sorted(expected):
        population_cell = parsed["B01003"].rows[geoid][population_variable]
        if population_cell.unusable_reason is not None:
            populations.append(
                AcsPopulation(
                    geoid,
                    None,
                    None,
                    "missing",
                    f"{population_cell.unusable_reason}:{population_variable}",
                )
            )
        elif cast(Decimal, population_cell.estimate) < 0:
            populations.append(AcsPopulation(geoid, None, None, "missing", "invalid_population"))
        else:
            populations.append(
                AcsPopulation(
                    geoid,
                    population_cell.estimate,
                    population_cell.margin_of_error,
                    "verified",
                    None,
                )
            )

        cells: dict[str, AcsCell] = {}
        for group in APPROVED_ACS_GROUPS:
            cells.update(parsed[group].rows[geoid])
        for indicator in methodology.indicators:
            if indicator.source == "acs":
                observations.append(
                    _normalize_observation(
                        geoid, indicator.slug, indicator.formula, cells, methodology
                    )
                )
    observations.sort(key=lambda item: (item.geoid, item.indicator_slug))
    return AcsNormalizationResult(tuple(populations), tuple(observations))


__all__ = [
    "ACS_2024_5_YEAR_ENDPOINT",
    "APPROVED_ACS_GROUPS",
    "AcsGeographyError",
    "AcsSourceError",
    "build_group_request",
    "derive_percentage",
    "fetch_and_preserve_acs_groups",
    "normalize_acs",
    "parse_group_response",
    "validate_group_metadata",
]
