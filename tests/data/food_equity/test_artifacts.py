from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from pipelines.common.artifacts import (
    ArtifactCollisionError,
    ArtifactError,
    ArtifactPaths,
    preserve_file_snapshot,
    preserve_snapshot,
)
from pipelines.equity_baseline.artifacts import ArtifactPaths as EquityArtifactPaths


NOW = datetime(2026, 8, 29, 16, 0, tzinfo=UTC)


def _preserve(root: Path, *, pipeline_slug: str = "food-equity", content: bytes = b"source"):
    return preserve_snapshot(
        root=root,
        pipeline_slug=pipeline_slug,
        source_key="sram",
        source_url="https://example.test/sram.zip?api_key=secret",
        dataset_version="2025 SRAM",
        content=content,
        schema={"columns": ["CensusTract20", "DD_SRAM_lapop1share"]},
        row_or_feature_count=1,
        license="USDA public data",
        methodology_reference="food-equity-v1",
        request_metadata={"query": {"api_key": "secret"}},
        clock=lambda: NOW,
    )


def test_food_artifact_paths_are_isolated_and_plan_2_paths_do_not_change(tmp_path: Path) -> None:
    food = ArtifactPaths.for_pipeline(tmp_path, "food-equity")
    equity = EquityArtifactPaths.for_root(tmp_path)

    assert food.raw == tmp_path / "data/raw/food-equity"
    assert food.manifests == tmp_path / "data/manifests/food-equity"
    assert food.reports == tmp_path / "data/reports/food-equity"
    assert equity.raw == tmp_path / "data/raw/equity-baseline"
    assert equity.manifests == tmp_path / "data/manifests/equity-baseline"
    assert equity.reports == tmp_path / "data/reports/equity-baseline"


def test_food_snapshot_is_immutable_sanitized_and_reused(tmp_path: Path) -> None:
    first = _preserve(tmp_path)
    second = _preserve(tmp_path)

    assert first.raw_path == second.raw_path
    assert first.manifest_path == second.manifest_path
    assert first.reused is False
    assert second.reused is True
    assert "data/raw/food-equity/sram/" in first.manifest.storage_uri
    manifest_text = first.manifest_path.read_text(encoding="utf-8")
    assert "secret" not in manifest_text
    assert "%5BREDACTED%5D" in manifest_text


def test_pipeline_namespaces_cannot_collide(tmp_path: Path) -> None:
    food = _preserve(tmp_path, pipeline_slug="food-equity")
    baseline = _preserve(tmp_path, pipeline_slug="equity-baseline")

    assert food.raw_path != baseline.raw_path
    assert food.manifest_path != baseline.manifest_path
    assert food.raw_path.read_bytes() == baseline.raw_path.read_bytes() == b"source"


def test_food_snapshot_detects_content_address_collision(tmp_path: Path) -> None:
    stored = _preserve(tmp_path)
    stored.raw_path.write_bytes(b"tampered")

    with pytest.raises(ArtifactCollisionError, match="collision"):
        _preserve(tmp_path)


def test_file_snapshot_streams_and_reuses_exact_bytes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "inputs/network.pbf"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"network-bytes")

    original_read_bytes = Path.read_bytes

    def fail_source_read_bytes(path: Path) -> bytes:
        if path == source:
            raise AssertionError("large source files must not be loaded with read_bytes")
        return original_read_bytes(path)

    monkeypatch.setattr(Path, "read_bytes", fail_source_read_bytes)
    first = preserve_file_snapshot(
        root=tmp_path,
        pipeline_slug="food-equity",
        source_key="walking_network",
        source_url="https://example.test/network.pbf",
        dataset_version="2026-08-27",
        source_path=source,
        schema={"format": "osm-pbf"},
        row_or_feature_count=1,
        license="ODbL",
        methodology_reference="food-equity-v1",
        request_metadata={"source_path": "inputs/network.pbf"},
        clock=lambda: NOW,
    )
    second = preserve_file_snapshot(
        root=tmp_path,
        pipeline_slug="food-equity",
        source_key="walking_network",
        source_url="https://example.test/network.pbf",
        dataset_version="2026-08-27",
        source_path=source,
        schema={"format": "osm-pbf"},
        row_or_feature_count=1,
        license="ODbL",
        methodology_reference="food-equity-v1",
        request_metadata={"source_path": "inputs/network.pbf"},
        clock=lambda: NOW,
    )

    assert first.raw_path.open("rb").read() == b"network-bytes"
    assert first.reused is False
    assert second.reused is True
    assert first.manifest == second.manifest


def test_file_snapshot_detects_existing_content_address_collision(tmp_path: Path) -> None:
    source = tmp_path / "inputs/network.pbf"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"network-bytes")
    stored = preserve_file_snapshot(
        root=tmp_path,
        pipeline_slug="food-equity",
        source_key="walking_network",
        source_url="https://example.test/network.pbf",
        dataset_version="2026-08-27",
        source_path=source,
        schema={"format": "osm-pbf"},
        row_or_feature_count=1,
        license="ODbL",
        methodology_reference="food-equity-v1",
        request_metadata={},
        clock=lambda: NOW,
    )
    stored.raw_path.write_bytes(b"tampered")

    with pytest.raises(ArtifactCollisionError, match="collision"):
        preserve_file_snapshot(
            root=tmp_path,
            pipeline_slug="food-equity",
            source_key="walking_network",
            source_url="https://example.test/network.pbf",
            dataset_version="2026-08-27",
            source_path=source,
            schema={"format": "osm-pbf"},
            row_or_feature_count=1,
            license="ODbL",
            methodology_reference="food-equity-v1",
            request_metadata={},
            clock=lambda: NOW,
        )


@pytest.mark.parametrize("pipeline_slug", ["", "..", "food/equity"])
def test_pipeline_slug_must_be_an_exact_safe_segment(tmp_path: Path, pipeline_slug: str) -> None:
    with pytest.raises(ArtifactError, match="pipeline_slug"):
        ArtifactPaths.for_pipeline(tmp_path, pipeline_slug)
