"""Errors raised by the equity-baseline pipeline."""


class EquityBaselineError(Exception):
    """Base error for deterministic equity-baseline operations."""


class RegistryValidationError(EquityBaselineError, ValueError):
    """Raised when the committed methodology registry is invalid."""
