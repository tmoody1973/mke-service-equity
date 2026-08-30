"""Path-bounded provenance adapters for approved local Food Equity artifacts."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from pipelines.common.artifacts import StoredSnapshot, preserve_file_snapshot, preserve_snapshot
from pipelines.food_equity.errors import SourceValidationError
from pipelines.food_equity.models import MethodologyRegistry
from pipelines.food_equity.registry import load_registry
from pipelines.food_equity.retail import ClassificationEvidence, read_classification_evidence
from pipelines.food_equity.walking_network import (
    GEOFABRIK_NETWORK_ARTIFACT,
    GEOFABRIK_NETWORK_BYTE_SIZE,
    GEOFABRIK_NETWORK_MD5,
    GEOFABRIK_NETWORK_SHA256,
    GEOFABRIK_NETWORK_URL,
    GRAPH_VERSION,
    PROJECTED_CRS,
    validate_network_snapshot,
)

SHA256_PATTERN = re.compile(r"[0-9a-f]{64}")
CLASSIFICATION_EVIDENCE_SOURCE_KEY = "full_service_classification_evidence"
CLASSIFICATION_EVIDENCE_VERSION = "classification-evidence-v1"
CLASSIFICATION_EVIDENCE_FIELDS = (
    "resource_id",
    "asserted_classification",
    "evidence_type",
    "evidence_url",
    "partner_document_reference",
    "verifier",
    "verified_at",
    "notes",
)


class ProvenanceError(SourceValidationError):
    """Raised when a local artifact cannot prove its path and exact identity."""


@dataclass(frozen=True, slots=True)
class ValidatedLocalArtifact:
    """One workspace-bounded regular file with an exact SHA-256 identity."""

    path: Path
    relative_path: str
    byte_size: int
    checksum_sha256: str


@dataclass(frozen=True, slots=True)
class ClassificationEvidenceArtifact:
    """Parsed evidence and the manifest for the unchanged reviewed bytes."""

    records: tuple[ClassificationEvidence, ...]
    snapshot: StoredSnapshot

    @property
    def checksum_sha256(self) -> str:
        return self.snapshot.manifest.checksum_sha256


def _lowercase_sha256(value: str, label: str) -> str:
    if SHA256_PATTERN.fullmatch(value) is None:
        raise ProvenanceError(f"{label} must be a lowercase SHA-256")
    return value


def validate_local_artifact(
    *,
    root: Path,
    path: Path,
    expected_sha256: str,
    expected_byte_size: int | None = None,
) -> ValidatedLocalArtifact:
    """Validate a regular artifact inside the workspace by path, size, and digest."""

    expected = _lowercase_sha256(expected_sha256, "expected checksum")
    try:
        resolved_root = root.resolve(strict=True)
    except OSError as error:
        raise ProvenanceError("artifact root cannot be resolved") from error
    resolved_path = path.resolve(strict=False)
    try:
        relative_path = resolved_path.relative_to(resolved_root)
    except ValueError as error:
        raise ProvenanceError("artifact path is outside the approved workspace root") from error
    try:
        if not resolved_path.is_file():
            raise ProvenanceError("artifact path must identify a readable regular file")
        byte_size = resolved_path.stat().st_size
    except OSError as error:
        raise ProvenanceError("artifact path cannot be read") from error
    if expected_byte_size is not None:
        if expected_byte_size < 0:
            raise ProvenanceError("expected byte size cannot be negative")
        if byte_size != expected_byte_size:
            raise ProvenanceError("artifact byte size does not match the approved contract")
    digest = hashlib.sha256()
    try:
        with resolved_path.open("rb") as artifact:
            while chunk := artifact.read(1024 * 1024):
                digest.update(chunk)
    except OSError as error:
        raise ProvenanceError("artifact path cannot be read") from error
    checksum = digest.hexdigest()
    if checksum != expected:
        raise ProvenanceError("artifact checksum does not match the approved contract")
    return ValidatedLocalArtifact(
        path=resolved_path,
        relative_path=relative_path.as_posix(),
        byte_size=byte_size,
        checksum_sha256=checksum,
    )


def _read_exact_bytes(artifact: ValidatedLocalArtifact) -> bytes:
    try:
        content = artifact.path.read_bytes()
    except OSError as error:
        raise ProvenanceError("validated artifact bytes cannot be read") from error
    if len(content) != artifact.byte_size or hashlib.sha256(content).hexdigest() != (
        artifact.checksum_sha256
    ):
        raise ProvenanceError("artifact changed after checksum validation")
    return content


def preserve_classification_evidence(
    *,
    root: Path,
    path: Path,
    expected_sha256: str,
    clock: Callable[[], datetime],
    registry: MethodologyRegistry | None = None,
) -> ClassificationEvidenceArtifact:
    """Validate reviewed evidence, then preserve its exact bytes and separate hash."""

    local = validate_local_artifact(
        root=root,
        path=path,
        expected_sha256=expected_sha256,
    )
    content = _read_exact_bytes(local)
    records = read_classification_evidence(content)
    methodology = registry or load_registry()
    snapshot = preserve_snapshot(
        root=root,
        pipeline_slug="food-equity",
        source_key=CLASSIFICATION_EVIDENCE_SOURCE_KEY,
        source_url=f"workspace:{local.relative_path}",
        dataset_version=CLASSIFICATION_EVIDENCE_VERSION,
        content=content,
        schema={"fields": list(CLASSIFICATION_EVIDENCE_FIELDS), "format": "json_array"},
        row_or_feature_count=len(records),
        license="Project-reviewed classification evidence; preserve verifier and evidence terms.",
        methodology_reference=methodology.methodology_version,
        request_metadata={
            "evidence_contract": "super-store-override-v1",
            "source_path": local.relative_path,
        },
        clock=clock,
    )
    if snapshot.manifest.checksum_sha256 != local.checksum_sha256:
        raise ProvenanceError("classification-evidence manifest checksum changed")
    return ClassificationEvidenceArtifact(records, snapshot)


def preserve_walking_network(
    *,
    root: Path,
    path: Path,
    clock: Callable[[], datetime],
    expected_byte_size: int = GEOFABRIK_NETWORK_BYTE_SIZE,
    expected_md5: str = GEOFABRIK_NETWORK_MD5,
    expected_sha256: str = GEOFABRIK_NETWORK_SHA256,
    registry: MethodologyRegistry | None = None,
) -> StoredSnapshot:
    """Validate the immutable PBF and preserve a source manifest for the same bytes."""

    local = validate_local_artifact(
        root=root,
        path=path,
        expected_sha256=expected_sha256,
        expected_byte_size=expected_byte_size,
    )
    network = validate_network_snapshot(
        local.path,
        expected_byte_size=expected_byte_size,
        expected_md5=expected_md5,
        expected_sha256=expected_sha256,
    )
    methodology = registry or load_registry()
    source = next(item for item in methodology.sources if item.key == "walking_network")
    snapshot = preserve_file_snapshot(
        root=root,
        pipeline_slug="food-equity",
        source_key="walking_network",
        source_url=GEOFABRIK_NETWORK_URL,
        dataset_version=source.vintage,
        source_path=local.path,
        schema={
            "artifact": GEOFABRIK_NETWORK_ARTIFACT,
            "graph_version": GRAPH_VERSION,
            "parser": "osmium==4.3.1",
            "projected_crs": PROJECTED_CRS,
            "router": "networkx==3.6.1",
        },
        row_or_feature_count=1,
        license=source.license_notes,
        methodology_reference=methodology.methodology_version,
        request_metadata={
            "artifact": GEOFABRIK_NETWORK_ARTIFACT,
            "published_md5": network.md5,
            "source_path": local.relative_path,
        },
        clock=clock,
    )
    if snapshot.manifest.checksum_sha256 != network.sha256:
        raise ProvenanceError("walking-network manifest checksum changed")
    return snapshot


__all__ = [
    "CLASSIFICATION_EVIDENCE_FIELDS",
    "CLASSIFICATION_EVIDENCE_SOURCE_KEY",
    "CLASSIFICATION_EVIDENCE_VERSION",
    "ClassificationEvidenceArtifact",
    "ProvenanceError",
    "ValidatedLocalArtifact",
    "preserve_classification_evidence",
    "preserve_walking_network",
    "validate_local_artifact",
]
