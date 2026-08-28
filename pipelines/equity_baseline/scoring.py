"""Pure, deterministic equity-baseline scoring with exact intermediate ranks."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_EVEN, Decimal, localcontext
from fractions import Fraction
from types import MappingProxyType
from typing import TypeAlias

from pipelines.equity_baseline.errors import ScoringError
from pipelines.equity_baseline.models import Domain, MethodologyRegistry
from pipelines.equity_baseline.registry import load_registry

OUTPUT_QUANTUM = Decimal("0.000000000001")
USABLE_QUALITY_STATUSES = frozenset({"verified", "provisional", "stale"})
JsonValue: TypeAlias = None | bool | int | str | list["JsonValue"] | dict[str, "JsonValue"]
ExactNumber: TypeAlias = Decimal | Fraction


@dataclass(frozen=True, slots=True)
class PopulationInput:
    """Canonical tract population used only for scoring eligibility."""

    geoid: str
    value: Decimal | None


@dataclass(frozen=True, slots=True)
class IndicatorInput:
    """One normalized indicator value and its retained upstream quality metadata."""

    geoid: str
    indicator_slug: str
    value: Decimal | None
    quality_status: str
    quality_metadata: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class IndicatorComponent:
    """Persistable ranked indicator component for a complete tract."""

    geoid: str
    indicator_slug: str
    domain: Domain
    raw_value: Decimal
    percentile: Decimal
    effective_weight: Decimal
    quality_status: str
    quality_metadata: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class TractScore:
    """Scored or explicitly excluded canonical tract."""

    geoid: str
    status: str
    exclusion_reasons: tuple[str, ...]
    subindices: Mapping[Domain, Decimal]
    composite_score: Decimal | None
    final_percentile: Decimal | None
    band: str | None


@dataclass(frozen=True, slots=True)
class ScoringResult:
    """Canonical scoring output and its exact SHA-256 fingerprint."""

    components: tuple[IndicatorComponent, ...]
    scores: tuple[TractScore, ...]
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


def average_rank_percentiles(values: Mapping[str, ExactNumber]) -> dict[str, Fraction]:
    """Rank values with exact average ties and no key-based tie breaking."""

    if not values:
        return {}
    exact = {key: _fraction(value) for key, value in values.items()}
    if len(exact) == 1:
        return {next(iter(exact)): Fraction(50)}

    ordered = sorted(exact.items(), key=lambda item: item[1])
    result: dict[str, Fraction] = {}
    position = 0
    count = len(ordered)
    while position < count:
        end = position + 1
        while end < count and ordered[end][1] == ordered[position][1]:
            end += 1
        first_rank = position + 1
        last_rank = end
        average_rank = Fraction(first_rank + last_rank, 2)
        percentile = Fraction(100) * (average_rank - 1) / (count - 1)
        for key, _value in ordered[position:end]:
            result[key] = percentile
        position = end
    return result


def classify_priority_band(
    percentile: Fraction,
    registry: MethodologyRegistry | None = None,
) -> str:
    """Apply the registry's exact fixed boundaries to a final percentile."""

    methodology = registry or load_registry()
    if percentile < 0 or percentile > 100:
        raise ScoringError("final percentile must be from 0 through 100")
    for band in methodology.bands:
        minimum = Fraction(band.minimum)
        maximum = Fraction(band.maximum)
        if percentile >= minimum and (
            percentile < maximum or (band.includes_maximum and percentile == maximum)
        ):
            return band.label
    raise ScoringError(f"final percentile {percentile} does not map to a priority band")


def _validate_populations(populations: Sequence[PopulationInput]) -> dict[str, PopulationInput]:
    indexed: dict[str, PopulationInput] = {}
    for item in populations:
        if item.geoid in indexed:
            raise ScoringError(f"duplicate population input for {item.geoid}")
        if item.value is not None:
            if not item.value.is_finite():
                raise ScoringError(f"population for {item.geoid} must be finite")
            if item.value < 0:
                raise ScoringError(f"population for {item.geoid} cannot be negative")
        indexed[item.geoid] = item
    return indexed


def _validate_observations(
    observations: Sequence[IndicatorInput],
    populations: Mapping[str, PopulationInput],
    registry: MethodologyRegistry,
) -> dict[tuple[str, str], IndicatorInput]:
    approved = {indicator.slug for indicator in registry.indicators}
    indexed: dict[tuple[str, str], IndicatorInput] = {}
    for item in observations:
        if item.geoid not in populations:
            raise ScoringError(f"indicator input references unknown GEOID {item.geoid}")
        if item.indicator_slug not in approved:
            raise ScoringError(f"indicator input uses unknown slug {item.indicator_slug!r}")
        key = (item.geoid, item.indicator_slug)
        if key in indexed:
            raise ScoringError(f"duplicate indicator input for {item.geoid} {item.indicator_slug}")
        if item.value is not None:
            if not item.value.is_finite():
                raise ScoringError(f"indicator {item.indicator_slug} must be finite")
            if item.value < 0 or item.value > 100:
                raise ScoringError(f"indicator {item.indicator_slug} must be from 0 through 100")
        indexed[key] = item
    return indexed


def _eligibility_reasons(
    population: PopulationInput,
    observations: Mapping[tuple[str, str], IndicatorInput],
    registry: MethodologyRegistry,
) -> tuple[str, ...]:
    if population.value is None:
        return ("missing_population",)
    if population.value == 0:
        return ("ineligible_zero_population",)
    reasons: list[str] = []
    for indicator in registry.indicators:
        item = observations.get((population.geoid, indicator.slug))
        if item is None or item.value is None or item.quality_status == "missing":
            reasons.append(f"missing_indicator:{indicator.slug}")
        elif item.quality_status not in USABLE_QUALITY_STATUSES:
            reasons.append(f"invalid_indicator:{indicator.slug}")
    return tuple(reasons)


def _domain_indicators(registry: MethodologyRegistry) -> dict[Domain, tuple[str, ...]]:
    return {
        domain: tuple(
            indicator.slug for indicator in registry.indicators if indicator.domain is domain
        )
        for domain in Domain
    }


def _json_quality(value: object) -> JsonValue:
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, Decimal):
        return _decimal_text(_quantize_decimal(value))
    if isinstance(value, Mapping):
        output: dict[str, JsonValue] = {}
        for key, child in value.items():
            if not isinstance(key, str):
                raise ScoringError("quality metadata keys must be strings")
            output[key] = _json_quality(child)
        return output
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_json_quality(child) for child in value]
    raise ScoringError(f"quality metadata contains unsupported {type(value).__name__}")


def _canonical_bytes(
    components: Sequence[IndicatorComponent],
    scores: Sequence[TractScore],
    registry: MethodologyRegistry,
) -> bytes:
    document: dict[str, JsonValue] = {
        "methodology_version": registry.methodology_version,
        "registry_sha256": registry.sha256,
        "components": [
            {
                "geoid": item.geoid,
                "indicator_slug": item.indicator_slug,
                "domain": item.domain.value,
                "raw_value": _decimal_text(item.raw_value),
                "percentile": _decimal_text(item.percentile),
                "effective_weight": _decimal_text(item.effective_weight),
                "quality_status": item.quality_status,
                "quality_metadata": _json_quality(item.quality_metadata),
            }
            for item in components
        ],
        "scores": [
            {
                "geoid": item.geoid,
                "status": item.status,
                "exclusion_reasons": list(item.exclusion_reasons),
                "subindices": {
                    domain.value: _decimal_text(value) for domain, value in item.subindices.items()
                },
                "composite_score": (
                    _decimal_text(item.composite_score)
                    if item.composite_score is not None
                    else None
                ),
                "final_percentile": (
                    _decimal_text(item.final_percentile)
                    if item.final_percentile is not None
                    else None
                ),
                "band": item.band,
            }
            for item in scores
        ],
    }
    return json.dumps(
        document,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def score_equity_baseline(
    populations: Sequence[PopulationInput],
    observations: Sequence[IndicatorInput],
    registry: MethodologyRegistry | None = None,
) -> ScoringResult:
    """Score complete positive-population tracts using only exact deterministic operations."""

    methodology = registry or load_registry()
    population_by_geoid = _validate_populations(populations)
    observation_by_key = _validate_observations(observations, population_by_geoid, methodology)
    exclusion_by_geoid = {
        geoid: _eligibility_reasons(population, observation_by_key, methodology)
        for geoid, population in population_by_geoid.items()
    }
    eligible_geoids = tuple(
        sorted(geoid for geoid, reasons in exclusion_by_geoid.items() if not reasons)
    )

    exact_ranks: dict[tuple[str, str], Fraction] = {}
    for indicator in methodology.indicators:
        values = {
            geoid: observation_by_key[(geoid, indicator.slug)].value for geoid in eligible_geoids
        }
        ranks = average_rank_percentiles(
            {geoid: value for geoid, value in values.items() if value is not None}
        )
        for geoid, rank in ranks.items():
            exact_ranks[(geoid, indicator.slug)] = rank

    domains = _domain_indicators(methodology)
    exact_subindices: dict[tuple[str, Domain], Fraction] = {}
    exact_composites: dict[str, Fraction] = {}
    for geoid in eligible_geoids:
        for domain, slugs in domains.items():
            exact_subindices[(geoid, domain)] = sum(
                (exact_ranks[(geoid, slug)] for slug in slugs), start=Fraction(0)
            ) / len(slugs)
        exact_composites[geoid] = sum(
            (exact_subindices[(geoid, domain)] for domain in Domain), start=Fraction(0)
        ) / len(Domain)
    final_ranks = average_rank_percentiles(exact_composites)

    components: list[IndicatorComponent] = []
    for geoid in eligible_geoids:
        for indicator in methodology.indicators:
            item = observation_by_key[(geoid, indicator.slug)]
            if item.value is None:
                raise AssertionError("eligible indicator unexpectedly has no value")
            rank = exact_ranks[(geoid, indicator.slug)]
            domain_count = len(domains[indicator.domain])
            components.append(
                IndicatorComponent(
                    geoid=geoid,
                    indicator_slug=indicator.slug,
                    domain=indicator.domain,
                    raw_value=_quantize_decimal(item.value),
                    percentile=_quantize_fraction(rank),
                    effective_weight=_quantize_fraction(Fraction(1, domain_count * len(Domain))),
                    quality_status=item.quality_status,
                    quality_metadata=MappingProxyType(dict(item.quality_metadata)),
                )
            )

    scores: list[TractScore] = []
    for geoid in sorted(population_by_geoid):
        reasons = exclusion_by_geoid[geoid]
        if reasons:
            scores.append(
                TractScore(
                    geoid=geoid,
                    status=(
                        "ineligible_zero_population"
                        if reasons == ("ineligible_zero_population",)
                        else "insufficient_data"
                    ),
                    exclusion_reasons=reasons,
                    subindices=MappingProxyType({}),
                    composite_score=None,
                    final_percentile=None,
                    band=None,
                )
            )
            continue
        final_rank = final_ranks[geoid]
        scores.append(
            TractScore(
                geoid=geoid,
                status="complete",
                exclusion_reasons=(),
                subindices=MappingProxyType(
                    {
                        domain: _quantize_fraction(exact_subindices[(geoid, domain)])
                        for domain in Domain
                    }
                ),
                composite_score=_quantize_fraction(exact_composites[geoid]),
                final_percentile=_quantize_fraction(final_rank),
                band=classify_priority_band(final_rank, methodology),
            )
        )

    canonical = _canonical_bytes(components, scores, methodology)
    return ScoringResult(
        components=tuple(components),
        scores=tuple(scores),
        canonical_output=canonical,
        canonical_output_hash=hashlib.sha256(canonical).hexdigest(),
    )


__all__ = [
    "IndicatorInput",
    "PopulationInput",
    "ScoringError",
    "average_rank_percentiles",
    "classify_priority_band",
    "score_equity_baseline",
]
