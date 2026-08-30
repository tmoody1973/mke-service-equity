"""Pure deterministic Food Access Need and Food Equity Priority scoring."""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_EVEN, Decimal, localcontext
from enum import Enum
from fractions import Fraction
from types import MappingProxyType
from typing import TYPE_CHECKING, TypeAlias
from uuid import UUID

from pipelines.food_equity.errors import FoodEquityError
from pipelines.food_equity.models import (
    BandLabel,
    Domain,
    MethodologyRegistry,
    MetricDefinition,
    MetricTreatment,
)
from pipelines.food_equity.registry import load_registry

if TYPE_CHECKING:
    from pipelines.food_equity.accessibility import TransitAccessResult, WalkingAccessResult
    from pipelines.food_equity.sram import SramRecord
    from pipelines.food_equity.vehicle_access import VehicleAccessObservation

OUTPUT_QUANTUM = Decimal("0.000000000001")
USABLE_QUALITY_STATUSES = frozenset({"verified", "provisional", "stale"})
UNAVAILABLE_STATES = frozenset({"missing", "suppressed", "conflicting"})
KNOWN_QUALITY_STATUSES = USABLE_QUALITY_STATUSES | UNAVAILABLE_STATES
GROCERY_WALK_SLUG = "full_service_grocery_walk_access"
SCORING_SOURCE_KEYS = frozenset(
    {
        "acs_vehicle",
        "mcts_gtfs",
        "snap_retailers",
        "sram",
        "tract_origins",
        "walking_network",
    }
)
SOURCE_KEY_ORDER = (
    "sram",
    "snap_retailers",
    "acs_vehicle",
    "tract_origins",
    "mcts_gtfs",
    "walking_network",
)
PINNED_BASELINE_RUN_ID = "502e2a04-b013-53cd-8b09-c9144862701a"
PINNED_BASELINE_OUTPUT_HASH = "19069c257e8f51fb4370b1ec8d04c6f823bd85e133846cf504866404c2c4e946"
PINNED_BASELINE_METHODOLOGY = "equity-baseline-v1"
PINNED_BASELINE_REGISTRY_HASH = "8e31bf6f2d89963d24bb76f2074cafc8848a69ca147e6015cc83716ce5fcbfc2"
PINNED_BASELINE_RUN_FINGERPRINT = "125f23262552c9179d6dae2be69b44b30042ee5bdfdc9c5188087d73b6d531e8"
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
APPROVED_WALKING_GRAPH_VERSION = "walking-network-v1"
APPROVED_ACCESSIBILITY_CALCULATION_VERSION = "food-accessibility-v1"
APPROVED_GTFS_STOP_PROJECTION_VERSION = "gtfs-stops-epsg3071-v1"
PROHIBITED_CONTEXT_METADATA_TOKENS = (
    "public_invest",
    "emergency_food",
    "full_service_grocery_counts_context",
    "count_within_",
)

ExactNumber: TypeAlias = Decimal | Fraction
RankKey: TypeAlias = tuple[int, Fraction]
JsonValue: TypeAlias = None | bool | int | str | list["JsonValue"] | dict[str, "JsonValue"]


class ScoringError(FoodEquityError, ValueError):
    """Raised when scoring inputs violate the approved deterministic contract."""


@dataclass(frozen=True, slots=True)
class BaselineRunInput:
    """Exact validated Equity Baseline run pinned by Food Equity v1."""

    run_id: str
    output_hash: str
    methodology_version: str
    registry_hash: str
    run_fingerprint: str
    status: str
    verified: bool


@dataclass(frozen=True, slots=True)
class BaselineScoreInput:
    """Canonical tract eligibility and approved Equity Baseline band."""

    geoid: str
    score_id: str
    population: Decimal | None
    status: str
    band: str | None


@dataclass(frozen=True, slots=True)
class MetricInput:
    """One normalized scoring metric with an explicit value state."""

    geoid: str
    metric_slug: str
    value: Decimal | None
    state: str
    quality_status: str
    quality_metadata: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class ScoreInputProvenance:
    """Closed scoring-only lineage used by the deterministic input fingerprint."""

    source_snapshot_sha256s: Mapping[str, str]
    full_service_classification_sha256: str
    walking_graph_sha256: str
    walking_graph_version: str
    accessibility_calculation_version: str
    gtfs_projected_stops_sha256: str
    gtfs_stop_projection_version: str
    gtfs_analysis_dates: tuple[str, str]
    gtfs_feed_validity_dates: tuple[str, str]
    gtfs_window_start: str
    gtfs_window_end: str


@dataclass(frozen=True, slots=True)
class FoodScoreComponent:
    """Persistable ranked component for one complete tract."""

    geoid: str
    metric_slug: str
    domain: Domain
    raw_value: Decimal | None
    state: str
    percentile: Decimal
    effective_weight: Decimal
    quality_status: str
    quality_metadata: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class FoodTractScore:
    """Complete Food Equity score or explicit deterministic exclusion."""

    geoid: str
    equity_baseline_score_id: str
    status: str
    exclusion_reasons: tuple[str, ...]
    domains: Mapping[Domain, Decimal]
    raw_food_access_need: Decimal | None
    food_access_need_percentile: Decimal | None
    food_access_need_band: str | None
    equity_baseline_band: str | None
    priority: int | None


@dataclass(frozen=True, slots=True)
class FoodScoringResult:
    """Scoring output with separate canonical input and output hashes."""

    components: tuple[FoodScoreComponent, ...]
    scores: tuple[FoodTractScore, ...]
    baseline_run: BaselineRunInput
    provenance: ScoreInputProvenance
    score_input_fingerprint: str
    canonical_output: bytes
    canonical_output_hash: str


def _fraction(value: ExactNumber) -> Fraction:
    if isinstance(value, Fraction):
        return value
    if not value.is_finite():
        raise ScoringError("scoring values must be finite")
    return Fraction(value)


def _quantize_fraction(value: Fraction) -> Decimal:
    with localcontext() as context:
        context.prec = 80
        decimal_value = Decimal(value.numerator) / Decimal(value.denominator)
        return decimal_value.quantize(OUTPUT_QUANTUM, rounding=ROUND_HALF_EVEN)


def _quantize_decimal(value: Decimal) -> Decimal:
    if not value.is_finite():
        raise ScoringError("scoring values must be finite")
    with localcontext() as context:
        context.prec = 80
        return value.quantize(OUTPUT_QUANTUM, rounding=ROUND_HALF_EVEN)


def _decimal_text(value: Decimal) -> str:
    return format(value, "f")


def _exact_decimal_text(value: Decimal) -> str:
    if not value.is_finite():
        raise ScoringError("canonical decimal values must be finite")
    if value == 0:
        return "0"
    sign, raw_digits, exponent = value.as_tuple()
    if not isinstance(exponent, int):
        raise ScoringError("canonical decimal exponent must be finite")
    digits = list(raw_digits)
    while digits and digits[-1] == 0:
        digits.pop()
        exponent += 1
    coefficient = "".join(str(digit) for digit in digits)
    if exponent >= 0:
        text = coefficient + ("0" * exponent)
    else:
        decimal_position = len(coefficient) + exponent
        if decimal_position > 0:
            text = f"{coefficient[:decimal_position]}.{coefficient[decimal_position:]}"
        else:
            text = f"0.{('0' * -decimal_position)}{coefficient}"
    return f"-{text}" if sign else text


def _approved_registry(registry: MethodologyRegistry | None) -> MethodologyRegistry:
    approved = load_registry()
    if registry is not None and registry != approved:
        raise ScoringError("scoring registry differs from the approved committed registry")
    return approved


def _average_rank_keys(values: Mapping[str, RankKey]) -> dict[str, Fraction]:
    if not values:
        return {}
    if len(values) == 1:
        return {next(iter(values)): Fraction(50)}
    ordered = sorted(values.items(), key=lambda item: item[1])
    result: dict[str, Fraction] = {}
    position = 0
    count = len(ordered)
    while position < count:
        end = position + 1
        while end < count and ordered[end][1] == ordered[position][1]:
            end += 1
        average_rank = Fraction((position + 1) + end, 2)
        percentile = Fraction(100) * (average_rank - 1) / (count - 1)
        for geoid, _key in ordered[position:end]:
            result[geoid] = percentile
        position = end
    return result


def average_rank_percentiles(
    values: Mapping[str, ExactNumber], *, reverse: bool = False
) -> dict[str, Fraction]:
    """Return exact average-rank percentiles without key-based tie breaking."""

    keys = {
        key: (0, -_fraction(value) if reverse else _fraction(value))
        for key, value in values.items()
    }
    return _average_rank_keys(keys)


def classify_food_need_band(
    percentile: Fraction, registry: MethodologyRegistry | None = None
) -> str:
    """Apply the registry's fixed Food Access Need band boundaries."""

    methodology = _approved_registry(registry)
    if percentile < 0 or percentile > 100:
        raise ScoringError("Food Access Need percentile must be from 0 through 100")
    for band in methodology.bands:
        minimum = Fraction(band.minimum)
        maximum = Fraction(band.maximum)
        if percentile >= minimum and (
            percentile < maximum or (band.includes_maximum and percentile == maximum)
        ):
            return band.label.value
    raise ScoringError(f"Food Access Need percentile {percentile} does not map to a band")


def _validate_baseline_run(item: BaselineRunInput) -> None:
    comparisons = (
        (item.run_id, PINNED_BASELINE_RUN_ID, "pinned Equity Baseline run ID"),
        (item.output_hash, PINNED_BASELINE_OUTPUT_HASH, "Equity Baseline output hash"),
        (
            item.methodology_version,
            PINNED_BASELINE_METHODOLOGY,
            "Equity Baseline methodology version",
        ),
        (item.registry_hash, PINNED_BASELINE_REGISTRY_HASH, "Equity Baseline registry hash"),
        (
            item.run_fingerprint,
            PINNED_BASELINE_RUN_FINGERPRINT,
            "Equity Baseline run fingerprint",
        ),
    )
    for actual, expected, label in comparisons:
        if actual != expected:
            raise ScoringError(f"{label} does not match the approved pinned baseline")
    if item.status != "validated":
        raise ScoringError("pinned Equity Baseline run must have validated status")
    if item.verified is not True:
        raise ScoringError("pinned Equity Baseline run must be verified")


def _validated_band(value: str | None, *, required: bool, context: str) -> BandLabel | None:
    if value is None:
        if required:
            raise ScoringError(f"{context} requires an Equity Baseline band")
        return None
    try:
        return BandLabel(value)
    except ValueError as error:
        raise ScoringError(f"{context} has unknown Equity Baseline band {value!r}") from error


def _validate_baseline_scores(
    baseline_scores: Sequence[BaselineScoreInput],
) -> tuple[dict[str, BaselineScoreInput], dict[str, BandLabel | None]]:
    indexed: dict[str, BaselineScoreInput] = {}
    bands: dict[str, BandLabel | None] = {}
    score_ids: set[str] = set()
    for item in baseline_scores:
        if item.geoid in indexed:
            raise ScoringError(f"duplicate baseline score input for {item.geoid}")
        if not item.geoid:
            raise ScoringError("baseline score GEOID must be non-empty")
        try:
            canonical_score_id = str(UUID(item.score_id))
        except (AttributeError, ValueError) as error:
            raise ScoringError(f"baseline score ID for {item.geoid} must be a UUID") from error
        if canonical_score_id != item.score_id:
            raise ScoringError(f"baseline score ID for {item.geoid} must be canonical")
        if item.score_id in score_ids:
            raise ScoringError(f"duplicate baseline score ID {item.score_id}")
        score_ids.add(item.score_id)
        if item.population is not None:
            if not item.population.is_finite():
                raise ScoringError(f"baseline population for {item.geoid} must be finite")
            if item.population < 0:
                raise ScoringError(f"baseline population for {item.geoid} cannot be negative")

        if item.status == "complete":
            if item.population is None or item.population <= 0:
                raise ScoringError(
                    f"complete baseline score for {item.geoid} requires positive population"
                )
            band = _validated_band(
                item.band, required=True, context=f"complete baseline {item.geoid}"
            )
        elif item.status == "ineligible_zero_population":
            if item.population != 0:
                raise ScoringError(f"ineligible baseline {item.geoid} must have zero population")
            if item.band is not None:
                raise ScoringError(f"zero-population baseline {item.geoid} cannot have a band")
            band = None
        elif item.status == "insufficient_data":
            if item.population == 0:
                raise ScoringError(
                    f"zero-population baseline {item.geoid} must be ineligible_zero_population"
                )
            band = _validated_band(
                item.band, required=False, context=f"insufficient baseline {item.geoid}"
            )
            if band is not None:
                raise ScoringError(f"insufficient baseline {item.geoid} cannot have a band")
        else:
            raise ScoringError(f"baseline score {item.geoid} has unknown status {item.status!r}")
        indexed[item.geoid] = item
        bands[item.geoid] = band
    return indexed, bands


def _scoring_metrics(registry: MethodologyRegistry) -> tuple[MetricDefinition, ...]:
    return tuple(
        metric for metric in registry.metrics if metric.treatment is MetricTreatment.SCORING
    )


def _validate_metrics(
    metrics: Sequence[MetricInput],
    baseline_scores: Mapping[str, BaselineScoreInput],
    registry: MethodologyRegistry,
) -> dict[tuple[str, str], MetricInput]:
    definitions = {metric.slug: metric for metric in _scoring_metrics(registry)}
    indexed: dict[tuple[str, str], MetricInput] = {}
    for item in metrics:
        if item.geoid not in baseline_scores:
            raise ScoringError(f"metric input references unknown GEOID {item.geoid}")
        definition = definitions.get(item.metric_slug)
        if definition is None:
            raise ScoringError(
                f"unknown metric {item.metric_slug!r}; it is not an approved scoring metric"
            )
        key = (item.geoid, item.metric_slug)
        if key in indexed:
            raise ScoringError(f"duplicate metric input for {item.geoid} {item.metric_slug}")
        if not isinstance(item.quality_metadata, Mapping):
            raise ScoringError(f"quality metadata for {item.metric_slug} must be a mapping")
        _reject_prohibited_context_metadata(item.quality_metadata)
        if item.quality_status not in KNOWN_QUALITY_STATUSES:
            raise ScoringError(
                f"metric {item.metric_slug} has unknown quality status {item.quality_status!r}"
            )

        if item.state == "observed":
            if item.value is None:
                raise ScoringError(f"observed metric {item.metric_slug} requires a value")
            if item.quality_status not in USABLE_QUALITY_STATUSES:
                raise ScoringError(
                    f"observed metric {item.metric_slug} requires usable quality status"
                )
            if not item.value.is_finite():
                raise ScoringError(f"metric {item.metric_slug} value must be finite")
            if definition.unit == "percent" and not Decimal(0) <= item.value <= Decimal(100):
                raise ScoringError(f"metric {item.metric_slug} must be from 0 through 100")
            if definition.unit != "percent" and item.value < 0:
                raise ScoringError(f"metric {item.metric_slug} must be nonnegative")
        elif item.state == "unreachable":
            if item.metric_slug != GROCERY_WALK_SLUG:
                raise ScoringError("unreachable state is only valid for grocery walking access")
            if item.value is not None:
                raise ScoringError("unreachable grocery walking access must have a null value")
            if item.quality_status not in USABLE_QUALITY_STATUSES:
                raise ScoringError("unreachable grocery walking access requires usable quality")
        elif item.state in UNAVAILABLE_STATES:
            if item.value is not None:
                raise ScoringError(f"metric state {item.state} requires a null value")
            if item.quality_status != item.state:
                raise ScoringError(f"metric state {item.state} requires matching quality status")
        else:
            raise ScoringError(f"metric {item.metric_slug} has unknown value state {item.state!r}")
        indexed[key] = item
    return indexed


def _reject_prohibited_context_metadata(value: object) -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            if not isinstance(key, str):
                raise ScoringError("quality metadata keys must be strings")
            normalized = key.casefold().replace("-", "_")
            if any(token in normalized for token in PROHIBITED_CONTEXT_METADATA_TOKENS):
                raise ScoringError(f"contextual field {key!r} is prohibited from score inputs")
            _reject_prohibited_context_metadata(child)
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        for child in value:
            _reject_prohibited_context_metadata(child)


def _validate_sha256(value: str, label: str) -> None:
    if not SHA256_PATTERN.fullmatch(value):
        raise ScoringError(f"{label} must be a 64-character SHA-256 hash")


def _validate_provenance(provenance: ScoreInputProvenance, registry: MethodologyRegistry) -> None:
    keys = set(provenance.source_snapshot_sha256s)
    if keys != SCORING_SOURCE_KEYS:
        missing = sorted(SCORING_SOURCE_KEYS - keys)
        extra = sorted(keys - SCORING_SOURCE_KEYS)
        raise ScoringError(
            "provenance must contain all and only six scoring source hashes; "
            f"missing={missing!r}, extra={extra!r}"
        )
    for source_key in SOURCE_KEY_ORDER:
        _validate_sha256(
            provenance.source_snapshot_sha256s[source_key], f"source {source_key!r} hash"
        )
    _validate_sha256(
        provenance.full_service_classification_sha256,
        "full-service classification hash",
    )
    _validate_sha256(provenance.walking_graph_sha256, "walking graph hash")
    _validate_sha256(provenance.gtfs_projected_stops_sha256, "projected GTFS stops hash")
    if provenance.walking_graph_version != APPROVED_WALKING_GRAPH_VERSION:
        raise ScoringError(f"walking graph version must be {APPROVED_WALKING_GRAPH_VERSION}")
    if provenance.accessibility_calculation_version != APPROVED_ACCESSIBILITY_CALCULATION_VERSION:
        raise ScoringError(
            "accessibility calculation version must be "
            f"{APPROVED_ACCESSIBILITY_CALCULATION_VERSION}"
        )
    if provenance.gtfs_stop_projection_version != APPROVED_GTFS_STOP_PROJECTION_VERSION:
        raise ScoringError(
            f"GTFS stop projection version must be {APPROVED_GTFS_STOP_PROJECTION_VERSION}"
        )

    if len(provenance.gtfs_analysis_dates) != 2:
        raise ScoringError("GTFS analysis dates must contain one Tuesday and one Saturday")
    try:
        analysis_dates = tuple(
            date.fromisoformat(value) for value in provenance.gtfs_analysis_dates
        )
    except (TypeError, ValueError) as error:
        raise ScoringError("GTFS analysis dates must be valid ISO dates") from error
    if tuple(value.weekday() for value in analysis_dates) != (1, 5):
        raise ScoringError("GTFS analysis dates must be ordered Tuesday then Saturday")
    if (analysis_dates[1] - analysis_dates[0]).days != 4:
        raise ScoringError("GTFS Tuesday and Saturday analysis dates must be in the same week")
    if len(provenance.gtfs_feed_validity_dates) != 2:
        raise ScoringError("GTFS feed validity dates must contain a start and end date")
    try:
        feed_dates = tuple(
            date.fromisoformat(value) for value in provenance.gtfs_feed_validity_dates
        )
    except (TypeError, ValueError) as error:
        raise ScoringError("GTFS feed validity dates must be valid ISO dates") from error
    if feed_dates[0] > analysis_dates[0] or feed_dates[1] < analysis_dates[1]:
        raise ScoringError("GTFS feed validity dates must cover the analysis week")
    if provenance.gtfs_window_start != registry.access.transit_window_start:
        raise ScoringError(
            f"GTFS analysis window must start at {registry.access.transit_window_start}"
        )
    if provenance.gtfs_window_end != registry.access.transit_window_end:
        raise ScoringError(f"GTFS analysis window must end at {registry.access.transit_window_end}")


def _eligibility_reasons(
    baseline: BaselineScoreInput,
    metrics: Mapping[tuple[str, str], MetricInput],
    registry: MethodologyRegistry,
) -> tuple[str, ...]:
    if baseline.status == "ineligible_zero_population":
        return ("ineligible_zero_population",)
    reasons: list[str] = []
    if baseline.status != "complete":
        reasons.append("missing_equity_baseline")
    for definition in _scoring_metrics(registry):
        item = metrics.get((baseline.geoid, definition.slug))
        if (
            item is None
            or item.state not in {"observed", "unreachable"}
            or item.quality_status not in USABLE_QUALITY_STATUSES
        ):
            reasons.append(f"missing_metric:{definition.slug}")
    return tuple(reasons)


def _rank_scoring_metric(
    definition: MetricDefinition,
    geoids: Sequence[str],
    metrics: Mapping[tuple[str, str], MetricInput],
) -> dict[str, Fraction]:
    slug = definition.slug
    keys: dict[str, RankKey] = {}
    for geoid in geoids:
        item = metrics[(geoid, slug)]
        if item.state == "unreachable":
            keys[geoid] = (1, Fraction(0))
            continue
        if item.value is None:
            raise AssertionError("eligible observed metric unexpectedly has no value")
        exact = Fraction(item.value)
        keys[geoid] = (0, exact if definition.higher_is_worse else -exact)
    return _average_rank_keys(keys)


def _json_value(value: object, *, quantize_decimals: bool) -> JsonValue:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, Decimal):
        return (
            _decimal_text(_quantize_decimal(value))
            if quantize_decimals
            else _exact_decimal_text(value)
        )
    if isinstance(value, Fraction):
        return _decimal_text(_quantize_fraction(value))
    if isinstance(value, Enum):
        return _json_value(value.value, quantize_decimals=quantize_decimals)
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Mapping):
        output: dict[str, JsonValue] = {}
        for key, child in value.items():
            if not isinstance(key, str):
                raise ScoringError("canonical metadata keys must be strings")
            output[key] = _json_value(child, quantize_decimals=quantize_decimals)
        return output
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_json_value(child, quantize_decimals=quantize_decimals) for child in value]
    raise ScoringError(f"canonical metadata contains unsupported {type(value).__name__}")


def _canonical_json_bytes(value: Mapping[str, JsonValue]) -> bytes:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _baseline_run_document(item: BaselineRunInput) -> dict[str, JsonValue]:
    return {
        "methodology_version": item.methodology_version,
        "output_hash": item.output_hash,
        "registry_hash": item.registry_hash,
        "run_fingerprint": item.run_fingerprint,
        "run_id": item.run_id,
        "status": item.status,
        "verified": item.verified,
    }


def _input_fingerprint(
    baseline_run: BaselineRunInput,
    baseline_scores: Mapping[str, BaselineScoreInput],
    metrics: Mapping[tuple[str, str], MetricInput],
    provenance: ScoreInputProvenance,
    registry: MethodologyRegistry,
) -> str:
    metric_order = {
        definition.slug: index for index, definition in enumerate(_scoring_metrics(registry))
    }
    document: dict[str, JsonValue] = {
        "methodology_version": registry.methodology_version,
        "scoring_registry_sha256": registry.scoring_sha256,
        "baseline_run": _baseline_run_document(baseline_run),
        "provenance": {
            "source_snapshot_sha256s": {
                key: provenance.source_snapshot_sha256s[key] for key in SOURCE_KEY_ORDER
            },
            "full_service_classification_sha256": provenance.full_service_classification_sha256,
            "walking_graph_sha256": provenance.walking_graph_sha256,
            "walking_graph_version": provenance.walking_graph_version,
            "accessibility_calculation_version": provenance.accessibility_calculation_version,
            "gtfs_projected_stops_sha256": provenance.gtfs_projected_stops_sha256,
            "gtfs_stop_projection_version": provenance.gtfs_stop_projection_version,
            "gtfs_analysis_dates": list(provenance.gtfs_analysis_dates),
            "gtfs_feed_validity_dates": list(provenance.gtfs_feed_validity_dates),
            "gtfs_window_start": provenance.gtfs_window_start,
            "gtfs_window_end": provenance.gtfs_window_end,
        },
        "baseline_scores": [
            {
                "geoid": item.geoid,
                "score_id": item.score_id,
                "population": (
                    _exact_decimal_text(item.population) if item.population is not None else None
                ),
                "status": item.status,
                "band": item.band,
            }
            for item in (baseline_scores[geoid] for geoid in sorted(baseline_scores))
        ],
        "metrics": [
            {
                "geoid": item.geoid,
                "metric_slug": item.metric_slug,
                "value": _exact_decimal_text(item.value) if item.value is not None else None,
                "state": item.state,
                "quality_status": item.quality_status,
                "quality_metadata": _json_value(item.quality_metadata, quantize_decimals=False),
            }
            for item in (
                metrics[key]
                for key in sorted(
                    metrics,
                    key=lambda key: (key[0], metric_order[key[1]]),
                )
            )
        ],
    }
    return hashlib.sha256(_canonical_json_bytes(document)).hexdigest()


def _canonical_output(
    components: Sequence[FoodScoreComponent],
    scores: Sequence[FoodTractScore],
    baseline_run: BaselineRunInput,
    score_input_fingerprint: str,
    registry: MethodologyRegistry,
) -> bytes:
    document: dict[str, JsonValue] = {
        "methodology_version": registry.methodology_version,
        "scoring_registry_sha256": registry.scoring_sha256,
        "baseline_run": _baseline_run_document(baseline_run),
        "score_input_fingerprint": score_input_fingerprint,
        "components": [
            {
                "geoid": item.geoid,
                "metric_slug": item.metric_slug,
                "domain": item.domain.value,
                "raw_value": _decimal_text(item.raw_value) if item.raw_value is not None else None,
                "state": item.state,
                "percentile": _decimal_text(item.percentile),
                "effective_weight": _decimal_text(item.effective_weight),
                "quality_status": item.quality_status,
                "quality_metadata": _json_value(item.quality_metadata, quantize_decimals=True),
            }
            for item in components
        ],
        "scores": [
            {
                "geoid": item.geoid,
                "equity_baseline_score_id": item.equity_baseline_score_id,
                "status": item.status,
                "exclusion_reasons": list(item.exclusion_reasons),
                "domains": {
                    domain.value: _decimal_text(value) for domain, value in item.domains.items()
                },
                "raw_food_access_need": (
                    _decimal_text(item.raw_food_access_need)
                    if item.raw_food_access_need is not None
                    else None
                ),
                "food_access_need_percentile": (
                    _decimal_text(item.food_access_need_percentile)
                    if item.food_access_need_percentile is not None
                    else None
                ),
                "food_access_need_band": item.food_access_need_band,
                "equity_baseline_band": item.equity_baseline_band,
                "priority": item.priority,
            }
            for item in scores
        ],
    }
    return _canonical_json_bytes(document)


def score_food_equity(
    baseline_run: BaselineRunInput,
    baseline_scores: Sequence[BaselineScoreInput],
    metrics: Sequence[MetricInput],
    provenance: ScoreInputProvenance,
    registry: MethodologyRegistry | None = None,
) -> FoodScoringResult:
    """Score only complete positive-population tracts using exact rational arithmetic."""

    methodology = _approved_registry(registry)
    _validate_baseline_run(baseline_run)
    baseline_by_geoid, band_by_geoid = _validate_baseline_scores(baseline_scores)
    metric_by_key = _validate_metrics(metrics, baseline_by_geoid, methodology)
    _validate_provenance(provenance, methodology)

    exclusions = {
        geoid: _eligibility_reasons(item, metric_by_key, methodology)
        for geoid, item in baseline_by_geoid.items()
    }
    eligible_geoids = tuple(sorted(geoid for geoid, reasons in exclusions.items() if not reasons))
    definitions = _scoring_metrics(methodology)

    exact_ranks: dict[tuple[str, str], Fraction] = {}
    for definition in definitions:
        ranks = _rank_scoring_metric(definition, eligible_geoids, metric_by_key)
        for geoid, percentile in ranks.items():
            exact_ranks[(geoid, definition.slug)] = percentile

    exact_domains: dict[tuple[str, Domain], Fraction] = {}
    exact_food_need: dict[str, Fraction] = {}
    for geoid in eligible_geoids:
        for domain in Domain:
            exact_domains[(geoid, domain)] = sum(
                (
                    exact_ranks[(geoid, definition.slug)] * Fraction(definition.weight)
                    for definition in definitions
                    if definition.domain is domain
                ),
                start=Fraction(0),
            )
        exact_food_need[geoid] = sum(
            (
                exact_domains[(geoid, domain)] * Fraction(methodology.domain_weights[domain])
                for domain in Domain
            ),
            start=Fraction(0),
        )
    final_ranks = average_rank_percentiles(exact_food_need)

    components: list[FoodScoreComponent] = []
    for geoid in eligible_geoids:
        for definition in definitions:
            item = metric_by_key[(geoid, definition.slug)]
            if definition.domain is None:
                raise AssertionError("scoring metric unexpectedly has no domain")
            components.append(
                FoodScoreComponent(
                    geoid=geoid,
                    metric_slug=definition.slug,
                    domain=definition.domain,
                    raw_value=(_quantize_decimal(item.value) if item.value is not None else None),
                    state=item.state,
                    percentile=_quantize_fraction(exact_ranks[(geoid, definition.slug)]),
                    effective_weight=_quantize_fraction(
                        Fraction(definition.weight)
                        * Fraction(methodology.domain_weights[definition.domain])
                    ),
                    quality_status=item.quality_status,
                    quality_metadata=MappingProxyType(dict(item.quality_metadata)),
                )
            )

    scores: list[FoodTractScore] = []
    for geoid in sorted(baseline_by_geoid):
        reasons = exclusions[geoid]
        baseline = baseline_by_geoid[geoid]
        equity_band = band_by_geoid[geoid]
        if reasons:
            scores.append(
                FoodTractScore(
                    geoid=geoid,
                    equity_baseline_score_id=baseline.score_id,
                    status=(
                        "ineligible_zero_population"
                        if reasons == ("ineligible_zero_population",)
                        else "insufficient_data"
                    ),
                    exclusion_reasons=reasons,
                    domains=MappingProxyType({}),
                    raw_food_access_need=None,
                    food_access_need_percentile=None,
                    food_access_need_band=None,
                    equity_baseline_band=(
                        equity_band.value
                        if baseline.status == "complete" and equity_band is not None
                        else None
                    ),
                    priority=None,
                )
            )
            continue

        if equity_band is None:
            raise AssertionError("eligible tract unexpectedly has no Equity Baseline band")
        final_rank = final_ranks[geoid]
        food_band_text = classify_food_need_band(final_rank, methodology)
        food_band = BandLabel(food_band_text)
        scores.append(
            FoodTractScore(
                geoid=geoid,
                equity_baseline_score_id=baseline.score_id,
                status="complete",
                exclusion_reasons=(),
                domains=MappingProxyType(
                    {
                        domain: _quantize_fraction(exact_domains[(geoid, domain)])
                        for domain in Domain
                    }
                ),
                raw_food_access_need=_quantize_fraction(exact_food_need[geoid]),
                food_access_need_percentile=_quantize_fraction(final_rank),
                food_access_need_band=food_band.value,
                equity_baseline_band=equity_band.value,
                priority=methodology.priority(equity_band, food_band),
            )
        )

    input_fingerprint = _input_fingerprint(
        baseline_run,
        baseline_by_geoid,
        metric_by_key,
        provenance,
        methodology,
    )
    canonical = _canonical_output(
        components,
        scores,
        baseline_run,
        input_fingerprint,
        methodology,
    )
    return FoodScoringResult(
        components=tuple(components),
        scores=tuple(scores),
        baseline_run=baseline_run,
        provenance=provenance,
        score_input_fingerprint=input_fingerprint,
        canonical_output=canonical,
        canonical_output_hash=hashlib.sha256(canonical).hexdigest(),
    )


def build_scoring_metric_inputs(
    sram: Sequence[SramRecord],
    grocery_access: Sequence[WalkingAccessResult],
    vehicle_access: Sequence[VehicleAccessObservation],
    transit_access: Sequence[TransitAccessResult],
) -> tuple[MetricInput, ...]:
    """Adapt Tasks 4–9 outputs into only the four approved scoring streams."""

    adapted: list[MetricInput] = []
    for sram_item in sram:
        adapted.append(
            MetricInput(
                geoid=sram_item.geoid,
                metric_slug="sram_snap_low_access_share_1mi",
                value=sram_item.population_share_beyond_one_mile,
                state="observed"
                if sram_item.population_share_beyond_one_mile is not None
                else "missing",
                quality_status=sram_item.quality_status,
                quality_metadata=MappingProxyType(
                    {
                        "population_beyond_one_mile": sram_item.population_beyond_one_mile,
                        "quality_reason": sram_item.quality_reason,
                        "source_method": sram_item.source_method,
                        "unit": sram_item.unit,
                    }
                ),
            )
        )
    for grocery_item in grocery_access:
        if grocery_item.reachable is True:
            state = "observed"
            value = grocery_item.walk_minutes
            quality_status = grocery_item.quality_status
        elif grocery_item.reachable is False:
            state = "unreachable"
            value = None
            quality_status = (
                "verified"
                if grocery_item.quality_status == "unreachable"
                else grocery_item.quality_status
            )
        else:
            state = "missing"
            value = None
            quality_status = "missing"
        adapted.append(
            MetricInput(
                geoid=grocery_item.geoid,
                metric_slug=GROCERY_WALK_SLUG,
                value=value,
                state=state,
                quality_status=quality_status,
                quality_metadata=MappingProxyType(
                    {
                        "network_distance_m": grocery_item.network_distance_m,
                        "nearest_resource_id": grocery_item.nearest_resource_id,
                        "quality_reason": grocery_item.quality_reason,
                        "upstream_access_status": grocery_item.quality_status,
                        "graph_sha256": grocery_item.graph_sha256,
                        "graph_version": grocery_item.graph_version,
                        "graph_approved_for_scoring": grocery_item.graph_approved_for_scoring,
                        "thresholds_m": grocery_item.thresholds_m,
                        "calculation_version": grocery_item.calculation_version,
                    }
                ),
            )
        )
    for vehicle_item in vehicle_access:
        metadata = dict(vehicle_item.quality_metadata)
        metadata.update(
            {
                "coefficient_of_variation": vehicle_item.coefficient_of_variation,
                "margin_of_error": vehicle_item.margin_of_error,
                "quality_reason": vehicle_item.quality_reason,
                "reliability": vehicle_item.reliability,
            }
        )
        adapted.append(
            MetricInput(
                geoid=vehicle_item.geoid,
                metric_slug="households_no_vehicle",
                value=vehicle_item.value,
                state="observed" if vehicle_item.value is not None else "missing",
                quality_status=vehicle_item.quality_status,
                quality_metadata=MappingProxyType(metadata),
            )
        )
    for transit_item in transit_access:
        adapted.append(
            MetricInput(
                geoid=transit_item.geoid,
                metric_slug="scheduled_transit_service_intensity",
                value=transit_item.scheduled_service_intensity,
                state=(
                    "observed"
                    if transit_item.scheduled_service_intensity is not None
                    else "missing"
                ),
                quality_status=transit_item.quality_status,
                quality_metadata=MappingProxyType(
                    {
                        "analysis_dates": transit_item.analysis_dates,
                        "feed_validity_dates": transit_item.feed_validity_dates,
                        "gtfs_source_sha256": transit_item.gtfs_source_sha256,
                        "projected_stops_sha256": transit_item.projected_stops_sha256,
                        "graph_sha256": transit_item.graph_sha256,
                        "graph_version": transit_item.graph_version,
                        "graph_approved_for_scoring": transit_item.graph_approved_for_scoring,
                        "walk_threshold_m": transit_item.walk_threshold_m,
                        "stop_projection_version": transit_item.stop_projection_version,
                        "calculation_version": transit_item.calculation_version,
                        "quality_reason": transit_item.quality_reason,
                        "reachable_stop_ids": transit_item.reachable_stop_ids,
                    }
                ),
            )
        )
    metric_order = {
        slug: index
        for index, slug in enumerate(
            (
                "sram_snap_low_access_share_1mi",
                GROCERY_WALK_SLUG,
                "households_no_vehicle",
                "scheduled_transit_service_intensity",
            )
        )
    }
    return tuple(sorted(adapted, key=lambda item: (item.geoid, metric_order[item.metric_slug])))


__all__ = [
    "BaselineRunInput",
    "BaselineScoreInput",
    "FoodScoreComponent",
    "FoodScoringResult",
    "FoodTractScore",
    "MetricInput",
    "ScoreInputProvenance",
    "ScoringError",
    "average_rank_percentiles",
    "build_scoring_metric_inputs",
    "classify_food_need_band",
    "score_food_equity",
]
