"""Immutable raw snapshots and sanitized canonical manifests."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import tempfile
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TypeAlias, cast
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

from pipelines.equity_baseline.errors import (
    ArtifactCollisionError,
    ArtifactError,
    ArtifactWriteError,
)

JsonScalar: TypeAlias = None | bool | int | float | str
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]

REDACTED = "[REDACTED]"
REDACTED_DATABASE_URL = "[REDACTED_DATABASE_URL]"
DATABASE_SCHEMES = frozenset({"postgres", "postgresql"})
SAFE_SEGMENT_PATTERN = re.compile(r"[^A-Za-z0-9._-]+")
SAFE_SUFFIX_PATTERN = re.compile(r"^\.[A-Za-z0-9]{1,10}$")


@dataclass(frozen=True, slots=True)
class ArtifactPaths:
    """Bounded workspace paths for raw, manifest, and report artifacts."""

    raw: Path
    manifests: Path
    reports: Path

    @classmethod
    def for_root(cls, root: Path) -> ArtifactPaths:
        """Build the approved Plan 2 artifact directories below a root."""

        return cls(
            raw=root / "data/raw/equity-baseline",
            manifests=root / "data/manifests/equity-baseline",
            reports=root / "data/reports/equity-baseline",
        )


@dataclass(frozen=True, slots=True)
class SnapshotManifest:
    """Sanitized provenance for one immutable source snapshot."""

    source_key: str
    source_url: str
    dataset_version: str
    retrieved_at: str
    checksum_sha256: str
    byte_size: int
    storage_uri: str
    row_or_feature_count: int
    schema_fingerprint: str
    request_metadata: dict[str, JsonValue]
    license: str
    methodology_reference: str

    def as_dict(self) -> dict[str, JsonValue]:
        """Return the canonical JSON-compatible manifest shape."""

        return {
            "byte_size": self.byte_size,
            "checksum_sha256": self.checksum_sha256,
            "dataset_version": self.dataset_version,
            "license": self.license,
            "methodology_reference": self.methodology_reference,
            "request_metadata": self.request_metadata,
            "retrieved_at": self.retrieved_at,
            "row_or_feature_count": self.row_or_feature_count,
            "schema_fingerprint": self.schema_fingerprint,
            "source_key": self.source_key,
            "source_url": self.source_url,
            "storage_uri": self.storage_uri,
        }


@dataclass(frozen=True, slots=True)
class StoredSnapshot:
    """Paths and provenance returned after preserving a source response."""

    raw_path: Path
    manifest_path: Path
    manifest: SnapshotManifest
    reused: bool


def sha256_bytes(content: bytes) -> str:
    """Return a lowercase SHA-256 digest for exact source bytes."""

    return hashlib.sha256(content).hexdigest()


def canonical_json_bytes(value: object) -> bytes:
    """Serialize JSON deterministically without insignificant whitespace."""

    try:
        encoded = json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
    except (TypeError, ValueError) as error:
        raise ArtifactError(f"value is not canonical JSON: {error}") from error
    return encoded.encode("utf-8")


def schema_fingerprint(schema: object) -> str:
    """Hash a canonical schema description."""

    return sha256_bytes(canonical_json_bytes(schema))


def _is_sensitive_key(key: str) -> bool:
    normalized = key.casefold().replace("-", "_")
    return (
        normalized
        in {
            "apikey",
            "api_key",
            "access_token",
            "database_url",
            "key",
            "password",
            "passwd",
            "secret",
            "token",
        }
        or "password" in normalized
        or normalized.endswith("_key")
        or normalized.endswith("_token")
    )


def _redact_userinfo(netloc: str) -> str:
    if "@" not in netloc:
        return netloc
    userinfo, host = netloc.rsplit("@", 1)
    if ":" not in userinfo:
        return netloc
    username, _password = userinfo.split(":", 1)
    return f"{username}:{quote(REDACTED, safe='')}@{host}"


def sanitize_url(url: str) -> str:
    """Remove credentials and sensitive query values from a URL."""

    parsed = urlsplit(url)
    if parsed.scheme.casefold() in DATABASE_SCHEMES:
        return REDACTED_DATABASE_URL
    sanitized_query = urlencode(
        sorted(
            (
                key,
                REDACTED if _is_sensitive_key(key) else value,
            )
            for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        )
    )
    return urlunsplit(
        (
            parsed.scheme,
            _redact_userinfo(parsed.netloc),
            parsed.path,
            sanitized_query,
            parsed.fragment,
        )
    )


def sanitize_metadata(value: object) -> JsonValue:
    """Recursively sanitize JSON-compatible request metadata."""

    if value is None or isinstance(value, (bool, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ArtifactError("request metadata cannot contain non-finite numbers")
        return value
    if isinstance(value, str):
        if "postgresql://" in value.casefold() or "postgres://" in value.casefold():
            return REDACTED_DATABASE_URL
        if value.startswith(("http://", "https://")):
            return sanitize_url(value)
        return value
    if isinstance(value, Mapping):
        sanitized: dict[str, JsonValue] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise ArtifactError("request metadata keys must be strings")
            sanitized[key] = REDACTED if _is_sensitive_key(key) else sanitize_metadata(item)
        return sanitized
    if isinstance(value, (list, tuple)):
        return [sanitize_metadata(item) for item in value]
    raise ArtifactError(f"unsupported request metadata type: {type(value).__name__}")


def _safe_segment(value: str, label: str) -> str:
    segment = SAFE_SEGMENT_PATTERN.sub("-", value.strip()).strip(".-_")
    if not segment or segment in {".", ".."}:
        raise ArtifactError(f"{label} does not produce a safe path segment")
    return segment


def _source_suffix(source_url: str) -> str:
    suffix = Path(urlsplit(source_url).path).suffix
    return suffix.casefold() if SAFE_SUFFIX_PATTERN.fullmatch(suffix) else ".bin"


def _utc_timestamp(clock: Callable[[], datetime]) -> str:
    retrieved_at = clock()
    if retrieved_at.tzinfo is None or retrieved_at.utcoffset() is None:
        raise ArtifactError("snapshot clock must return a timezone-aware datetime")
    return retrieved_at.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def atomic_write_bytes(target: Path, content: bytes) -> bool:
    """Write bytes through a same-directory temporary file and atomic replace.

    Returns ``True`` when a new target was created and ``False`` when identical
    bytes already existed.
    """

    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        try:
            existing = target.read_bytes()
        except OSError as error:
            raise ArtifactWriteError(f"cannot verify existing artifact {target.name}") from error
        if existing == content:
            return False
        raise ArtifactCollisionError(f"content-addressed target collision at {target.name}")

    descriptor, temporary_name = tempfile.mkstemp(
        dir=target.parent,
        prefix=f".{target.name}.",
        suffix=".tmp",
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as temporary_file:
            temporary_file.write(content)
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        temporary_path.replace(target)
    except Exception as error:
        temporary_path.unlink(missing_ok=True)
        raise ArtifactWriteError(f"atomic write failed for {target.name}") from error
    return True


def _manifest_from_bytes(content: bytes) -> SnapshotManifest:
    try:
        parsed: object = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ArtifactError("stored snapshot manifest is not valid JSON") from error
    if not isinstance(parsed, dict):
        raise ArtifactError("stored snapshot manifest must be a JSON object")
    data = cast(dict[str, object], parsed)

    def require_string(key: str) -> str:
        value = data.get(key)
        if not isinstance(value, str) or not value:
            raise ArtifactError(f"stored snapshot manifest has invalid {key}")
        return value

    def require_integer(key: str) -> int:
        value = data.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise ArtifactError(f"stored snapshot manifest has invalid {key}")
        return value

    metadata = data.get("request_metadata")
    if not isinstance(metadata, dict) or any(not isinstance(key, str) for key in metadata):
        raise ArtifactError("stored snapshot manifest has invalid request_metadata")
    sanitized_metadata = sanitize_metadata(metadata)
    if not isinstance(sanitized_metadata, dict):
        raise ArtifactError("stored snapshot manifest request_metadata must be an object")

    manifest = SnapshotManifest(
        source_key=require_string("source_key"),
        source_url=sanitize_url(require_string("source_url")),
        dataset_version=require_string("dataset_version"),
        retrieved_at=require_string("retrieved_at"),
        checksum_sha256=require_string("checksum_sha256"),
        byte_size=require_integer("byte_size"),
        storage_uri=require_string("storage_uri"),
        row_or_feature_count=require_integer("row_or_feature_count"),
        schema_fingerprint=require_string("schema_fingerprint"),
        request_metadata=sanitized_metadata,
        license=require_string("license"),
        methodology_reference=require_string("methodology_reference"),
    )
    if canonical_json_bytes(manifest.as_dict()) != content:
        raise ArtifactError("stored snapshot manifest is not canonical or sanitized")
    return manifest


def preserve_snapshot(
    *,
    root: Path,
    source_key: str,
    source_url: str,
    dataset_version: str,
    content: bytes,
    schema: object,
    row_or_feature_count: int,
    license: str,
    methodology_reference: str,
    request_metadata: object,
    clock: Callable[[], datetime],
) -> StoredSnapshot:
    """Preserve exact bytes and a sanitized content-addressed manifest."""

    if row_or_feature_count < 0:
        raise ArtifactError("row_or_feature_count cannot be negative")
    if not license.strip() or not methodology_reference.strip():
        raise ArtifactError("license and methodology_reference are required")

    digest = sha256_bytes(content)
    safe_source = _safe_segment(source_key, "source_key")
    safe_version = _safe_segment(dataset_version, "dataset_version")
    sanitized_request = sanitize_metadata(request_metadata)
    if not isinstance(sanitized_request, dict):
        raise ArtifactError("request_metadata must be an object")
    sanitized_source_url = sanitize_url(source_url)
    fingerprint = schema_fingerprint(schema)
    paths = ArtifactPaths.for_root(root)
    relative_raw_path = (
        Path("data/raw/equity-baseline")
        / safe_source
        / safe_version
        / f"{digest}{_source_suffix(source_url)}"
    )
    raw_path = root / relative_raw_path
    manifest_path = paths.manifests / safe_source / safe_version / f"{digest}.json"

    if raw_path.exists():
        try:
            existing_content = raw_path.read_bytes()
        except OSError as error:
            raise ArtifactWriteError(f"cannot verify existing snapshot {raw_path.name}") from error
        if sha256_bytes(existing_content) != digest or existing_content != content:
            raise ArtifactCollisionError(f"content-addressed snapshot collision at {raw_path.name}")
        if manifest_path.exists():
            manifest = _manifest_from_bytes(manifest_path.read_bytes())
            if manifest.checksum_sha256 != digest or manifest.byte_size != len(content):
                raise ArtifactCollisionError("stored manifest does not match snapshot bytes")
            expected_provenance = (
                source_key,
                sanitized_source_url,
                dataset_version,
                row_or_feature_count,
                fingerprint,
                sanitized_request,
                license,
                methodology_reference,
                relative_raw_path.as_posix(),
            )
            stored_provenance = (
                manifest.source_key,
                manifest.source_url,
                manifest.dataset_version,
                manifest.row_or_feature_count,
                manifest.schema_fingerprint,
                manifest.request_metadata,
                manifest.license,
                manifest.methodology_reference,
                manifest.storage_uri,
            )
            if stored_provenance != expected_provenance:
                raise ArtifactCollisionError("stored manifest provenance does not match request")
            return StoredSnapshot(raw_path, manifest_path, manifest, reused=True)

    raw_created = atomic_write_bytes(raw_path, content)
    manifest = SnapshotManifest(
        source_key=source_key,
        source_url=sanitized_source_url,
        dataset_version=dataset_version,
        retrieved_at=_utc_timestamp(clock),
        checksum_sha256=digest,
        byte_size=len(content),
        storage_uri=relative_raw_path.as_posix(),
        row_or_feature_count=row_or_feature_count,
        schema_fingerprint=fingerprint,
        request_metadata=sanitized_request,
        license=license,
        methodology_reference=methodology_reference,
    )
    try:
        atomic_write_bytes(manifest_path, canonical_json_bytes(manifest.as_dict()))
    except Exception:
        if raw_created:
            raw_path.unlink(missing_ok=True)
        raise
    return StoredSnapshot(raw_path, manifest_path, manifest, reused=not raw_created)
