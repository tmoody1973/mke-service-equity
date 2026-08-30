from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from pipelines.food_equity.origins import (
    TRACT_ORIGIN_HEADER,
    TRACT_ORIGIN_SOURCE_URL,
    TractOriginSourceError,
    fetch_and_preserve_tract_origins,
    normalize_tract_origins,
    read_tract_origins,
)


NOW = datetime(2026, 8, 29, 16, 0, tzinfo=UTC)


class FakeResponse:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self, _amount: int = -1) -> bytes:
        return self.content


def source_bytes(*rows: str) -> bytes:
    text = ",".join(TRACT_ORIGIN_HEADER) + "\n" + "\n".join(rows) + "\n"
    return b"\xef\xbb\xbf" + text.encode("utf-8")


def test_parses_exact_official_bom_header_and_milwaukee_identity() -> None:
    content = source_bytes(
        "55,079,000101,1000,+43.040123,-087.910123",
        "55,079,000200,0,+43.050456,-087.920456",
        "55,001,950100,3242,+44.205662,-089.797431",
    )

    parsed = read_tract_origins(
        content,
        expected_sha256=hashlib.sha256(content).hexdigest(),
        expected_row_count=3,
    )
    records = normalize_tract_origins(
        parsed,
        expected_geoids=("55079000200", "55079000101"),
        source_snapshot_sha256=parsed.source_sha256,
        expected_count=2,
    )

    assert tuple(record.geoid for record in records) == ("55079000101", "55079000200")
    assert all(record.source_snapshot_sha256 == parsed.source_sha256 for record in records)
    assert all(record.x.is_finite() and record.y.is_finite() for record in records)
    assert records[0].longitude == Decimal("-87.910123")
    assert records[0].latitude == Decimal("43.040123")
    assert records[0].population == 1000


@pytest.mark.parametrize(
    ("content", "message"),
    [
        (b"STATEFP,COUNTYFP,TRACTCE,POPULATION,LATITUDE,LONGITUDE\n", "BOM"),
        (
            source_bytes("55,079,000101,1000,nan,-087.910123"),
            "latitude",
        ),
        (
            source_bytes("55,079,000101,-1,+43.040123,-087.910123"),
            "population",
        ),
    ],
)
def test_rejects_changed_or_invalid_source_data(content: bytes, message: str) -> None:
    with pytest.raises(TractOriginSourceError, match=message):
        read_tract_origins(content)


def test_reconciliation_rejects_missing_extra_and_duplicate_geoids() -> None:
    content = source_bytes(
        "55,079,000101,1000,+43.040123,-087.910123",
        "55,079,000101,1000,+43.040123,-087.910123",
    )
    parsed = read_tract_origins(content)

    with pytest.raises(TractOriginSourceError, match="duplicate"):
        normalize_tract_origins(
            parsed,
            expected_geoids=("55079000101",),
            source_snapshot_sha256=parsed.source_sha256,
            expected_count=1,
        )


def test_fetches_validates_and_preserves_exact_origin_artifact(tmp_path: Path) -> None:
    content = source_bytes(
        "55,079,000101,1000,+43.040123,-087.910123",
        "55,079,000200,0,+43.050456,-087.920456",
    )
    calls: list[str] = []

    def opener(request: object) -> FakeResponse:
        calls.append(request.full_url)  # type: ignore[attr-defined]
        return FakeResponse(content)

    fetched = fetch_and_preserve_tract_origins(
        tmp_path,
        clock=lambda: NOW,
        opener=opener,
        sleeper=lambda _seconds: None,
        expected_sha256=hashlib.sha256(content).hexdigest(),
        expected_row_count=2,
    )

    assert calls == [TRACT_ORIGIN_SOURCE_URL]
    assert fetched.snapshot.raw_path.read_bytes() == content
    assert fetched.snapshot.manifest.source_key == "tract_origins"
    assert fetched.snapshot.manifest.checksum_sha256 == hashlib.sha256(content).hexdigest()
    assert fetched.snapshot.manifest.row_or_feature_count == 2
    assert fetched.snapshot.manifest.request_metadata == {
        "county_filter": "079",
        "header": list(TRACT_ORIGIN_HEADER),
        "state_filter": "55",
    }


def test_source_checksum_and_manifest_checksum_must_be_lowercase_sha256(tmp_path: Path) -> None:
    content = source_bytes("55,079,000101,1000,+43.040123,-087.910123")
    with pytest.raises(TractOriginSourceError, match="SHA-256"):
        read_tract_origins(content, expected_sha256="A" * 64)

    with pytest.raises(TractOriginSourceError, match="source snapshot SHA-256"):
        normalize_tract_origins(
            read_tract_origins(content),
            expected_geoids=("55079000101",),
            source_snapshot_sha256="A" * 64,
            expected_count=1,
        )
