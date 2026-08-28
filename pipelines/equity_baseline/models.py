"""Immutable methodology-registry models."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Mapping


class Domain(StrEnum):
    """Approved equity-baseline domains."""

    DEMOGRAPHIC = "demographic"
    SOCIOECONOMIC = "socioeconomic"
    HEALTH = "health"


class FormulaKind(StrEnum):
    """Closed set of formula shapes that the pipeline may interpret."""

    RATIO = "ratio"
    SUM_RATIO = "sum_ratio"
    DIFFERENCE_RATIO = "difference_ratio"
    PLACES_MEASURE = "places_measure"


@dataclass(frozen=True, slots=True)
class SourceDefinition:
    """Approved upstream source identity and release."""

    key: str
    name: str
    vintage: str
    dataset_identifier: str
    license_notes: str


@dataclass(frozen=True, slots=True)
class GeographyPolicy:
    """Geographic universe and population-eligibility policy."""

    source: str
    vintage: str
    state_fips: str
    county_fips: str
    population_variable: str
    positive_population_status: str
    zero_population_status: str
    missing_population_status: str


@dataclass(frozen=True, slots=True)
class ReliabilityPolicy:
    """ACS coefficient-of-variation display thresholds."""

    reliable_max_cv: Decimal
    caution_max_cv: Decimal
    zero_estimate_status: str
    excludes_from_scoring: bool


@dataclass(frozen=True, slots=True)
class FormulaDefinition:
    """Declarative, non-executable indicator formula."""

    kind: FormulaKind
    numerator: tuple[str, ...] = ()
    numerator_subtract: tuple[str, ...] = ()
    denominator: tuple[str, ...] = ()
    denominator_subtract: tuple[str, ...] = ()
    measure_id: str | None = None
    data_value_type_id: str | None = None

    @property
    def estimate_variables(self) -> tuple[str, ...]:
        """Return required ACS estimate variables in stable, unique order."""

        variables = (
            self.numerator + self.numerator_subtract + self.denominator + self.denominator_subtract
        )
        return tuple(dict.fromkeys(variables))

    @property
    def margin_of_error_variables(self) -> tuple[str, ...]:
        """Derive the matching ACS margin-of-error variables."""

        return tuple(f"{variable[:-1]}M" for variable in self.estimate_variables)


@dataclass(frozen=True, slots=True)
class IndicatorDefinition:
    """One approved baseline indicator."""

    slug: str
    name: str
    domain: Domain
    source: str
    vintage: str
    unit: str
    higher_is_worse: bool
    baseline_included: bool
    within_domain_weight: Decimal
    formula: FormulaDefinition


@dataclass(frozen=True, slots=True)
class PriorityBand:
    """A contiguous equity-priority classification interval."""

    label: str
    minimum: Decimal
    maximum: Decimal
    includes_maximum: bool


@dataclass(frozen=True, slots=True)
class MethodologyRegistry:
    """Validated and immutable equity-baseline methodology contract."""

    methodology_version: str
    completeness_rule: str
    tie_method: str
    single_geography_percentile: Decimal
    sources: tuple[SourceDefinition, ...]
    geography: GeographyPolicy
    reliability: ReliabilityPolicy
    domain_weights: Mapping[Domain, Decimal]
    indicators: tuple[IndicatorDefinition, ...]
    bands: tuple[PriorityBand, ...]
    sha256: str
