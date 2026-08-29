"""Immutable food-equity methodology-registry models."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Mapping


class SourceRole(StrEnum):
    SCORING = "scoring"
    CONTEXTUAL = "contextual"


class Domain(StrEnum):
    RETAIL_ACCESS = "retail_access"
    TRANSPORTATION_CONSTRAINT = "transportation_constraint"


class MetricTreatment(StrEnum):
    SCORING = "scoring"
    CONTEXTUAL = "contextual"
    DEFERRED = "deferred"


class ResourceCategory(StrEnum):
    FULL_SERVICE_GROCERY = "full_service_grocery"
    CANDIDATE_FULL_SERVICE = "candidate_full_service"
    GROCERY_OTHER = "grocery_other"
    CONVENIENCE = "convenience"
    COMBINATION_GROCERY_OTHER = "combination_grocery_other"
    SPECIALTY_BAKERY = "specialty_bakery"
    SPECIALTY_PRODUCE = "specialty_produce"
    SPECIALTY_MEAT = "specialty_meat"
    SPECIALTY_SEAFOOD = "specialty_seafood"
    SEASONAL_OR_DIRECT = "seasonal_or_direct"
    RESTRICTED_ACCESS = "restricted_access"
    NON_FIXED_OR_ONLINE = "non_fixed_or_online"
    EMERGENCY_FOOD_BANK = "emergency_food_bank"
    EMERGENCY_FOOD_PANTRY = "emergency_food_pantry"
    EMERGENCY_PANTRY_RECOVERY = "emergency_pantry_recovery"
    EMERGENCY_MEAL_PROGRAM = "emergency_meal_program"
    UNVERIFIED = "unverified"


class BandLabel(StrEnum):
    VERY_LOW = "Very Low"
    LOW = "Low"
    MODERATE = "Moderate"
    HIGH = "High"
    VERY_HIGH = "Very High"


@dataclass(frozen=True, slots=True)
class SourceDefinition:
    key: str
    name: str
    vintage: str
    dataset_identifier: str
    source_url: str
    methodology_url: str
    license_notes: str
    role: SourceRole
    freshness_policy: str
    immutable: bool
    max_age_days: int | None = None
    published_checksum: str | None = None


@dataclass(frozen=True, slots=True)
class ClassificationRule:
    source: str
    source_value: str
    category: ResourceCategory
    scoring_eligible: bool
    requires_override: bool


@dataclass(frozen=True, slots=True)
class MetricDefinition:
    slug: str
    name: str
    treatment: MetricTreatment
    source: str
    unit: str
    higher_is_worse: bool
    source_fields: tuple[str, ...]
    domain: Domain | None = None
    weight: Decimal = Decimal(0)


@dataclass(frozen=True, slots=True)
class AccessPolicy:
    origin_source: str
    projected_crs: str
    review_buffer_miles: Decimal
    snap_tolerance_m: Decimal
    walk_speed_m_per_minute: Decimal
    walk_threshold_minutes: tuple[int, ...]
    transit_window_start: str
    transit_window_end: str
    transit_weekdays: tuple[str, ...]
    transit_stop_threshold_minutes: int
    inaccessible_ranking: str


@dataclass(frozen=True, slots=True)
class PriorityBand:
    label: BandLabel
    minimum: Decimal
    maximum: Decimal
    includes_maximum: bool


@dataclass(frozen=True, slots=True)
class MethodologyRegistry:
    methodology_version: str
    completeness_rule: str
    tie_method: str
    single_geography_percentile: Decimal
    sources: tuple[SourceDefinition, ...]
    classifications: tuple[ClassificationRule, ...]
    metrics: tuple[MetricDefinition, ...]
    access: AccessPolicy
    domain_weights: Mapping[Domain, Decimal]
    bands: tuple[PriorityBand, ...]
    priority_matrix: Mapping[tuple[BandLabel, BandLabel], int]
    sha256: str

    def priority(self, equity_band: BandLabel, food_need_band: BandLabel) -> int:
        """Return the direct approved matrix lookup."""

        return self.priority_matrix[(equity_band, food_need_band)]
