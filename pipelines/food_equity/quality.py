"""Closed quality states shared by food-equity sources and metrics."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class QualityState(StrEnum):
    VERIFIED = "verified"
    PROVISIONAL = "provisional"
    STALE_UNVERIFIED_CONTEXT = "stale_unverified_context"
    STATUS_UNKNOWN = "status_unknown"
    INVALID_COORDINATE = "invalid_coordinate"
    UNSNAPPED = "unsnapped"
    UNREACHABLE = "unreachable"
    INSUFFICIENT_DATA = "insufficient_data"
    INELIGIBLE_ZERO_POPULATION = "ineligible_zero_population"


@dataclass(frozen=True, slots=True)
class QualityEvidence:
    """One explicit quality state and its deterministic evidence."""

    state: QualityState
    reason: str
    source_key: str
