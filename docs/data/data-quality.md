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

For ACS observations, the profile exposes the persisted coefficient-of-variation state from the
approved Equity Baseline or Food pipeline. It does not recalculate or relabel reliability in the
browser. The four states remain `reliable` (CV at or below 15%), `use_with_caution` (above 15% and
at or below 30%), `high_uncertainty` (above 30%), and `cv_not_computable` for a zero estimate.
“Verified” and “reliable” answer different questions: verification means lineage and quality
checks passed, while reliability describes sampling precision.

For reader-facing percent measures with an ACS 90% margin of error, the server presentation layer
provides a bounded range of `estimate - margin` through `estimate + margin`, clamped to 0–100%.
This range is explanatory only. It does not change the stored estimate, percentile, score,
eligibility, or methodology. Percentile copy carries the same caution because the percentile was
calculated from that estimate.

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

## Neighborhood-reference quality boundary

Neighborhood context comes only from a manifested snapshot of the approved City of Milwaukee DCD
reference. It is not an official City or neighborhood-association boundary, is not maintained on
an ongoing basis, and does not cover all Milwaukee County municipalities. The UI must carry those
limitations anywhere the names or boundaries could be interpreted as authoritative jurisdiction.

PostGIS retains exact positive-area overlaps and City-reference coverage. Percentages describe
polygon area within the portion covered by the City reference, not population, identity,
membership, or service jurisdiction. Sub-1% boundary slivers may be grouped for display but remain
auditable. Missing coverage is never converted into a nearest, centroid-selected, or ZIP-inferred
neighborhood.

## Analyze exact-run quality boundary

Compare and Opportunity use the Atlas exact-run selector. Before a response is available, the
server must bind canonical geography, the selected Food Equity run, its pinned Equity Baseline
run, methodology labels, scores, required components and observations, and their quality/lineage
checks. Compare additionally returns detailed uncertainty and source evidence. Unknown tracts,
duplicate evidence, a mismatched baseline, wrong-run rows, or incomplete required joins make the
complete response unavailable. Compare never returns a partly valid tract set.

Public mode reads only the zero-or-one current governed published bundle. When none exists, both
Analyze routes return `no_published_run` and show no validated data. A guarded local validated preview
must name one exact run in server-only development configuration and display that it is not
published. A deployment or verification run does not publish, supersede, or mutate data.

## Opportunity missing-data and population rules

Applied filters use three-valued evaluation: match, non-match, or missing. A tract is counted as
excluded for missing filter data only when at least one active condition is unevaluable and every
other evaluable condition matches. If any evaluable condition fails, the tract is an ordinary
non-match. Missing never becomes zero, the lowest band, or unreachable.

The population summary is the sum of known population values for matching canonical tracts. A
matching tract with unavailable population remains in the matching count, is excluded from the
known sum, and increments a separate missing-population count. An observed zero-population tract
contributes zero and remains distinguishable from unavailable population. The UI says
**population living in matching tracts**, never affected, served, or recommended population.

Opportunity returns matching tract summaries without polygon geometry. The bounded Atlas
collection supplies map shapes, and MapLibre highlights the server result without deciding which
tracts match. Contextual food sites, public land, and public investment have no approved run-tied
filter contract and cannot affect results.

## Compare uncertainty and Differences

Compare preserves the same observed/missing/suppressed/conflicting/unreachable states,
reliability labels, margins of error, definitions, limitations, vintages, and sources as the Atlas
profile. The deterministic Differences helper may include a numeric measure only when at least two
valid county percentiles differ by 20 points or more. Missing values never create a gap. A stored
ACS caution, high-uncertainty, or unclear-reliability state follows the statement and points to the
estimate range; it does not alter the estimate, percentile, band, score, or eligibility.

Neither workflow ranks tracts, infers a cause, recommends an intervention, or uses AI. Food sites,
public land, and public investment remain contextual and cannot change an analytical result.
