"""Acquire, normalize, and classify the pinned USDA FNS retailer history."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import zipfile
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import cast

from pipelines.common.artifacts import StoredSnapshot, preserve_snapshot
from pipelines.common.http import Opener, Sleeper, fetch_bytes
from pipelines.food_equity.errors import SourceValidationError
from pipelines.food_equity.models import MethodologyRegistry, ResourceCategory
from pipelines.food_equity.registry import load_registry

RETAILER_SOURCE_URL = (
    "https://fns-prod.azureedge.us/sites/default/files/resource-files/"
    "snap-retailer-locator-data2005-2025.zip"
)
RETAILER_ARCHIVE_MEMBER = "Historical SNAP Retailer Locator Data 2005-2025.csv"
RETAILER_ARCHIVE_MEMBERS = (RETAILER_ARCHIVE_MEMBER,)
RETAILER_HEADER = (
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
APPROVED_RETAILER_HEADER_SHA256 = "026cbfcafecc45d3159fa2e3f6d4b47da276d1f3cbd77419bc3187f1ee344aaa"
APPROVED_ARCHIVE_SHA256 = "872a6f814a63514a1f1b0c4517a90309a9fbb01d97d6e4dbb1e8b20421c08cce"
APPROVED_CSV_SHA256 = "4af9a16811b7d906a2ad077eb59d3f1c7e99a32a87d2bca0900f8d14033c7b9e"
APPROVED_SOURCE_ROW_COUNT = 703_441
SOURCE_ENCODING = "utf-8-sig"
SNAPSHOT_DATE = date(2025, 12, 31)
MAX_UNCOMPRESSED_BYTES = 100_000_000
EVIDENCE_TYPES = frozenset(
    {
        "authoritative_structured_local_category",
        "partner_provided_classification",
        "manual_verification",
    }
)

ReviewBufferContains = Callable[[Decimal, Decimal], bool]


class RetailSourceError(SourceValidationError):
    """Raised when retailer source bytes or evidence violate the approved contract."""


@dataclass(frozen=True, slots=True)
class RawRetailerRow:
    """One exact source row before semantic validation."""

    source_record_id: str
    name: str
    source_store_type: str
    street_number: str
    street_name: str
    additional_address: str
    city: str
    state: str
    zip_code: str
    zip4: str
    county: str
    latitude: str
    longitude: str
    authorization_date: str
    end_date: str


@dataclass(frozen=True, slots=True)
class ParsedRetailerArchive:
    """Validated retailer CSV rows plus immutable source fingerprints."""

    rows: tuple[RawRetailerRow, ...]
    archive_sha256: str
    csv_sha256: str
    header_sha256: str


@dataclass(frozen=True, slots=True)
class ClassificationEvidence:
    """Reviewed positive or negative evidence for one Super Store."""

    resource_id: str
    asserted_classification: str
    evidence_type: str
    evidence_url: str | None
    partner_document_reference: str | None
    verifier: str
    verified_at: datetime
    notes: str


@dataclass(frozen=True, slots=True)
class ClassificationDecision:
    """One declarative source-type classification before operational eligibility."""

    category: ResourceCategory
    scoring_eligible: bool
    requires_override: bool
    reason: str


@dataclass(frozen=True, slots=True)
class RetailerRecord:
    """One normalized historical retailer version with explicit quality states."""

    source_record_id: str
    name: str | None
    source_store_type: str | None
    street_number: str | None
    street_name: str | None
    additional_address: str | None
    city: str | None
    state: str | None
    zip_code: str | None
    zip4: str | None
    county: str | None
    address: str | None
    latitude: Decimal | None
    longitude: Decimal | None
    coordinate_status: str
    in_review_buffer: bool | None
    authorization_date: date | None
    end_date: date | None
    status_as_of: date
    authorization_status: str
    status_reason: str | None
    snap_authorized: bool | None
    active: bool
    category: ResourceCategory
    full_service_grocery: bool
    scoring_eligible: bool
    verification_status: str
    classification_reason: str
    classification_evidence: ClassificationEvidence | None
    source_key: str = "snap_retailers"
    source_vintage: str = "current through 2025-12-31"

    @property
    def version_identity(self) -> tuple[str, date | None, date | None]:
        return (self.source_record_id, self.authorization_date, self.end_date)


@dataclass(frozen=True, slots=True)
class FetchedRetailers:
    """Fetched retailer archive, parsed rows, and immutable snapshot."""

    content: bytes
    archive: ParsedRetailerArchive
    snapshot: StoredSnapshot


def _zip_member(content: bytes) -> bytes:
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as error:
        raise RetailSourceError("retailer response is not a valid ZIP archive") from error
    with archive:
        infos = archive.infolist()
        names = tuple(info.filename for info in infos)
        if names != RETAILER_ARCHIVE_MEMBERS or len(names) != len(set(names)):
            raise RetailSourceError("retailer archive members do not match the approved artifact")
        info = infos[0]
        if info.is_dir() or info.flag_bits & 0x1:
            raise RetailSourceError("retailer archive member cannot be a directory or encrypted")
        if info.file_size > MAX_UNCOMPRESSED_BYTES:
            raise RetailSourceError("retailer archive exceeds the approved uncompressed size bound")
        try:
            return archive.read(RETAILER_ARCHIVE_MEMBER)
        except (KeyError, RuntimeError, zipfile.BadZipFile) as error:
            raise RetailSourceError("retailer archive member cannot be read") from error


def _decode_csv(content: bytes) -> str:
    if not content.startswith(b"\xef\xbb\xbf"):
        raise RetailSourceError("retailer CSV must use the approved UTF-8 BOM encoding")
    try:
        return content.decode(SOURCE_ENCODING)
    except UnicodeDecodeError as error:
        raise RetailSourceError("retailer CSV is not valid UTF-8") from error


def _raw_row(row: Mapping[str, str]) -> RawRetailerRow:
    return RawRetailerRow(
        source_record_id=row["Record ID"].strip(),
        name=row["Store Name"].strip(),
        source_store_type=row["Store Type"].strip(),
        street_number=row["Street Number"].strip(),
        street_name=row["Street Name"].strip(),
        additional_address=row["Additional Address"].strip(),
        city=row["City"].strip(),
        state=row["State"].strip(),
        zip_code=row["Zip Code"].strip(),
        zip4=row["Zip4"].strip(),
        county=row["County"].strip(),
        latitude=row["Latitude"].strip(),
        longitude=row["Longitude"].strip(),
        authorization_date=row["Authorization Date"].strip(),
        end_date=row["End Date"].strip(),
    )


def read_retailer_archive(
    content: bytes,
    *,
    expected_archive_sha256: str | None = None,
    expected_csv_sha256: str | None = None,
    expected_header_sha256: str = APPROVED_RETAILER_HEADER_SHA256,
    expected_row_count: int | None = None,
) -> ParsedRetailerArchive:
    """Validate exact archive structure and parse the pinned CSV strictly."""

    archive_sha256 = hashlib.sha256(content).hexdigest()
    if expected_archive_sha256 is not None and archive_sha256 != expected_archive_sha256:
        raise RetailSourceError("retailer archive SHA-256 does not match the approved artifact")
    csv_content = _zip_member(content)
    csv_sha256 = hashlib.sha256(csv_content).hexdigest()
    if expected_csv_sha256 is not None and csv_sha256 != expected_csv_sha256:
        raise RetailSourceError("retailer CSV SHA-256 does not match the approved member")
    first_line = csv_content.splitlines(keepends=True)
    if not first_line:
        raise RetailSourceError("retailer CSV is empty")
    header_sha256 = hashlib.sha256(first_line[0]).hexdigest()
    if header_sha256 != expected_header_sha256:
        raise RetailSourceError("retailer header fingerprint does not match the approved schema")

    reader = csv.DictReader(io.StringIO(_decode_csv(csv_content), newline=""))
    if tuple(reader.fieldnames or ()) != RETAILER_HEADER:
        raise RetailSourceError("retailer header columns or order changed")
    rows: list[RawRetailerRow] = []
    for position, row in enumerate(reader, start=2):
        if None in row or any(value is None for value in row.values()):
            raise RetailSourceError(f"retailer CSV row {position} has the wrong width")
        parsed = _raw_row(cast(Mapping[str, str], row))
        if not parsed.source_record_id:
            raise RetailSourceError(f"retailer CSV row {position} has no Record ID")
        rows.append(parsed)
    if expected_row_count is not None and len(rows) != expected_row_count:
        raise RetailSourceError(
            f"retailer CSV must contain exactly {expected_row_count} source rows"
        )
    return ParsedRetailerArchive(
        rows=tuple(rows),
        archive_sha256=archive_sha256,
        csv_sha256=csv_sha256,
        header_sha256=header_sha256,
    )


def _required_evidence_string(item: Mapping[str, object], key: str, index: int) -> str:
    value = item.get(key)
    if not isinstance(value, str) or not value.strip():
        raise RetailSourceError(f"classification evidence {index} requires {key}")
    return value.strip()


def _optional_evidence_string(item: Mapping[str, object], key: str, index: int) -> str | None:
    value = item.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise RetailSourceError(f"classification evidence {index} has invalid {key}")
    stripped = value.strip()
    return stripped or None


def read_classification_evidence(content: bytes) -> tuple[ClassificationEvidence, ...]:
    """Parse the complete, dated evidence records allowed for Super Stores."""

    try:
        raw: object = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RetailSourceError("classification evidence is not valid JSON") from error
    if not isinstance(raw, list):
        raise RetailSourceError("classification evidence must be a JSON array")
    evidence: list[ClassificationEvidence] = []
    seen: set[str] = set()
    for index, value in enumerate(raw):
        if not isinstance(value, Mapping):
            raise RetailSourceError(f"classification evidence {index} must be an object")
        item = cast(Mapping[str, object], value)
        resource_id = _required_evidence_string(item, "resource_id", index)
        if resource_id in seen:
            raise RetailSourceError(f"duplicate classification evidence for {resource_id}")
        seen.add(resource_id)
        asserted = _required_evidence_string(item, "asserted_classification", index)
        if asserted not in {"full_service_grocery", "candidate_full_service"}:
            raise RetailSourceError(f"classification evidence {index} has invalid assertion")
        evidence_type = _required_evidence_string(item, "evidence_type", index)
        if evidence_type not in EVIDENCE_TYPES:
            raise RetailSourceError(f"classification evidence {index} has invalid evidence_type")
        evidence_url = _optional_evidence_string(item, "evidence_url", index)
        partner_reference = _optional_evidence_string(item, "partner_document_reference", index)
        if evidence_url is None and partner_reference is None:
            raise RetailSourceError(
                f"classification evidence {index} requires evidence_url or partner_document_reference"
            )
        verifier = _required_evidence_string(item, "verifier", index)
        verified_text = _required_evidence_string(item, "verified_at", index)
        try:
            verified_at = datetime.fromisoformat(verified_text.replace("Z", "+00:00"))
        except ValueError as error:
            raise RetailSourceError(
                f"classification evidence {index} has invalid verified_at"
            ) from error
        if verified_at.tzinfo is None or verified_at.utcoffset() is None:
            raise RetailSourceError(
                f"classification evidence {index} verified_at must include a timezone"
            )
        evidence.append(
            ClassificationEvidence(
                resource_id=resource_id,
                asserted_classification=asserted,
                evidence_type=evidence_type,
                evidence_url=evidence_url,
                partner_document_reference=partner_reference,
                verifier=verifier,
                verified_at=verified_at.astimezone(UTC),
                notes=_required_evidence_string(item, "notes", index),
            )
        )
    return tuple(sorted(evidence, key=lambda item: item.resource_id))


def classify_store_type(
    source_value: str | None,
    *,
    registry: MethodologyRegistry | None = None,
) -> ClassificationDecision:
    """Apply only exact declarative source-value rules; never inspect store names."""

    source_type = (source_value or "").strip()
    methodology = registry or load_registry()
    rule = next(
        (
            item
            for item in methodology.classifications
            if item.source == "snap_retailers" and item.source_value == source_type
        ),
        None,
    )
    if rule is None:
        return ClassificationDecision(
            category=ResourceCategory.UNVERIFIED,
            scoring_eligible=False,
            requires_override=False,
            reason="unrecognized_store_type",
        )
    return ClassificationDecision(
        category=rule.category,
        scoring_eligible=rule.scoring_eligible,
        requires_override=rule.requires_override,
        reason="approved_store_type_mapping",
    )


def _source_date(raw: str) -> date | None:
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%m/%d/%Y").date()
    except ValueError:
        return None


def _authorization_state(row: RawRetailerRow) -> tuple[date | None, date | None, str, str | None]:
    authorization = _source_date(row.authorization_date)
    end = _source_date(row.end_date)
    if not row.authorization_date:
        return None, end, "status_unknown", "missing_authorization_date"
    if authorization is None:
        return None, end, "status_unknown", "malformed_authorization_date"
    if row.end_date and end is None:
        return authorization, None, "status_unknown", "malformed_end_date"
    if end is not None and end < authorization:
        return authorization, end, "status_unknown", "end_before_authorization"
    if authorization > SNAPSHOT_DATE:
        return authorization, end, "inactive_at_snapshot", "authorization_after_snapshot"
    if end is not None and end <= SNAPSHOT_DATE:
        return authorization, end, "inactive_at_snapshot", "ended_on_or_before_snapshot"
    return authorization, end, "active_at_snapshot", None


def _coordinates(
    row: RawRetailerRow,
    review_buffer_contains: ReviewBufferContains,
) -> tuple[Decimal | None, Decimal | None, str, bool | None]:
    if not row.latitude or not row.longitude:
        return None, None, "missing", None
    try:
        latitude = Decimal(row.latitude)
        longitude = Decimal(row.longitude)
    except InvalidOperation:
        return None, None, "invalid", None
    if (
        not latitude.is_finite()
        or not longitude.is_finite()
        or latitude < -90
        or latitude > 90
        or longitude < -180
        or longitude > 180
        or (latitude == 0 and longitude == 0)
    ):
        return None, None, "invalid", None
    return (
        latitude,
        longitude,
        "source_coordinate",
        bool(review_buffer_contains(longitude, latitude)),
    )


def _optional(raw: str) -> str | None:
    stripped = raw.strip()
    return stripped or None


def _address(row: RawRetailerRow) -> str | None:
    parts = tuple(
        part
        for part in (
            _optional(row.street_number),
            _optional(row.street_name),
            _optional(row.additional_address),
        )
        if part is not None
    )
    return " ".join(parts) if parts else None


def _is_local_candidate(row: RawRetailerRow, in_review_buffer: bool | None) -> bool:
    labeled_milwaukee = row.state.casefold() == "wi" and row.county.casefold() == "milwaukee"
    return labeled_milwaukee or in_review_buffer is True


def normalize_retailers(
    archive: ParsedRetailerArchive,
    *,
    classification_evidence: Sequence[ClassificationEvidence],
    review_buffer_contains: ReviewBufferContains,
    registry: MethodologyRegistry | None = None,
) -> tuple[RetailerRecord, ...]:
    """Normalize local retailer versions and apply evidence-backed classification."""

    methodology = registry or load_registry()
    evidence_by_id: dict[str, ClassificationEvidence] = {}
    for evidence_item in classification_evidence:
        if evidence_item.resource_id in evidence_by_id:
            raise RetailSourceError(
                f"duplicate classification evidence for {evidence_item.resource_id}"
            )
        evidence_by_id[evidence_item.resource_id] = evidence_item

    seen_versions: set[tuple[str, str, str]] = set()
    source_ids: set[str] = set()
    records: list[RetailerRecord] = []
    for row in archive.rows:
        version_key = (row.source_record_id, row.authorization_date, row.end_date)
        if version_key in seen_versions:
            raise RetailSourceError(f"duplicate retailer version identity: {version_key!r}")
        seen_versions.add(version_key)
        source_ids.add(row.source_record_id)

        latitude, longitude, coordinate_status, in_review_buffer = _coordinates(
            row, review_buffer_contains
        )
        if not _is_local_candidate(row, in_review_buffer):
            continue
        authorization, end, status, status_reason = _authorization_state(row)
        is_active = status == "active_at_snapshot"
        snap_authorized = True if is_active else False if status == "inactive_at_snapshot" else None
        decision = classify_store_type(row.source_store_type, registry=methodology)
        current_evidence = evidence_by_id.get(row.source_record_id)
        category = decision.category
        full_service = category is ResourceCategory.FULL_SERVICE_GROCERY
        verification_status = (
            "unverified" if category is ResourceCategory.UNVERIFIED else "verified"
        )
        classification_reason = decision.reason
        if decision.requires_override:
            if current_evidence is None:
                full_service = False
                verification_status = "unverified"
                classification_reason = "override_required"
            elif current_evidence.asserted_classification == "full_service_grocery":
                category = ResourceCategory.FULL_SERVICE_GROCERY
                full_service = True
                verification_status = "override_verified"
                classification_reason = "positive_override_evidence"
            else:
                category = ResourceCategory.CANDIDATE_FULL_SERVICE
                full_service = False
                verification_status = "override_verified"
                classification_reason = "negative_override_evidence"
        elif current_evidence is not None:
            raise RetailSourceError(
                f"classification evidence for {row.source_record_id} does not target a Super Store"
            )

        operationally_eligible = (
            full_service
            and is_active
            and coordinate_status == "source_coordinate"
            and in_review_buffer is True
        )
        records.append(
            RetailerRecord(
                source_record_id=row.source_record_id,
                name=_optional(row.name),
                source_store_type=_optional(row.source_store_type),
                street_number=_optional(row.street_number),
                street_name=_optional(row.street_name),
                additional_address=_optional(row.additional_address),
                city=_optional(row.city),
                state=_optional(row.state),
                zip_code=_optional(row.zip_code),
                zip4=_optional(row.zip4),
                county=_optional(row.county),
                address=_address(row),
                latitude=latitude,
                longitude=longitude,
                coordinate_status=coordinate_status,
                in_review_buffer=in_review_buffer,
                authorization_date=authorization,
                end_date=end,
                status_as_of=SNAPSHOT_DATE,
                authorization_status=status,
                status_reason=status_reason,
                snap_authorized=snap_authorized,
                active=is_active,
                category=category,
                full_service_grocery=full_service,
                scoring_eligible=operationally_eligible,
                verification_status=verification_status,
                classification_reason=classification_reason,
                classification_evidence=current_evidence,
            )
        )

    orphan_evidence = sorted(set(evidence_by_id) - source_ids)
    if orphan_evidence:
        raise RetailSourceError(
            f"classification evidence references unknown retailer IDs: {orphan_evidence}"
        )
    return tuple(
        sorted(
            records,
            key=lambda item: (
                item.source_record_id,
                item.authorization_date or date.min,
                item.end_date or date.max,
            ),
        )
    )


def fetch_and_preserve_retailers(
    root: Path,
    *,
    clock: Callable[[], datetime],
    opener: Opener | None = None,
    sleeper: Sleeper | None = None,
    expected_archive_sha256: str = APPROVED_ARCHIVE_SHA256,
    expected_csv_sha256: str | None = None,
    expected_header_sha256: str = APPROVED_RETAILER_HEADER_SHA256,
    expected_row_count: int | None = None,
) -> FetchedRetailers:
    """Fetch the pinned archive once, validate it, and preserve exact bytes."""

    csv_sha256 = expected_csv_sha256
    row_count = expected_row_count
    if expected_archive_sha256 == APPROVED_ARCHIVE_SHA256:
        csv_sha256 = csv_sha256 or APPROVED_CSV_SHA256
        row_count = row_count if row_count is not None else APPROVED_SOURCE_ROW_COUNT
    parsed: ParsedRetailerArchive | None = None

    def validate(content: bytes) -> None:
        nonlocal parsed
        parsed = read_retailer_archive(
            content,
            expected_archive_sha256=expected_archive_sha256,
            expected_csv_sha256=csv_sha256,
            expected_header_sha256=expected_header_sha256,
            expected_row_count=row_count,
        )

    if opener is None and sleeper is None:
        content = fetch_bytes(RETAILER_SOURCE_URL, validator=validate)
    elif opener is None:
        content = fetch_bytes(
            RETAILER_SOURCE_URL, sleeper=cast(Sleeper, sleeper), validator=validate
        )
    elif sleeper is None:
        content = fetch_bytes(RETAILER_SOURCE_URL, opener=opener, validator=validate)
    else:
        content = fetch_bytes(
            RETAILER_SOURCE_URL,
            opener=opener,
            sleeper=sleeper,
            validator=validate,
        )
    if parsed is None:
        raise AssertionError("retailer fetch validator did not produce a parsed archive")

    registry = load_registry()
    source = next(item for item in registry.sources if item.key == "snap_retailers")
    snapshot = preserve_snapshot(
        root=root,
        pipeline_slug="food-equity",
        source_key="snap_retailers",
        source_url=RETAILER_SOURCE_URL,
        dataset_version=source.vintage,
        content=content,
        schema={
            "archive_member": RETAILER_ARCHIVE_MEMBER,
            "csv_sha256": parsed.csv_sha256,
            "header": list(RETAILER_HEADER),
            "header_sha256": parsed.header_sha256,
            "source_encoding": SOURCE_ENCODING,
        },
        row_or_feature_count=len(parsed.rows),
        license=source.license_notes,
        methodology_reference=registry.methodology_version,
        request_metadata={
            "archive_member": RETAILER_ARCHIVE_MEMBER,
            "snapshot_date": SNAPSHOT_DATE.isoformat(),
        },
        clock=clock,
    )
    return FetchedRetailers(content=content, archive=parsed, snapshot=snapshot)


__all__ = [
    "APPROVED_ARCHIVE_SHA256",
    "APPROVED_CSV_SHA256",
    "APPROVED_RETAILER_HEADER_SHA256",
    "APPROVED_SOURCE_ROW_COUNT",
    "ClassificationDecision",
    "ClassificationEvidence",
    "FetchedRetailers",
    "ParsedRetailerArchive",
    "RETAILER_ARCHIVE_MEMBER",
    "RETAILER_ARCHIVE_MEMBERS",
    "RETAILER_HEADER",
    "RETAILER_SOURCE_URL",
    "RetailSourceError",
    "RetailerRecord",
    "SNAPSHOT_DATE",
    "SOURCE_ENCODING",
    "classify_store_type",
    "fetch_and_preserve_retailers",
    "normalize_retailers",
    "read_classification_evidence",
    "read_retailer_archive",
]
