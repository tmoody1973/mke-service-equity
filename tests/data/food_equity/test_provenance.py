from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from pipelines.food_equity.provenance import (
    ProvenanceError,
    preserve_classification_evidence,
    preserve_walking_network,
    validate_local_artifact,
)


NOW = datetime(2026, 8, 29, 16, 0, tzinfo=UTC)


def test_local_artifact_path_is_bounded_and_checksum_verified(tmp_path: Path) -> None:
    artifact = tmp_path / "data/source.bin"
    artifact.parent.mkdir(parents=True)
    artifact.write_bytes(b"source")
    digest = hashlib.sha256(b"source").hexdigest()

    verified = validate_local_artifact(
        root=tmp_path,
        path=artifact,
        expected_sha256=digest,
        expected_byte_size=6,
    )
    assert verified.relative_path == "data/source.bin"
    assert verified.checksum_sha256 == digest

    with pytest.raises(ProvenanceError, match="outside"):
        validate_local_artifact(
            root=tmp_path,
            path=tmp_path.parent / "outside.bin",
            expected_sha256=digest,
        )
    with pytest.raises(ProvenanceError, match="checksum"):
        validate_local_artifact(root=tmp_path, path=artifact, expected_sha256="0" * 64)


def test_classification_evidence_is_parsed_then_preserved_without_invention(
    tmp_path: Path,
) -> None:
    evidence_path = tmp_path / "review/classification-evidence.json"
    evidence_path.parent.mkdir(parents=True)
    evidence = [
        {
            "resource_id": "R-102",
            "asserted_classification": "full_service_grocery",
            "evidence_type": "manual_verification",
            "evidence_url": "https://example.test/review/R-102",
            "partner_document_reference": None,
            "verifier": "Reviewer",
            "verified_at": "2026-08-20T15:00:00Z",
            "notes": "Open to the public without membership.",
        }
    ]
    evidence_path.write_text(json.dumps(evidence), encoding="utf-8")
    digest = hashlib.sha256(evidence_path.read_bytes()).hexdigest()

    result = preserve_classification_evidence(
        root=tmp_path,
        path=evidence_path,
        expected_sha256=digest,
        clock=lambda: NOW,
    )

    assert result.checksum_sha256 == digest
    assert result.records[0].resource_id == "R-102"
    assert result.snapshot.manifest.source_key == "full_service_classification_evidence"
    assert result.snapshot.manifest.row_or_feature_count == 1
    assert result.snapshot.manifest.request_metadata == {
        "evidence_contract": "super-store-override-v1",
        "source_path": "review/classification-evidence.json",
    }


def test_walking_network_helper_reuses_exact_validator_and_manifest_contract(
    tmp_path: Path,
) -> None:
    path = tmp_path / "data/raw/walking-network.pbf"
    path.parent.mkdir(parents=True)
    content = b"synthetic-pbf"
    path.write_bytes(content)
    sha256 = hashlib.sha256(content).hexdigest()
    md5 = hashlib.md5(content, usedforsecurity=False).hexdigest()

    result = preserve_walking_network(
        root=tmp_path,
        path=path,
        clock=lambda: NOW,
        expected_byte_size=len(content),
        expected_md5=md5,
        expected_sha256=sha256,
    )

    assert result.manifest.checksum_sha256 == sha256
    assert result.manifest.source_key == "walking_network"
    assert result.manifest.request_metadata == {
        "artifact": "wisconsin-260827.osm.pbf",
        "published_md5": md5,
        "source_path": "data/raw/walking-network.pbf",
    }
