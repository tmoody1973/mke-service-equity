from __future__ import annotations

import hashlib
import io
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import pytest

from pipelines.food_equity.sram import (
    APPROVED_DRIVING_HEADER_SHA256,
    DRIVING_DATA_MEMBER,
    DRIVING_LOOKUP_MEMBER,
    REQUIRED_DRIVING_COLUMNS,
    SRAM_ARCHIVE_MEMBERS,
    SRAM_SOURCE_URL,
    SOURCE_ENCODING,
    SramSourceError,
    fetch_and_preserve_sram,
    normalize_sram,
    read_sram_archive,
)


FIXTURE_ROOT = Path(__file__).parents[1] / "fixtures/food_equity/sram"
EXPECTED_GEOIDS = ("55079000101", "55079000202", "55079990000")


def fixture_header_hash() -> str:
    return hashlib.sha256(
        (FIXTURE_ROOT / "driving.csv").read_bytes().splitlines(keepends=True)[0]
    ).hexdigest()


def archive_bytes(
    *,
    driving: bytes | None = None,
    lookup: bytes | None = None,
    readme: bytes | None = None,
    member_names: tuple[str, ...] = SRAM_ARCHIVE_MEMBERS,
) -> bytes:
    content_by_name = {
        DRIVING_DATA_MEMBER: driving or (FIXTURE_ROOT / "driving.csv").read_bytes(),
        DRIVING_LOOKUP_MEMBER: lookup or (FIXTURE_ROOT / "driving-lookup.csv").read_bytes(),
        "SRAM Read Me.txt": readme or (FIXTURE_ROOT / "readme.txt").read_bytes(),
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in member_names:
            archive.writestr(name, content_by_name.get(name, b"reviewed fixture\n"))
    return output.getvalue()


def parse_fixture(content: bytes | None = None):
    return read_sram_archive(
        content or archive_bytes(),
        expected_header_sha256=fixture_header_hash(),
    )


class FakeResponse:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.content


def test_locks_exact_approved_archive_contract_and_schema_fingerprint() -> None:
    assert SRAM_SOURCE_URL == (
        "https://www.ers.usda.gov/media/29395/"
        "2025-snap-authorized-retailer-access-map-sram-data.zip?v=81233"
    )
    assert SRAM_ARCHIVE_MEMBERS == (
        "SRAM Driving Distance Data.csv",
        "SRAM General Tract Characteristics Data.csv",
        "SRAM Straight Line Distance Data.csv",
        "SRAM Variable Lookup Driving Distance.csv",
        "SRAM Variable Lookup General Tract Characteristics.csv",
        "SRAM Variable Lookup Straight Line Distance.csv",
        "SRAM Read Me.txt",
    )
    assert REQUIRED_DRIVING_COLUMNS == {
        "CensusTract20",
        "State",
        "County20",
        "County24",
        "DD_SRAM_lapop1",
        "DD_SRAM_lapop1share",
    }
    assert APPROVED_DRIVING_HEADER_SHA256 == (
        "8034b4d6aa2fe69ca4ddbe3d91649f6cf5f249a728ea13a70a2810596039fc64"
    )
    assert SOURCE_ENCODING == "cp1252"


def test_reads_only_the_driving_benchmark_and_returns_sorted_typed_records() -> None:
    result = normalize_sram(parse_fixture(), expected_geoids=EXPECTED_GEOIDS, expected_count=3)

    assert [record.geoid for record in result] == list(EXPECTED_GEOIDS)
    assert result[0].population_beyond_one_mile == 1701
    assert str(result[0].population_share_beyond_one_mile) == "37.51"
    assert result[0].quality_status == "verified"
    assert result[0].source_method == "driving_network_based"
    assert result[0].metric_slug == "sram_snap_low_access_share_1mi"
    assert result[0].unit == "percent"
    assert result[2].population_beyond_one_mile is None
    assert result[2].population_share_beyond_one_mile is None
    assert result[2].quality_status == "missing"
    assert result[2].quality_reason == "source_row_missing"


def test_preserves_explicit_source_blanks_as_missing_not_zero() -> None:
    driving = (
        (FIXTURE_ROOT / "driving.csv")
        .read_text(encoding="utf-8")
        .replace("1701,37.51", ",")
        .encode()
    )
    parsed = read_sram_archive(
        archive_bytes(driving=driving),
        expected_header_sha256=hashlib.sha256(driving.splitlines(keepends=True)[0]).hexdigest(),
    )

    record = normalize_sram(parsed, expected_geoids=EXPECTED_GEOIDS, expected_count=3)[0]

    assert record.population_beyond_one_mile is None
    assert record.population_share_beyond_one_mile is None
    assert record.quality_status == "missing"
    assert record.quality_reason == "source_blank"


@pytest.mark.parametrize(
    ("old", "new", "message"),
    [
        ("3227,52.82", "-1,52.82", "population count"),
        ("3227,52.82", "3227,100.01", "population share"),
        ("3227,52.82", "not-a-number,52.82", "numeric"),
    ],
)
def test_rejects_invalid_numeric_ranges(old: str, new: str, message: str) -> None:
    driving = (FIXTURE_ROOT / "driving.csv").read_text(encoding="utf-8").replace(old, new).encode()
    parsed = read_sram_archive(
        archive_bytes(driving=driving),
        expected_header_sha256=hashlib.sha256(driving.splitlines(keepends=True)[0]).hexdigest(),
    )

    with pytest.raises(SramSourceError, match=message):
        normalize_sram(parsed, expected_geoids=EXPECTED_GEOIDS, expected_count=3)


@pytest.mark.parametrize(
    ("transform", "message"),
    [
        (lambda text: text.replace("55079000101", "55079000202"), "duplicate"),
        (
            lambda text: text.replace(
                "55025000100,Wisconsin,Dane County,Dane County",
                "55079000300,Wisconsin,Milwaukee County,Milwaukee County",
            ),
            "extra",
        ),
        (lambda text: text.replace("55079000101", "5507900010X"), "11 digits"),
    ],
)
def test_rejects_duplicate_extra_or_invalid_geoids(transform, message: str) -> None:
    driving = transform((FIXTURE_ROOT / "driving.csv").read_text(encoding="utf-8")).encode()
    parsed = read_sram_archive(
        archive_bytes(driving=driving),
        expected_header_sha256=hashlib.sha256(driving.splitlines(keepends=True)[0]).hexdigest(),
    )

    with pytest.raises(SramSourceError, match=message):
        normalize_sram(parsed, expected_geoids=EXPECTED_GEOIDS, expected_count=3)


def test_rejects_duplicate_or_wrong_sized_canonical_universe() -> None:
    parsed = parse_fixture()

    with pytest.raises(SramSourceError, match="duplicate canonical"):
        normalize_sram(
            parsed,
            expected_geoids=("55079000101", "55079000101"),
            expected_count=2,
        )
    with pytest.raises(SramSourceError, match="exactly 302"):
        normalize_sram(parsed, expected_geoids=EXPECTED_GEOIDS)


def test_rejects_archive_member_schema_release_and_method_drift() -> None:
    with pytest.raises(SramSourceError, match="archive members"):
        parse_fixture(archive_bytes(member_names=SRAM_ARCHIVE_MEMBERS[:-1]))

    with pytest.raises(SramSourceError, match="header fingerprint"):
        read_sram_archive(archive_bytes())

    changed_release = (FIXTURE_ROOT / "readme.txt").read_bytes().replace(b"July 2026", b"July 2025")
    with pytest.raises(SramSourceError, match="release"):
        parse_fixture(archive_bytes(readme=changed_release))

    changed_method = (
        (FIXTURE_ROOT / "driving-lookup.csv")
        .read_bytes()
        .replace(b"driving (network-based) distance", b"straight line distance")
    )
    with pytest.raises(SramSourceError, match="driving method"):
        parse_fixture(archive_bytes(lookup=changed_method))


def test_fetches_once_and_preserves_the_exact_archive_bytes(tmp_path: Path) -> None:
    content = archive_bytes()
    calls: list[str] = []

    def opener(request: object) -> FakeResponse:
        calls.append(request.full_url)  # type: ignore[attr-defined]
        return FakeResponse(content)

    fetched = fetch_and_preserve_sram(
        tmp_path,
        clock=lambda: datetime(2026, 8, 29, 12, tzinfo=UTC),
        opener=opener,
        sleeper=lambda _seconds: None,
        expected_header_sha256=fixture_header_hash(),
    )

    assert calls == [SRAM_SOURCE_URL]
    assert fetched.content == content
    assert fetched.snapshot.raw_path.read_bytes() == content
    assert fetched.snapshot.manifest.row_or_feature_count == 3
    assert fetched.snapshot.manifest.request_metadata == {
        "archive_member": DRIVING_DATA_MEMBER,
        "release": "July 2026",
    }
    assert fetched.snapshot.manifest.storage_uri.startswith("data/raw/food-equity/sram/")
