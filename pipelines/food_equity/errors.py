"""Errors raised by the food-equity pipeline."""


class FoodEquityError(Exception):
    """Base error for deterministic food-equity operations."""


class RegistryValidationError(FoodEquityError, ValueError):
    """Raised when the committed food-equity registry is invalid."""


class SourceValidationError(FoodEquityError, ValueError):
    """Raised when an authoritative source violates its approved contract."""


class QualityValidationError(FoodEquityError, ValueError):
    """Raised when a value has an impossible quality state."""
