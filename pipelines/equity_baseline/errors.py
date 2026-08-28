"""Errors raised by the equity-baseline pipeline."""


class EquityBaselineError(Exception):
    """Base error for deterministic equity-baseline operations."""


class RegistryValidationError(EquityBaselineError, ValueError):
    """Raised when the committed methodology registry is invalid."""


class ArtifactError(EquityBaselineError):
    """Base error for immutable snapshot and manifest operations."""


class ArtifactWriteError(ArtifactError):
    """Raised when an artifact cannot be written atomically."""


class ArtifactCollisionError(ArtifactError):
    """Raised when a content-addressed target contains unexpected bytes."""


class HttpFetchError(EquityBaselineError):
    """Raised when a bounded HTTP fetch cannot complete."""


class ResponseSchemaError(EquityBaselineError, ValueError):
    """Raised when fetched bytes do not match the required response schema."""


class GeographyValidationError(EquityBaselineError, ValueError):
    """Raised when authoritative tract geography violates the approved contract."""


class AcsSourceError(EquityBaselineError, ValueError):
    """Raised when an ACS response violates the approved source contract."""


class AcsGeographyError(AcsSourceError):
    """Raised when ACS and canonical tract universes do not match exactly."""


class PlacesSourceError(EquityBaselineError, ValueError):
    """Raised when a CDC PLACES response violates the approved source contract."""


class PlacesGeographyError(PlacesSourceError):
    """Raised when PLACES contains geography outside the canonical tract universe."""


class ScoringError(EquityBaselineError, ValueError):
    """Raised when normalized inputs cannot satisfy the scoring contract."""
