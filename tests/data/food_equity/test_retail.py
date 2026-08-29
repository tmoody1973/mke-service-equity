from __future__ import annotations

import hashlib
import io
import zipfile
from dataclasses import replace
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from pipelines.food_equity.models import ResourceCategory
from pipelines.food_equity.retail import (
    APPROVED_ARCHIVE_SHA256,
    APPROVED_CSV_SHA256,
    APPROVED_RETAILER_HEADER_SHA256,
    APPROVED_SOURCE_ROW_COUNT,
    RETAILER_ARCHIVE_MEMBER,
    RETAILER_ARCHIVE_MEMBERS,
    RETAILER_HEADER,
    RETAILER_SOURCE_URL,
    SNAPSHOT_DATE,
    SOURCE_ENCODING,
    RetailSourceError,
    classify_store_type,
    fetch_and_preserve_retailers,
    normalize_retailers,
    read_classification_evidence,
    read_retailer_archive,
)


FIXTURE_ROOT = Path(__file__).parents[1] / "fixtures/food_equity/retail"
CSV_FIXTURE = FIXTURE_ROOT / "retailers.csv"
EVIDENCE_FIXTURE = FIXTURE_ROOT / "classification-evidence.json"


def fixture_header_hash(content: bytes | None = None) -> str:
    source = content or CSV_FIXTURE.read_bytes()
    return hashlib.sha256(source.splitlines(keepends=True)[0]).hexdigest()


def archive_bytes(
    *,
    csv_content: bytes | None = None,
    member_names: tuple[str, ...] = RETAILER_ARCHIVE_MEMBERS,
) -> bytes:
    output = io.BytesIO()
    source = csv_content or CSV_FIXTURE.read_bytes()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for member_name in member_names:
            archive.writestr(member_name, source)
    return output.getvalue()


def parse_fixture(content: bytes | None = None):
    return read_retailer_archive(
        archive_bytes(csv_content=content) if content is not None else archive_bytes(),
        expected_header_sha256=fixture_header_hash(),
    )


def review_buffer_contains(longitude: Decimal, latitude: Decimal) -> bool:
    """Synthetic inclusive rectangle standing in for the approved PostGIS buffer."""

    return Decimal("-88.100") <= longitude <= Decimal("-87.800") and Decimal(
        "42.900"
    ) <= latitude <= Decimal("43.200")


def normalize(content: bytes | None = None):
    return normalize_retailers(
        parse_fixture(content),
        classification_evidence=read_classification_evidence(EVIDENCE_FIXTURE.read_bytes()),
        review_buffer_contains=review_buffer_contains,
    )


def by_id(records, source_record_id: str):
    matches = [record for record in records if record.source_record_id == source_record_id]
    assert len(matches) == 1
    return matches[0]


class FakeResponse:
    def __init__(self, content: bytes) -> None:
        self.content = content

    def __enter__(self) -> FakeResponse:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return self.content


def test_locks_exact_pinned_archive_member_header_and_encoding_contract() -> None:
    assert RETAILER_SOURCE_URL == (
        "https://fns-prod.azureedge.us/sites/default/files/resource-files/"
        "snap-retailer-locator-data2005-2025.zip"
    )
    assert RETAILER_ARCHIVE_MEMBERS == ("Historical SNAP Retailer Locator Data 2005-2025.csv",)
    assert RETAILER_ARCHIVE_MEMBER == RETAILER_ARCHIVE_MEMBERS[0]
    assert RETAILER_HEADER == (
        "Record ID",
        "Store Name",
        "Store Type",
        "Street Number",
        "Street Name",
        "Additional Address",
        "City",
        "State",
        "Zip Code",
        "Zip4",
        "County",
        "Latitude",
        "Longitude",
        "Authorization Date",
        "End Date",
    )
    assert APPROVED_RETAILER_HEADER_SHA256 == (
        "026cbfcafecc45d3159fa2e3f6d4b47da276d1f3cbd77419bc3187f1ee344aaa"
    )
    assert APPROVED_ARCHIVE_SHA256 == (
        "872a6f814a63514a1f1b0c4517a90309a9fbb01d97d6e4dbb1e8b20421c08cce"
    )
    assert APPROVED_CSV_SHA256 == (
        "4af9a16811b7d906a2ad077eb59d3f1c7e99a32a87d2bca0900f8d14033c7b9e"
    )
    assert APPROVED_SOURCE_ROW_COUNT == 703_441
    assert SOURCE_ENCODING == "utf-8-sig"
    assert SNAPSHOT_DATE == date(2025, 12, 31)


def test_reads_source_ids_types_dates_and_whitespace_blank_end_dates_strictly() -> None:
    records = normalize()
    active = by_id(records, "R-100")

    assert active.source_key == "snap_retailers"
    assert active.source_vintage == "current through 2025-12-31"
    assert active.name == "Fresh Market"
    assert active.source_store_type == "Supermarket"
    assert active.authorization_date == date(2006, 5, 8)
    assert active.end_date is None
    assert active.status_as_of == SNAPSHOT_DATE
    assert active.authorization_status == "active_at_snapshot"
    assert active.snap_authorized is True
    assert active.active is True


def test_preserves_historical_versions_and_rejects_duplicate_version_identity() -> None:
    records = normalize()
    reopened = [record for record in records if record.source_record_id == "R-113"]

    assert [(record.authorization_date, record.end_date) for record in reopened] == [
        (date(2010, 1, 1), date(2020, 6, 30)),
        (date(2020, 7, 1), None),
    ]
    duplicate = CSV_FIXTURE.read_bytes() + CSV_FIXTURE.read_bytes().splitlines(keepends=True)[-1]
    with pytest.raises(RetailSourceError, match="duplicate.*version"):
        normalize(duplicate)


def test_uses_strict_as_of_status_and_never_promotes_unknown_status() -> None:
    records = normalize()
    ended_on_snapshot = by_id(records, "R-108")
    malformed = by_id(records, "R-109")

    assert ended_on_snapshot.authorization_status == "inactive_at_snapshot"
    assert ended_on_snapshot.snap_authorized is False
    assert ended_on_snapshot.active is False
    assert malformed.authorization_date is None
    assert malformed.authorization_status == "status_unknown"
    assert malformed.snap_authorized is None
    assert malformed.active is False
    assert malformed.status_reason == "malformed_authorization_date"

    end_before_start = CSV_FIXTURE.read_bytes().replace(b"12/31/2025", b"12/31/2005")
    invalid_interval = by_id(normalize(end_before_start), "R-108")
    assert invalid_interval.authorization_status == "status_unknown"
    assert invalid_interval.snap_authorized is None
    assert invalid_interval.active is False


def test_applies_only_the_approved_category_mapping() -> None:
    expected = {
        "Supermarket": (ResourceCategory.FULL_SERVICE_GROCERY, True, False),
        "Large Grocery Store": (ResourceCategory.FULL_SERVICE_GROCERY, True, False),
        "Medium Grocery Store": (ResourceCategory.GROCERY_OTHER, False, False),
        "Convenience Store": (ResourceCategory.CONVENIENCE, False, False),
        "Farmers' Market": (ResourceCategory.SEASONAL_OR_DIRECT, False, False),
        "Military Commissary": (ResourceCategory.RESTRICTED_ACCESS, False, False),
        "Delivery Route": (ResourceCategory.NON_FIXED_OR_ONLINE, False, False),
        "Bakery Specialty": (ResourceCategory.SPECIALTY_BAKERY, False, False),
        "Fruits/Veg Specialty": (ResourceCategory.SPECIALTY_PRODUCE, False, False),
        "Meat/Poultry Specialty": (ResourceCategory.SPECIALTY_MEAT, False, False),
        "Seafood Specialty": (ResourceCategory.SPECIALTY_SEAFOOD, False, False),
        "Super Store": (ResourceCategory.CANDIDATE_FULL_SERVICE, False, True),
    }

    for source_value, contract in expected.items():
        decision = classify_store_type(source_value)
        assert (
            decision.category,
            decision.scoring_eligible,
            decision.requires_override,
        ) == contract

    for unverified_source_value in ("Food Buying Co-op", "Wholesaler", "Unknown"):
        decision = classify_store_type(unverified_source_value)
        assert decision.category is ResourceCategory.UNVERIFIED
        assert decision.scoring_eligible is False


def test_super_store_override_requires_complete_dated_acceptable_evidence() -> None:
    records = normalize()
    positive = by_id(records, "R-102")
    negative = by_id(records, "R-103")

    assert positive.category is ResourceCategory.FULL_SERVICE_GROCERY
    assert positive.full_service_grocery is True
    assert positive.scoring_eligible is True
    assert positive.verification_status == "override_verified"
    assert positive.classification_evidence.resource_id == "R-102"
    assert positive.classification_evidence.verified_at == datetime(
        2025, 12, 15, 18, 30, tzinfo=UTC
    )
    assert negative.category is ResourceCategory.CANDIDATE_FULL_SERVICE
    assert negative.full_service_grocery is False
    assert negative.scoring_eligible is False
    assert negative.classification_evidence.asserted_classification == "candidate_full_service"

    incomplete = EVIDENCE_FIXTURE.read_text(encoding="utf-8").replace(
        '"verifier": "Reviewed fixture verifier"', '"verifier": ""'
    )
    with pytest.raises(RetailSourceError, match="verifier"):
        read_classification_evidence(incomplete.encode())


def test_snap_status_and_store_name_text_never_imply_full_service() -> None:
    records = normalize()

    convenience = by_id(records, "R-104")
    unrecognized = by_id(records, "R-115")
    assert convenience.name == "Neighborhood Supermarket Name"
    assert convenience.snap_authorized is True
    assert convenience.category is ResourceCategory.CONVENIENCE
    assert convenience.full_service_grocery is False
    assert unrecognized.name == "SUPERMARKET SUPER STORE"
    assert unrecognized.snap_authorized is True
    assert unrecognized.category is ResourceCategory.UNVERIFIED
    assert unrecognized.full_service_grocery is False


def test_keeps_nonwalking_retail_types_contextual() -> None:
    records = normalize()

    assert by_id(records, "R-106").category is ResourceCategory.SEASONAL_OR_DIRECT
    assert by_id(records, "R-107").category is ResourceCategory.NON_FIXED_OR_ONLINE
    assert by_id(records, "R-116").category is ResourceCategory.RESTRICTED_ACCESS
    for source_record_id in ("R-106", "R-107", "R-116"):
        record = by_id(records, source_record_id)
        assert record.full_service_grocery is False
        assert record.scoring_eligible is False


def test_preserves_coordinate_and_inclusive_review_buffer_states() -> None:
    records = normalize()
    inside = by_id(records, "R-100")
    boundary = by_id(records, "R-105")
    outside = by_id(records, "R-111")
    invalid = by_id(records, "R-112")
    missing = by_id(records, "R-107")

    assert inside.coordinate_status == "source_coordinate"
    assert inside.in_review_buffer is True
    assert boundary.longitude == Decimal("-88.100")
    assert boundary.in_review_buffer is True
    assert outside.coordinate_status == "source_coordinate"
    assert outside.in_review_buffer is False
    assert invalid.coordinate_status == "invalid"
    assert invalid.latitude is None
    assert invalid.longitude is None
    assert invalid.in_review_buffer is None
    assert missing.coordinate_status == "missing"
    assert missing.latitude is None
    assert missing.longitude is None
    assert missing.in_review_buffer is None
    assert all(record.source_record_id != "R-120" for record in records)


def test_keeps_missing_source_fields_explicit_instead_of_defaulting() -> None:
    records = normalize()
    sparse = by_id(records, "R-110")
    active = by_id(records, "R-100")

    assert sparse.name is None
    assert sparse.source_store_type is None
    assert sparse.address is None
    assert sparse.authorization_date is None
    assert sparse.end_date is None
    assert sparse.category is ResourceCategory.UNVERIFIED
    assert sparse.snap_authorized is None
    assert sparse.coordinate_status == "missing"
    assert active.additional_address is None
    assert active.zip4 is None


def test_normalization_is_independent_of_input_order() -> None:
    parsed = parse_fixture()
    evidence = read_classification_evidence(EVIDENCE_FIXTURE.read_bytes())
    forward = normalize_retailers(
        parsed,
        classification_evidence=evidence,
        review_buffer_contains=review_buffer_contains,
    )
    reverse = normalize_retailers(
        replace(parsed, rows=tuple(reversed(parsed.rows))),
        classification_evidence=tuple(reversed(evidence)),
        review_buffer_contains=review_buffer_contains,
    )

    assert forward == reverse
    assert [(item.source_record_id, item.authorization_date) for item in forward] == sorted(
        (item.source_record_id, item.authorization_date) for item in forward
    )


def test_rejects_archive_member_and_exact_header_drift() -> None:
    with pytest.raises(RetailSourceError, match="archive members"):
        read_retailer_archive(
            archive_bytes(member_names=("renamed.csv",)),
            expected_header_sha256=fixture_header_hash(),
        )

    changed = CSV_FIXTURE.read_bytes().replace(b"Record ID,Store Name", b"Store Name,Record ID")
    with pytest.raises(RetailSourceError, match="header fingerprint"):
        read_retailer_archive(
            archive_bytes(csv_content=changed),
            expected_header_sha256=fixture_header_hash(),
        )


def test_fetches_once_and_preserves_exact_archive_bytes(tmp_path: Path) -> None:
    content = archive_bytes()
    calls: list[str] = []

    def opener(request: object) -> FakeResponse:
        calls.append(request.full_url)  # type: ignore[attr-defined]
        return FakeResponse(content)

    fetched = fetch_and_preserve_retailers(
        tmp_path,
        clock=lambda: datetime(2026, 8, 29, 12, tzinfo=UTC),
        opener=opener,
        sleeper=lambda _seconds: None,
        expected_archive_sha256=hashlib.sha256(content).hexdigest(),
        expected_header_sha256=fixture_header_hash(),
    )

    assert calls == [RETAILER_SOURCE_URL]
    assert fetched.content == content
    assert fetched.snapshot.raw_path.read_bytes() == content
    assert fetched.snapshot.manifest.row_or_feature_count == 22
    assert fetched.snapshot.manifest.request_metadata == {
        "archive_member": RETAILER_ARCHIVE_MEMBER,
        "snapshot_date": "2025-12-31",
    }
    assert fetched.snapshot.manifest.storage_uri.startswith("data/raw/food-equity/snap_retailers/")
