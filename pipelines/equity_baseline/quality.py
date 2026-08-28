"""Deterministic ACS uncertainty and reliability calculations."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from pipelines.equity_baseline.models import ReliabilityPolicy

ACS_90_PERCENT_Z = Decimal("1.645")
PERCENT = Decimal("100")


class ReliabilityState(StrEnum):
    """Approved display states for an ACS coefficient of variation."""

    RELIABLE = "reliable"
    USE_WITH_CAUTION = "use_with_caution"
    HIGH_UNCERTAINTY = "high_uncertainty"
    CV_NOT_COMPUTABLE = "cv_not_computable"


@dataclass(frozen=True, slots=True)
class CoefficientOfVariation:
    """A CV value and its approved display state."""

    cv: Decimal | None
    state: ReliabilityState


def sum_or_difference_margin_of_error(margins: tuple[Decimal, ...]) -> Decimal:
    """Approximate a sum or difference MOE with root-sum-of-squares."""

    if any(margin < 0 for margin in margins):
        raise ValueError("margins of error cannot be negative")
    return sum((margin * margin for margin in margins), start=Decimal(0)).sqrt()


def proportion_margin_of_error(
    *,
    numerator: Decimal,
    denominator: Decimal,
    numerator_moe: Decimal,
    denominator_moe: Decimal,
) -> Decimal:
    """Approximate a percentage-point MOE, using Census's fallback when needed."""

    if denominator <= 0:
        raise ValueError("proportion denominator must be positive")
    if numerator_moe < 0 or denominator_moe < 0:
        raise ValueError("margins of error cannot be negative")
    proportion = numerator / denominator
    denominator_component = proportion * proportion * denominator_moe * denominator_moe
    radicand = numerator_moe * numerator_moe - denominator_component
    if radicand < 0:
        radicand = numerator_moe * numerator_moe + denominator_component
    return radicand.sqrt() / denominator * PERCENT


def coefficient_of_variation(
    estimate: Decimal,
    margin_of_error: Decimal,
    policy: ReliabilityPolicy,
) -> CoefficientOfVariation:
    """Compute the ACS CV from a 90% MOE and apply inclusive thresholds."""

    if margin_of_error < 0:
        raise ValueError("margin of error cannot be negative")
    if estimate == 0:
        return CoefficientOfVariation(None, ReliabilityState(policy.zero_estimate_status))
    cv = (margin_of_error / ACS_90_PERCENT_Z) / abs(estimate) * PERCENT
    if cv <= policy.reliable_max_cv:
        state = ReliabilityState.RELIABLE
    elif cv <= policy.caution_max_cv:
        state = ReliabilityState.USE_WITH_CAUTION
    else:
        state = ReliabilityState.HIGH_UNCERTAINTY
    return CoefficientOfVariation(cv, state)
