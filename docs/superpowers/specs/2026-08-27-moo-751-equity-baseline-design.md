# MOO-751 Equity Baseline Design

**Status:** Approved

**Issue:** MOO-751 — Plan 2: Data Pipeline + Equity Baseline

**Approved:** 2026-08-27

## Outcome

Plan 2 creates a deterministic, provenance-preserving pipeline that acquires canonical
Milwaukee County tract geography, demographic/economic indicators, and health indicators;
validates and normalizes them; loads them into Neon/PostGIS; and produces one development
score run with status `validated`.

The plan does not publish a score run. The application continues to read only a future
explicitly `published` run, and publication remains gated by MOO-752.

## Non-goals

- food resources, food access, or Food Equity Priority
- browser-side analytical or spatial calculations
- production data mutation
- a public score-run switch
- authentication, AI chat, recommendations, or predictive modeling
- imputation or silent replacement of missing values
- life expectancy in the v1 baseline

No LLM participates in ingestion, validation, normalization, scoring, classification, or
policy recommendations.

## Approved sources and vintages

| Input | Approved source and vintage | Use |
|---|---|---|
| Geography | 2020 Census TIGER/Line tracts | Canonical tract identity and geometry |
| Demographic/economic | 2024 ACS 5-Year Detailed Tables | Seven baseline indicators and tract population |
| Health | CDC PLACES December 2025 release | Six 2023 BRFSS-based crude-prevalence indicators |

Each indicator retains its own data vintage. A release label never replaces the underlying
measure year in provenance.

## Canonical geography and eligibility

The canonical universe contains every 2020 Census tract with state FIPS `55` and county FIPS
`079`. All canonical tracts remain stored.

- `B01003_001E > 0`: proceed to completeness evaluation.
- `B01003_001E = 0`: retain the tract as `ineligible_zero_population` and do not score it.
- positive population plus all 13 valid indicators: include the tract in the county scoring set.
- positive population plus any missing or unusable indicator: retain the tract as
  `insufficient_data` and do not score it.

The run quality report records the full universe, eligible count, excluded count, and every
tract-level exclusion reason.

## Approved v1 indicator registry

### Demographic / structural

| Indicator | 2024 ACS formula |
|---|---|
| People of color | `(B03002_001E - B03002_003E) / B03002_001E * 100` |
| Speaks English less than “very well,” age 5+ (registry slug: `limited_english_proficiency`) | `sum(C16001_005E, 008E, 011E, 014E, 017E, 020E, 023E, 026E, 029E, 032E, 035E, 038E) / C16001_001E * 100` |
| Foreign-born | `B05002_013E / B05002_001E * 100` |

“People of color” is operationalized as the total population minus the non-Hispanic
White-alone population. The registry's `limited_english_proficiency` indicator covers the
population age five and older that speaks English less than “very well” across all table
language categories. It is a language-proficiency estimate, not a literacy measure.

### Socioeconomic

| Indicator | 2024 ACS formula |
|---|---|
| Below 200% of the federal poverty level | `sum(C17002_002E..C17002_007E) / C17002_001E * 100` |
| Unemployment | `B23025_005E / B23025_003E * 100` |
| Less than a high-school diploma, age 25+ | `sum(B15003_002E..B15003_016E) / B15003_001E * 100` |
| Housing cost burden, 30% or more | `sum(B25106_006E, 010E, 014E, 018E, 022E, 028E, 032E, 036E, 040E, 044E) / (B25106_001E - B25106_023E - B25106_045E) * 100` |

The unemployment denominator is the civilian labor force. The housing denominator excludes
owner- and renter-occupied households with zero or negative income because Census does not
calculate their housing-cost ratio.

### Health

Use CDC PLACES rows with `datavaluetypeid = "CrdPrv"` and
`data_value_type = "Crude prevalence"`.

| Indicator | PLACES `measureid` |
|---|---|
| Diagnosed diabetes among adults | `DIABETES` |
| Obesity among adults | `OBESITY` |
| Current asthma among adults | `CASTHMA` |
| Any disability among adults | `DISABILITY` |
| Frequent mental distress among adults | `MHLTH` |
| No leisure-time physical activity among adults | `LPA` |

Join `locationid` to the canonical 11-digit tract GEOID. Require exactly one row per tract,
measure, and value type. Retain confidence limits, population fields, footnotes, source year,
and release metadata. Age-adjusted rows are not used.

## Quality and uncertainty rules

All derived values must be numeric percentages in the closed interval 0–100. A nonpositive
denominator, missing component, source annotation indicating unavailable data, unusable
footnote, duplicate PLACES row, or out-of-range result makes the indicator unusable. Missing
values are never replaced with zero, and weights are never redistributed.

Retain every ACS estimate annotation and 90% margin of error. Approximate derived margins of
error using Census guidance for sums, differences, and proportions. For a nonzero derived
estimate, calculate:

`CV = (MOE / 1.645) / abs(estimate) * 100`

| State | Rule |
|---|---|
| `reliable` | `CV <= 15%` |
| `use_with_caution` | `15% < CV <= 30%` |
| `high_uncertainty` | `CV > 30%` |
| `cv_not_computable` | estimate equals zero; retain its MOE |

High uncertainty alone does not alter a value, weight, rank, or eligibility. It remains visible
quality metadata. PLACES low and high confidence limits are retained without inventing a new
CDC reliability threshold.

## Deterministic scoring

Higher values represent greater measured equity burden for all 13 approved indicators.

For `N > 1`, percentile-rank an eligible value with:

`percentile = 100 * (average_rank - 1) / (N - 1)`

Equal values receive their average rank. If `N = 1`, assign percentile 50. Null and ineligible
values do not participate. Input order and GEOID never break ties.

For each complete tract:

1. Percentile-rank each of the 13 indicator values across the eligible Milwaukee County set.
2. Calculate the demographic/structural subindex as the arithmetic mean of its three indicator
   percentiles.
3. Calculate the socioeconomic subindex as the arithmetic mean of its four indicator
   percentiles.
4. Calculate the health subindex as the arithmetic mean of its six indicator percentiles.
5. Calculate the composite score as the arithmetic mean of the three subindices.
6. Percentile-rank composite scores with the same average-rank rule.
7. Classify the final composite percentile:
   - `0 <= p < 20`: Very Low
   - `20 <= p < 40`: Low
   - `40 <= p < 60`: Moderate
   - `60 <= p < 80`: High
   - `80 <= p <= 100`: Very High

Ties remain together, so band populations may be unequal. The pipeline never splits ties to
force equal counts.

The three subindices each contribute exactly one-third of the composite. Effective indicator
weights are therefore 1/9 for each demographic/structural indicator, 1/12 for each
socioeconomic indicator, and 1/18 for each health indicator.

## Versioned methodology registry

The approved definitions live in a committed TOML registry. It contains source versions,
indicator membership, typed formula operands, directionality, weights, completeness rules,
tie method, and band thresholds.

The loader validates the registry into typed Python structures. Formula types are implemented
explicitly; registry content is never evaluated as code. A canonical registry serialization is
hashed and stored with every score run.

## Pipeline architecture

`fetch -> snapshot -> validate -> normalize -> load -> score -> validate-run`

- **fetch/snapshot:** acquire bounded official inputs and create immutable raw snapshots.
- **validate:** enforce source schema, uniqueness, ranges, provenance, and coverage.
- **normalize:** produce deterministic tract-indicator records and quality metadata.
- **load:** transactionally persist canonical geography, snapshots, definitions, and values.
- **score:** create a `draft` run and calculate from pinned inputs and registry content.
- **validate-run:** reconcile counts, fixtures, hashes, and invariants before changing the run to
  `validated`.

MOO-751 includes no publish stage.

## Extraction and artifacts

Use bounded structured inputs:

- official 2020 Wisconsin TIGER/Line tract shapefile, subset after validation;
- approved ACS fields for all Milwaukee County tracts;
- Milwaukee County PLACES rows for the six approved measures and crude prevalence.

Preserve raw responses unchanged under ignored `data/raw/`. Commit compact manifests under
`data/manifests/` with the sanitized request, retrieval time, source version, SHA-256, byte
size, row or feature count, schema fingerprint, and local storage URI. Census API keys and
database credentials never enter logs or manifests.

CI uses committed minimal fixtures and never requires live federal APIs. Fetching is
idempotent by checksum. A changed response for the same declared version becomes a distinct
snapshot and must pass validation; it is never overwritten silently.

## Database model

Plan 2 adds normalized, provenance-first tables:

- `geographies`
- `data_sources`
- `source_snapshots`
- `indicator_definitions`
- `indicator_values`
- `score_runs`
- `score_components`
- `scores`

Raw normalized indicator values remain separate from run-dependent percentiles. Each run pins
exact snapshots, registry hash, scoring implementation version, and Git commit. Database
constraints enforce referential integrity, GEOID shape, unique keys, allowed numeric ranges,
and run lifecycle rules.

PostGIS owns geometry validity and storage. TypeScript/Drizzle owns schema migrations. Python
owns transactional ingestion, validation, normalization, and scoring.

MOO-751 permits `draft -> validated` and `draft -> failed`. It cannot create or transition a
run to `published`.

## Command and failure contract

The command boundary is:

`python -m pipelines.equity_baseline <stage>`

Stages are `fetch`, `validate`, `normalize`, `load`, `score`, `validate-run`, and
`run --through validated`. Only `load`, `score`, and `validate-run` may write to the database.

Snapshots are content-addressed. Normalized artifacts are keyed by snapshot checksums and the
registry hash. A run fingerprint includes sorted input checksums, registry hash, scoring
implementation version, and Git commit. Repeating an identical fingerprint returns the
existing run rather than duplicating rows.

Downloads use bounded retries, temporary files, checksum verification, and atomic rename.
Schema or provenance mismatches stop without substituting another source. Load and score
writes are transactional. A scoring or validation failure rolls back analytical outputs and
marks the run `failed` with a structured report. Only successful validation can produce
`validated`.

Machine-readable reports remain under ignored `data/reports/`. Concise, secret-free completion
evidence belongs under `docs/verification/`.

## Verification design

Analytical and spatial behavior is implemented test-first.

- Unit tests cover registry validation, ACS formulas, MOE/CV states, PLACES mappings,
  completeness, average-rank ties, weights, subindices, final ranking, bands, and lifecycle.
- Contract fixtures cover valid, malformed, duplicate, suppressed, missing, zero-denominator,
  and out-of-range inputs.
- A golden end-to-end fixture covers complete tracts, ties, zero population, missing
  indicators, and high uncertainty with exact expected output.
- Repeatability requires canonical outputs to match exactly for identical inputs and config
  after excluding generated IDs and timestamps.
- Migration/integration tests cover tables, constraints, PostGIS validity, transactions, and
  rollback.
- CI uses fixtures only, without network or a live database.

Final verification uses a new development-only Neon branch named
`moo-751-equity-baseline` with a seven-day TTL. It applies migrations and performs one full
Milwaukee run ending at `validated`, never `published`. Evidence records counts, exclusions,
quality states, checksums, registry hash, Git commit, and repeatability without recording
database URLs.
