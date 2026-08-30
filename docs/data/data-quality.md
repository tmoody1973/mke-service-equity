# Data Quality

## Allowed statuses

- verified
- provisional
- stale
- missing
- suppressed
- conflicting

## Principles

- Missing is never zero.
- Unknown values remain unknown.
- Source disagreements are surfaced.
- Stale service information must not be presented as current without a warning.
- Operating hours are never invented.

## Conflict rules

- Government geography: official Census/City/County source wins.
- PLACES-defined health measures: CDC PLACES wins.
- Store status: newest authoritative federal/local verification wins.
- Pantry hours: operator/partner verification wins.
- Unresolved disagreement: mark conflicting.

## User-facing behavior

Examples:

**Insufficient data**

or:

**Pantry hours: Provisional — last verified 94 days ago**

Quality states are part of the product UI.

## Atlas profile quality boundary

The selected-tract profile is available only when the server proves that the tract and both score
systems belong to the same selected run lineage. A complete tract must have exactly 13 Equity
Baseline inputs and 4 Food Access Need inputs with their exact metric, snapshot, and source links.
Duplicate, missing, or mismatched lineage makes the detailed profile unavailable; the browser does
not fill the gap.

Each measure carries its own state, quality label, uncertainty, definition, limitation, and source.
An unavailable Community context section means its snapshot is not tied to the run. It does not
mean the tract has no resources.

## Food Equity quality contract

Food scoring requires one observation for each of the four approved scoring slugs and each
baseline-eligible tract. `unreachable` is a valid network state for a snapped origin with no
reachable grocery; it is not missing and has no invented distance. An observed zero is valid for
scheduled service or a contextual count only when every upstream fact needed to observe zero is
known.

Unknown emergency-resource activity makes all three emergency count observations `missing` with
`resource_activity_unknown`; it never excludes the resource as inactive and never produces zero.
Missing or invalid coordinates remain explicit and cannot trigger a straight-line fallback.
Source-blank names, hours, and activity remain null. Stale emergency context stays stale even
when the source has no records.

Every persisted metric carries its calculation version, value state, quality status and
metadata, primary snapshot, and exact set of contributing source snapshots. Before a run can
validate, database reconciliation proves that persisted fingerprints, lineage pairs, components,
and scores equal the reviewed in-memory write plan. Context metrics may later be displayed with
their warnings, but are prohibited from the scoring adapter and score-input fingerprint.
