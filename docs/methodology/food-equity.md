# Food Equity Methodology

## Purpose and status

Food Equity Priority identifies where high underlying equity vulnerability and food-access need
overlap. Food Access Need remains analytically separate from the Equity Baseline and does not use
an LLM.

This is the approved v1 calculation for MOO-753. The complete source, classification, routing,
quality, and implementation contract is in
[`2026-08-29-moo-753-food-equity-design.md`](../superpowers/specs/2026-08-29-moo-753-food-equity-design.md).
Tarik approved the contract on 2026-08-29; implementation must not silently deviate from it.

## Food Access Need v1

Food Access Need uses two equally weighted domains and four equally weighted indicators.

### Retail Access

1. USDA 2025 SRAM share of the tract population more than one driving-network mile from any
   fixed-location SNAP-authorized retailer (`DD_SRAM_lapop1share`).
2. Walking-network access from the 2020 Census tract center of population to the nearest active,
   explicitly classified full-service grocery.

SNAP authorization is not full-service grocery evidence. FNS `Supermarket` and `Large Grocery
Store` qualify. `Super Store` requires dated evidence that access is neither
membership-based nor restricted. Other types remain contextual. Store-name inference is
prohibited.

The pinned FNS input is the sole CSV member `Historical SNAP Retailer Locator Data 2005-2025.csv`
from `snap-retailer-locator-data2005-2025.zip`, current as of 2025-12-31. Validation requires the
approved archive and member SHA-256 values, exact 15-column header/order, UTF-8 BOM, and 703,441
data rows. `Record ID` is stable retailer identity, while (`Record ID`, `Authorization Date`,
`End Date`) identifies a historical version; duplicate version keys fail validation.

The exact observed specialty values are `Bakery Specialty`, `Fruits/Veg Specialty`,
`Meat/Poultry Specialty`, and `Seafood Specialty`; `Farmers' Market` uses the ASCII apostrophe.
`Food Buying Co-op`, `Wholesaler`, and `Unknown` remain explicitly unverified, contextual, and
non-scoring. No unobserved source-label alias is silently accepted.

The walking calculation uses the immutable Geofabrik Wisconsin 2026-08-27 OSM PBF, a documented
pedestrian filter, a 200-meter snap tolerance, weighted network distance, and a fixed three-mile-
per-hour display conversion. Ten-, fifteen-, and twenty-minute thresholds are inclusive. There
is no straight-line fallback. A validly snapped origin in a component without a grocery is
`unreachable` and ranks above all finite distances without inventing a numeric distance.

Only pedestrian-specific direction tags affect walking direction in v1: `oneway:foot` and the
directional `foot:forward` / `foot:backward` restrictions. Generic vehicle `oneway` tags do not.
The PostGIS county-plus-two-mile boundary predicate is inclusive; a source segment is retained
only when both original OSM endpoints pass it, and no synthetic boundary nodes are created. The
approved file is 292,160,666 bytes, MD5 `87c18ce0608499afd91ed0f2a5ee8eef`, SHA-256
`3e4a59bae5e7eb0f6f175a8645b3b2be16c276a5082f3732566d4e3aeaee6842`.
All route arithmetic uses a fixed 50-digit decimal context. Scoring calculations accept only the
approved normalized graph topology and an explicit validated resource-snapshot identity, even
when that resource inventory contains zero qualifying stores. Inactive or upstream-ineligible
stores are excluded with evidence rather than routed as scoring destinations.

### Transportation Constraint

1. 2024 ACS 5-Year share of households with no vehicle available:
   `100 × B08201_002E / B08201_001E`, retaining the approved Census proportion MOE.
2. Reverse-ranked scheduled MCTS service intensity reachable within a ten-minute network walk.

Transit service intensity is the lower of Tuesday and Saturday unique scheduled departures per
hour from 10 a.m. inclusive to 2 p.m. exclusive. Trips reachable at multiple stops are counted
once by `trip_id`. Analysis dates belong to the first complete service week on or after feed
retrieval and are included in provenance. Static GTFS measures scheduled availability, not
reliability, travel time to groceries, or real-time service.

All validated GTFS stops are projected internally to `EPSG:3071`; a caller cannot substitute a
partial or repositioned stop list. The projected-stop fingerprint and projection version are
retained alongside the GTFS archive fingerprint.

Transit frequency is an explicitly approved transportation access-gap input. It is not an
investment or performance score.

### Economic Constraint

There is no separate Economic Constraint domain in v1. Poverty, unemployment, educational
attainment, and housing cost burden are already part of the Equity Baseline. Reusing them in Food
Access Need would double-weight economic vulnerability in Food Equity Priority.

### Emergency food and other resources

Food banks, pantries, pantry/recovery programs, meal programs, farmers markets, small and
specialty groceries, convenience stores, and operating availability are contextual. Their
presence does not reduce Food Access Need. Context-snapshot quality is retained independently of
resource rows, so an empty stale or unverified inventory cannot become a verified zero.

Contextual walking counts are stored as separate scalar observations for each inclusive threshold:
`full_service_grocery_count_10_min_context`, `_15_min_context`, and `_20_min_context`, plus the
equivalent `emergency_food_count_*_context` observations. They remain outside score components and
the score-input fingerprint. A count is observed only when the contributing inventory has an
explicit source-backed active state. Unknown activity produces a missing or conflicting context
state, never an observed zero.

The Milwaukee Food Council/Data You Can Use ArcGIS emergency-food layer is structured but stale
and has no published reuse terms. It may be evaluated as `stale_unverified_context` in
development; public redistribution is blocked pending partner confirmation and a current
verification date. Missing hours remain missing and narrative notes are not parsed into hours.
Missing resource names and active states remain null in persistence. Source-derived FNS
classifications use their source snapshot and classification evidence for verification; only
manual/partner overrides and context verification events require a separate `verified_at`
timestamp. Historical retailer identity is (`Record ID`, source snapshot, `Authorization Date`,
`End Date`), including explicit null endpoints, so multiple source-backed intervals are retained.

## Calculation

The eligible comparison set is the approved 2020 Milwaukee County Equity Baseline tract universe
with positive population, a complete pinned baseline result, and all four valid Food Access Need
indicators. Any missing indicator is `insufficient_data`; weights are never redistributed.

Direction is normalized so a higher percentile always means greater need. For `N > 1`:

`percentile = 100 × (average_rank - 1) / (N - 1)`

For `N = 1`, percentile is 50. Average ranks preserve ties.

- Retail Access = equal average of SRAM and grocery-walk indicator percentiles.
- Transportation Constraint = equal average of no-vehicle and reverse transit-intensity
  percentiles.
- Raw Food Access Need = equal average of the two domains.
- Food Access Need county percentile = average-rank percentile of the raw composite.

Each indicator has a 25 percent effective composite weight. Bands are Very Low (`0–<20`), Low
(`20–<40`), Moderate (`40–<60`), High (`60–<80`), and Very High (`80–100`). Ties may produce
unequal band populations.

Every result exposes raw values, county percentiles, definitions, sources, vintages, quality
states, domain values, methodology version, and score-run identity.
Excluded tracts also retain their deterministic exclusion reasons in the scored artifact and
database row; an absent indicator is never reduced to a generic null without its reason.

## Food Equity Priority

Priority is a direct lookup from the approved Equity Baseline band and Food Access Need band.
Priority 1 is the highest overlap; Priority 5 is the lowest.

| Equity Baseline \\ Food Access Need | Very Low | Low | Moderate | High | Very High |
|---|---:|---:|---:|---:|---:|
| **Very Low** | 5 | 4 | 4 | 3 | 3 |
| **Low** | 4 | 4 | 3 | 3 | 2 |
| **Moderate** | 4 | 3 | 3 | 2 | 2 |
| **High** | 3 | 3 | 2 | 2 | 1 |
| **Very High** | 3 | 2 | 2 | 1 | 1 |

Missing either band produces `priority_insufficient_data`; a Priority is never inferred.

## Need and service response

Need determines priority. Investment and services show response.

Emergency-food resources and public investment are absent from score components and the
score-input fingerprint. Their changes cannot alter Food Access Need, its band, or Priority.

The Atlas may separately display the approved `Pantries 2026` Data You Can Use/Milwaukee Food
Council snapshot as source-listed community context. That release-pinned point layer is not an
input, component, proxy, or validation condition for this methodology. It carries the visible
status **Check before visiting** because hours and current service availability were not
independently verified. Turning the layer on or selecting a place changes only the map display and
share URL; it cannot recalculate or change any score.

## Missing data and uncertainty

Never substitute missing with zero. Zero is valid only when the source explicitly observes zero,
such as no scheduled trips reachable from an otherwise valid tract origin and feed.

ACS margins of error and reliability states remain attached. Network, coordinate, source-age,
classification, and transit-calendar quality states are explicit. A validated run requires no
unattributed insufficient result among baseline-eligible tracts. The approved 2026-08-30 live
reconciliation contains exactly one: tract `55079187200` is `insufficient_data` because its 2020
Census center of population is 251.60 meters from the nearest approved pedestrian-network node,
beyond the fixed 200-meter snap tolerance. Its grocery-walk and scheduled-transit indicators stay
missing, its component and Priority values stay absent, and weights are not redistributed. The
validated output contract is therefore 302 scores: 299 complete, one insufficient, and two
zero-population, with 1,196 components. This amendment changes no source, formula, threshold,
weight, band, matrix cell, or missing-data rule.

## Development baseline pin and publication

Development pins validated, verified, unpublished Equity Baseline run
`502e2a04-b013-53cd-8b09-c9144862701a`, including its stored output hash and methodology/source
lineage. A Food run based on that baseline may be validated for development. Validation alone
never makes it public; publication requires the separate approved manifest, licensing policy,
dry run, expected-current comparison, and controlled transaction.

A web deployment does not publish a score. The public application reads only `published` runs.
Publication is a separate governed action.

## Versioning and AI restriction

Every result belongs to an immutable methodology version, score-run ID, source fingerprint, and
explicit source vintages. A source, formula, weight, threshold, classification, band, matrix,
completeness or eligibility rule, or routing change creates a new methodology/source version and
never redefines an old run. Recording the observed count of results produced by an unchanged
completeness rule does not redefine that rule.

No LLM may acquire, classify, calculate, infer, modify, or override an official value, score,
band, or Priority. AI may later explain verified results; deterministic evidence remains the
authority.
