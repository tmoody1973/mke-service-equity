from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request

import pytest

import pipelines.equity_baseline.artifacts as artifacts_module
from pipelines.equity_baseline.artifacts import (
    ArtifactPaths,
    ArtifactCollisionError,
    ArtifactWriteError,
    atomic_write_bytes,
    canonical_json_bytes,
    preserve_snapshot,
    sanitize_metadata,
    sanitize_url,
    schema_fingerprint,
    sha256_bytes,
)
from pipelines.equity_baseline.http import HttpFetchError, ResponseSchemaError, fetch_bytes


NOW = datetime(2026, 8, 28, 12, 30, tzinfo=UTC)


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.body


def test_artifact_paths_are_bounded_below_the_workspace_root(tmp_path: Path) -> None:
    paths = ArtifactPaths.for_root(tmp_path)

    assert paths.raw == tmp_path / "data/raw/equity-baseline"
    assert paths.manifests == tmp_path / "data/manifests/equity-baseline"
    assert paths.reports == tmp_path / "data/reports/equity-baseline"


def test_hash_size_exact_bytes_and_same_checksum_reuse(tmp_path: Path) -> None:
    source_bytes = b'{"rows":[["55079000100",12.5]]}\n'

    first = preserve_snapshot(
        root=tmp_path,
        source_key="acs",
        source_url="https://api.census.gov/data/2024/acs/acs5?get=NAME&key=secret",
        dataset_version="2024 ACS 5-year",
        content=source_bytes,
        schema={"columns": ["GEOID", "value"]},
        row_or_feature_count=1,
        license="United States Census Bureau public data",
        methodology_reference="equity-baseline-v1",
        request_metadata={"query": {"get": "NAME", "key": "secret"}},
        clock=lambda: NOW,
    )
    second = preserve_snapshot(
        root=tmp_path,
        source_key="acs",
        source_url="https://api.census.gov/data/2024/acs/acs5?get=NAME&key=different",
        dataset_version="2024 ACS 5-year",
        content=source_bytes,
        schema={"columns": ["GEOID", "value"]},
        row_or_feature_count=1,
        license="United States Census Bureau public data",
        methodology_reference="equity-baseline-v1",
        request_metadata={"query": {"get": "NAME", "key": "different"}},
        clock=lambda: datetime(2026, 8, 29, tzinfo=UTC),
    )

    expected_hash = sha256_bytes(source_bytes)
    assert first.manifest.checksum_sha256 == expected_hash
    assert first.manifest.byte_size == len(source_bytes)
    assert first.raw_path.read_bytes() == source_bytes
    assert first.raw_path == second.raw_path
    assert first.manifest_path == second.manifest_path
    assert first.reused is False
    assert second.reused is True
    assert second.manifest.retrieved_at == first.manifest.retrieved_at
    assert "secret" not in first.manifest_path.read_text(encoding="utf-8")


def test_different_checksum_creates_a_distinct_snapshot(tmp_path: Path) -> None:
    common = {
        "root": tmp_path,
        "source_key": "places",
        "source_url": "https://data.cdc.gov/resource/cwsq-ngmh.json",
        "dataset_version": "December 2025",
        "schema": {"columns": ["locationid", "measureid"]},
        "row_or_feature_count": 1,
        "license": "CDC public data",
        "methodology_reference": "equity-baseline-v1",
        "request_metadata": {},
        "clock": lambda: NOW,
    }

    first = preserve_snapshot(content=b"first", **common)
    second = preserve_snapshot(content=b"second", **common)

    assert first.raw_path != second.raw_path
    assert first.manifest_path != second.manifest_path
    assert first.raw_path.read_bytes() == b"first"
    assert second.raw_path.read_bytes() == b"second"


def test_schema_fingerprint_and_json_are_canonical() -> None:
    left = {"columns": {"value": "number", "geoid": "string"}, "version": 1}
    right = {"version": 1, "columns": {"geoid": "string", "value": "number"}}

    assert canonical_json_bytes(left) == canonical_json_bytes(right)
    assert canonical_json_bytes(left).decode() == (
        '{"columns":{"geoid":"string","value":"number"},"version":1}'
    )
    assert schema_fingerprint(left) == schema_fingerprint(right)
    assert schema_fingerprint({"version": 2}) != schema_fingerprint(left)


def test_request_metadata_redacts_keys_passwords_and_database_urls() -> None:
    metadata = {
        "key": "census-secret",
        "nested": {
            "password": "database-password",
            "database_url": "postgresql://user:pass@example.test/database",
            "source": "https://example.test/data?api_key=secret&year=2024",
        },
        "safe": "retained",
    }

    sanitized = sanitize_metadata(metadata)
    encoded = canonical_json_bytes(sanitized).decode()

    assert "census-secret" not in encoded
    assert "database-password" not in encoded
    assert "postgresql://" not in encoded
    assert "api_key=secret" not in encoded
    assert '"safe":"retained"' in encoded
    assert sanitize_url("postgresql://user:pass@example.test/database") == "[REDACTED_DATABASE_URL]"
    assert sanitize_url("https://example.test/data?year=2024&key=secret") == (
        "https://example.test/data?key=%5BREDACTED%5D&year=2024"
    )


def test_atomic_write_leaves_no_partial_target_on_replace_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "artifact.bin"

    def fail_replace(_self: Path, _target: Path) -> Path:
        raise OSError("simulated rename failure")

    monkeypatch.setattr(Path, "replace", fail_replace)

    with pytest.raises(ArtifactWriteError, match="atomic write failed"):
        atomic_write_bytes(target, b"complete source bytes")

    assert not target.exists()
    assert list(tmp_path.iterdir()) == []


def test_atomic_write_never_overwrites_an_existing_target(tmp_path: Path) -> None:
    target = tmp_path / "artifact.bin"
    target.write_bytes(b"existing immutable bytes")

    with pytest.raises(ArtifactCollisionError, match="collision"):
        atomic_write_bytes(target, b"different bytes")

    assert target.read_bytes() == b"existing immutable bytes"


def test_manifest_failure_removes_a_new_raw_target(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    real_atomic_write = atomic_write_bytes

    def fail_manifest(target: Path, content: bytes) -> bool:
        if "manifests" in target.parts:
            raise ArtifactWriteError("simulated manifest failure")
        return real_atomic_write(target, content)

    monkeypatch.setattr(artifacts_module, "atomic_write_bytes", fail_manifest)

    with pytest.raises(ArtifactWriteError, match="manifest failure"):
        preserve_snapshot(
            root=tmp_path,
            source_key="acs",
            source_url="https://example.test/data.json",
            dataset_version="2024",
            content=b"source bytes",
            schema={"columns": ["value"]},
            row_or_feature_count=1,
            license="Public data",
            methodology_reference="equity-baseline-v1",
            request_metadata={},
            clock=lambda: NOW,
        )

    assert list((tmp_path / "data/raw/equity-baseline").rglob("*.json")) == []


def test_sanitized_path_collision_cannot_merge_declared_versions(tmp_path: Path) -> None:
    common = {
        "root": tmp_path,
        "source_key": "acs",
        "source_url": "https://example.test/data.json",
        "content": b"same source bytes",
        "schema": {"columns": ["value"]},
        "row_or_feature_count": 1,
        "license": "Public data",
        "methodology_reference": "equity-baseline-v1",
        "request_metadata": {},
        "clock": lambda: NOW,
    }
    preserve_snapshot(dataset_version="2024 ACS", **common)

    with pytest.raises(ArtifactCollisionError, match="provenance"):
        preserve_snapshot(dataset_version="2024-ACS", **common)


def test_fetch_retries_network_errors_with_injected_backoff() -> None:
    outcomes: list[object] = [
        URLError("temporary one"),
        URLError("temporary two"),
        URLError("temporary three"),
        FakeResponse(b"ok"),
    ]
    sleeps: list[float] = []
    requested: list[str] = []

    def opener(request: Request) -> FakeResponse:
        requested.append(request.full_url)
        outcome = outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        assert isinstance(outcome, FakeResponse)
        return outcome

    result = fetch_bytes(
        "https://example.test/data?key=secret",
        opener=opener,
        sleeper=sleeps.append,
    )

    assert result == b"ok"
    assert len(requested) == 4
    assert sleeps == [1.0, 2.0, 4.0]


def test_fetch_retries_5xx_but_fails_immediately_for_4xx() -> None:
    sleeps: list[float] = []
    service_outcomes: list[object] = [
        HTTPError("https://example.test", 503, "unavailable", None, None),
        FakeResponse(b"recovered"),
    ]

    def service_opener(_request: Request) -> FakeResponse:
        outcome = service_outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        assert isinstance(outcome, FakeResponse)
        return outcome

    assert (
        fetch_bytes("https://example.test/data", opener=service_opener, sleeper=sleeps.append)
        == b"recovered"
    )
    assert sleeps == [1.0]

    calls = 0

    def missing_opener(_request: Request) -> FakeResponse:
        nonlocal calls
        calls += 1
        raise HTTPError("https://example.test", 404, "not found", None, None)

    with pytest.raises(HttpFetchError, match="HTTP 404"):
        fetch_bytes("https://example.test/missing", opener=missing_opener, sleeper=sleeps.append)

    assert calls == 1
    assert sleeps == [1.0]


def test_fetch_does_not_retry_schema_errors_or_leak_query_keys() -> None:
    calls = 0
    sleeps: list[float] = []

    def opener(_request: Request) -> FakeResponse:
        nonlocal calls
        calls += 1
        return FakeResponse(b'{"unexpected":true}')

    def reject_schema(_content: bytes) -> None:
        raise ResponseSchemaError("missing required rows")

    with pytest.raises(ResponseSchemaError, match="missing required rows"):
        fetch_bytes(
            "https://example.test/data?key=super-secret",
            opener=opener,
            sleeper=sleeps.append,
            validator=reject_schema,
        )

    assert calls == 1
    assert sleeps == []

    def always_unavailable(_request: Request) -> FakeResponse:
        raise URLError("offline")

    with pytest.raises(HttpFetchError) as error:
        fetch_bytes(
            "https://example.test/data?key=super-secret",
            opener=always_unavailable,
            sleeper=lambda _delay: None,
        )

    assert "super-secret" not in str(error.value)
    assert "%5BREDACTED%5D" in str(error.value)


def test_manifest_json_is_canonical_and_contains_required_provenance(tmp_path: Path) -> None:
    stored = preserve_snapshot(
        root=tmp_path,
        source_key="tiger",
        source_url="https://www2.census.gov/geo/tiger/TIGER2020/TRACT/tl_2020_55_tract.zip",
        dataset_version="2020 TIGER/Line",
        content=b"zip bytes",
        schema={"geometry": "MultiPolygon", "crs": "source-declared"},
        row_or_feature_count=409,
        license="United States Census Bureau public data",
        methodology_reference="equity-baseline-v1",
        request_metadata={"county": "079", "state": "55"},
        clock=lambda: NOW,
    )

    manifest_bytes = stored.manifest_path.read_bytes()
    parsed = json.loads(manifest_bytes)

    assert manifest_bytes == canonical_json_bytes(parsed)
    assert parsed["retrieved_at"] == "2026-08-28T12:30:00Z"
    assert parsed["row_or_feature_count"] == 409
    assert parsed["storage_uri"].startswith("data/raw/equity-baseline/tiger/")
    assert parsed["schema_fingerprint"] == schema_fingerprint(
        {"geometry": "MultiPolygon", "crs": "source-declared"}
    )
