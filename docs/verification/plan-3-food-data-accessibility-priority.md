# Plan 3 Food Data, Accessibility, and Priority verification

## Status

- Linear issue: `MOO-753`
- Branch: `codex/moo-753-food-data-access-priority`
- Task 11 implementation commit: `df859e6`
- Verification dates: offline gate 2026-08-29; authoritative live run 2026-08-30
- Current result: all eight stages passed separately; one development run is validated; the
  full same-run `--verify-existing` replay reused and independently verified it
- Publication state: unavailable by design; no Plan 3 publish command or published status exists

This record separates reproducible offline evidence from later authoritative-source and disposable
Neon evidence. A passing fixture suite is not proof that current upstream sources, the local PBF,
the validator JAR, or the development database are available or unchanged.

## Approved analytical contract

The authoritative calculation, classification, routing, uncertainty, and Priority rules are in
[`docs/methodology/food-equity.md`](../methodology/food-equity.md). The executable registry is
`pipelines/food_equity/registry.toml`. This verification record does not duplicate formulas.

Guardrails verified offline:

- deterministic Python calculations only; no LLM input to acquisition, classification, routing,
  scores, bands, or Priority;
- exact pinned Equity Baseline run and output hash;
- no missing-to-zero conversion and no straight-line routing fallback;
- name text and SNAP authorization never imply full-service classification;
- contextual emergency-food counts are persisted but excluded from score components and the
  score-input fingerprint;
- unknown emergency-resource activity remains null and produces missing context, not zero;
- all source, version, metric, lineage, component, score, lifecycle, and output-hash writes use
  parameter binding and deterministic natural identities;
- the CLI exposes no publication or arbitrary status transition.

## Offline gate

The complete Task 12 offline gate passed on 2026-08-29:

| Check | Result |
|---|---|
| `uv sync --locked` | 37 packages resolved; 34 checked |
| Ruff check | passed |
| Ruff format check | 78 files already formatted |
| mypy | 45 source files; no issues |
| Python data tests | 564 passed; 12 integration tests deselected |
| ESLint | passed |
| TypeScript typecheck | all workspaces passed |
| JavaScript tests | web 6, contracts 3, database 29, design system 1 passed |
| Next.js production build | passed; `/`, `/_not-found`, and database health route built |
| `git diff --check` | passed |

Food-specific Task 11 proof also passed: 380 tests with 10 opt-in database checks deselected.
Those skips were expected at the offline checkpoint; the same checks later passed against the
confirmed disposable branch with `DATABASE_URL_UNPOOLED` and `MKE_PIPELINE_ENV=development`.

## Runtime inputs

The authoritative run must resolve these names without printing values:

```text
CENSUS_API_KEY
MKE_FOOD_WALKING_NETWORK_PATH
MKE_FOOD_CLASSIFICATION_EVIDENCE_PATH
MKE_FOOD_CLASSIFICATION_EVIDENCE_SHA256
MKE_GTFS_VALIDATOR_JAR
MKE_PIPELINE_ENV=development
DATABASE_URL_UNPOOLED
```

The walking PBF and classification evidence must be workspace-bounded regular files. The
validator may live under ignored `.tools/`. Plan 2's exact TIGER fetch state and pinned validated
baseline must be present. Reports, raw data, normalized data, restricted partner data, validator
output, absolute local paths, and secrets remain uncommitted.

## Authoritative verification

Do not mark MOO-753 complete until every item below has attributable evidence.

### Neon identity and migration

- [x] Personal project ID recorded without a connection string.
- [x] Branch `moo-753-food-equity` is non-default, development-only, and has a seven-day TTL.
- [x] Parent is the approved Plan 2 branch containing baseline run
  `502e2a04-b013-53cd-8b09-c9144862701a`.
- [x] Branch ID, parent ID, expiry, database, and role are recorded.
- [x] Migrations `0000` through `0003`, PostGIS, Plan 2/3 tables, constraints, and lifecycle
  triggers are independently verified.
- [x] The Python and TypeScript database integration suites pass.
- [x] No Plan 3 row is published and no Food foreign-key orphan exists.

### Official sources and stage execution

- [x] `fetch`, `validate`, `normalize`, `classify`, `accessibility`, `load`, `score`, and
  `validate-run` each succeed separately.
- [x] Seven source manifests plus the separate classification-evidence manifest are sanitized and
  attributable.
- [x] The Plan 2 TIGER checksum matches the Food bundle pointer.
- [x] SRAM, FNS, ACS, origin, GTFS, PBF, and emergency-context hashes and row/feature counts are
  recorded.
- [x] The pinned MobilityData validator version/hash and GTFS Last-Modified, feed validity, and
  analysis dates are recorded.
- [x] Walking graph node/edge/hash counts, resource snap exclusions, disconnected origins, and
  unreachable states reconcile.
- [x] Retail type, active interval, full-service, override, ambiguous, and unverified counts
  reconcile without name inference.
- [x] Emergency type/freshness/activity/hours states reconcile and remain non-scoring.

### Run, repeatability, and trace review

- [x] Exactly 302 scores reconcile to 299 complete, 1 attributable insufficient, and 2
  zero-population rows, with 1,196 score components and the exact 302-by-10 persisted metric grid.
- [x] Registry, manifest, scoring-input, run, and canonical-output hashes are recorded.
- [x] `run --through validated --verify-existing` returns the same run ID and output hash without
  duplicate source, resource, metric, component, or score rows.
- [x] High-, middle-, low-, and insufficient/zero-population tract traces are followed from raw
  source through classification, access metrics, Food Access Need, baseline matrix cell, and
  Priority.
- [x] Trace language reports uncertainty and context without implying causation, literacy,
  individual behavior, service effectiveness, or a funding recommendation.

## Known limitations to carry into review

- FNS SNAP retailers are not a complete food-retail inventory.
- Static GTFS measures scheduled service, not reliability, travel time to groceries, or real-time
  conditions.
- The pinned OSM graph represents encoded pedestrian access at one source date and has a fixed
  snap tolerance; it does not prove sidewalk quality or accessibility.
- The emergency-food layer is stale, has unknown activity and hours, and lacks approved public
  redistribution terms. It is development context only.
- Census and survey measures describe tract-level conditions, not individual people. Limited
  English proficiency is not literacy.
- Priority is a deterministic overlap category, not a causal finding or automated policy
  recommendation.

## Completion evidence

### Disposable Neon branch

- Project: `wispy-glitter-41930798`.
- Branch: `moo-753-food-equity` (`br-floral-morning-a51g4fpt`), non-default and non-protected;
  parent `moo-751-equity-baseline` (`br-damp-math-a5e3wtpa`); expiry
  `2026-09-06T04:54:50Z`; database `neondb`; role `neondb_owner`.
- PostGIS `3.6.0`; four migrations through `0003`; eight Plan 2 and seven Plan 3 tables; 120 Plan
  3 constraints; one Food lifecycle trigger.
- The pinned parent baseline is validated with output hash
  `19069c257e8f51fb4370b1ec8d04c6f823bd85e133846cf504866404c2c4e946`.
- TypeScript integrations: 2 passed. Python integrations: 10 passed after the live amendment.
  Foreign-key, lifecycle, geometry, quality, duplicate-identity, baseline-link, count, exact
  insufficient-cause, and unpublished-state assertions passed.
- The parent expiry was temporarily cleared because Neon does not permit an expiring parent with
  a live child. Restore or retire that parent after the child expires; this does not affect score
  data or publication state.

### Source and calculation evidence

| Input | SHA-256 | Size / rows or features |
|---|---|---:|
| SRAM 2025 | `8e8ccda55aa478dd5907050249c28157d445568d242db8b5f85231b82c8afdbf` | 18,935,773 bytes / 84,119 national rows; 302 Milwaukee observations |
| FNS SNAP retailers through 2025 | `872a6f814a63514a1f1b0c4517a90309a9fbb01d97d6e4dbb1e8b20421c08cce` | 24,036,753 bytes / 703,441 rows; 2,817 Milwaukee versions |
| ACS 2024 five-year vehicle access | `51011a64ac65414499dda1cceb1556666fc4f3a13eca571c46acacd7887c3733` | 214,589 bytes / 302 tracts |
| 2020 tract population centers | `59d8e6e0d6c84267cd845da984e3623e68eae61f3418cc94488865c5f37d3e2c` | 64,767 bytes / 1,542 Wisconsin rows; 302 Milwaukee origins |
| MCTS static GTFS | `1f3fd55c1bcfc1d1e2c7d7ec13932e5b67b7074aeb13d7f1dbc0060bd8b23b26` | 9,257,880 bytes / 1,000,610 stop-time rows; 3,696 stops |
| Geofabrik Wisconsin PBF | `3e4a59bae5e7eb0f6f175a8645b3b2be16c276a5082f3732566d4e3aeaee6842` | 292,160,666 bytes; MD5 `87c18ce0608499afd91ed0f2a5ee8eef` |
| Emergency-food context | `2028263b138bbdc0fba5e05a6067ebf8daf5b892d8698b7eb49d7e81e9658e2c` | 33,767 bytes / 75 features |
| Reviewed classification evidence | `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570` | empty reviewed set; no manual override |

The Food bundle retains Plan 2 TIGER SHA-256
`154481f2f16544a0d07a4fe005e2d76fd996b4d1e80527cec50a67e772545834`.
MobilityData GTFS Validator `8.0.1` JAR SHA-256 is
`19293ddd9b6f954f216d4f12054bd8a3232921751c4484339e339764a91000e2`;
validation reported zero errors. Warnings were retained rather than hidden: seven missing
recommended fields, one missing recommended file, 1,000,610 missing timepoint values, and 19,950
mixed-case recommended-field notices. The feed Last-Modified value is `2026-07-22T00:06:18Z`,
validity is 2026-06-07 through 2026-12-05, and analysis dates are Tuesday 2026-09-01 and Saturday
2026-09-05. Static GTFS describes scheduled availability, not reliability or real-time service.

The approved walking graph has 623,268 nodes, 1,557,006 directed edges, and SHA-256
`a7e4bf2230e4b38cc5126d45c16f96270814bfd48caa15f698c81d5d580e17fa`.
Exactly one baseline-eligible origin is unsnapped: tract `55079187200` is 251.60 meters from the
nearest graph node, beyond the fixed 200-meter rule. Its grocery-walk and transit metrics retain
`missing` / `origin_unsnapped`; there is no straight-line fallback. Grocery-walk output contains
299 observed, one unreachable, and two missing rows. Transit contains 300 observed and two
missing rows.

Retail reconciliation produced 125 full-service versions: 51 active scoring-eligible and 74
inactive. Candidate full-service versions total 160 (95 active, 65 inactive); no candidate is
scoring eligible without approved evidence. The empty reviewed-evidence set creates zero manual
Super Store overrides. All 75 emergency records retain unknown activity and stale unverified
context: 71 pantries, two meal programs, one food bank, and one pantry/recovery program. Each
emergency 10/15/20-minute context metric is missing for all 302 tracts because activity is
unknown; those rows remain persisted but excluded from scoring and score identity.

### Validated unpublished run

- Run ID: `97bd1cdf-bf96-573f-8fcf-92e8676925d4`; status `validated`; no Food status or command can
  publish it.
- Full registry hash: `a652b353c9e67ddbb10b1484dc3d12ab0a41530b782a72cb3b9349f54637ed39`.
- Scoring registry hash: `46cda0d750bed6af9f4ba3fd73eb6f86e3bf2d7fa8b5390524992c62d14d25ec`.
- Input-manifest hash: `d6c61cc2eba658a0b9b9068efa5465e1bbe762cca83e2200663ff9d2c9a3e4e0`.
- Score-input fingerprint: `68b418f7b6140e9083b1e28d61a7697867e5a7651b42260337ed1710278bc0b1`.
- Run fingerprint: `cfec9911c2bc6de4866c97e7480f016a5aacbab5ef5b32accdd5d22716252603`.
- Canonical output hash: `dd53d60adf1755fff5d865f7ecfd4eba9459507b1c19c36a976b7152aa889096`.
- Full replay completed all eight stages, returned the same run ID and output hash with
  `reused=true` and `verified_existing=true`, and left every persisted count unchanged.
- Post-amendment local gate: Ruff and format passed; mypy passed 45 source files; 565 Python data
  tests passed with 12 expected live-integration deselections; 29 database unit tests and the
  database workspace typecheck passed.
- Persisted shape: 2,741 stable resources, 2,892 resource versions, 3,020 scalar metric rows,
  7,852 metric/snapshot links, 1,196 components, and 302 scores (299 complete, one insufficient,
  two zero-population). Priority counts are 18 at Priority 1, 96 at 2, 136 at 3, 40 at 4, and 9
  at 5; three rows correctly have no Priority.

### Reviewed tract traces

- High overlap: `55079000101` has Very High Equity Baseline and Very High Food Access Need
  (county percentile 90.94), producing Priority 1. Its four observed inputs include 37.51% SRAM
  one-mile low access, 1,147.52 meters routed grocery distance (14.26 minutes), 36.35% households
  without a vehicle with a use-with-caution ACS reliability state, and 6.25 scheduled trips/hour.
- Middle outcome: `55079000301` has Very Low Equity Baseline and Very High Food Access Need
  (94.63), producing Priority 3. Its zero reachable scheduled trips/hour is an observed zero from
  a valid snapped origin, not missing data; its ACS no-vehicle estimate is marked high uncertainty.
- Low overlap: `55079007500` has Very Low Equity Baseline and Very Low Food Access Need
  (0.00), producing Priority 5. SRAM observes zero population beyond one mile, routed grocery
  distance is 494.59 meters, and scheduled intensity is 21 trips/hour; its ACS estimate remains
  high uncertainty.
- Insufficient: `55079187200` has a Very Low Equity Baseline but no Food Access Need band or
  Priority because its approved origin is unsnapped. The missing grocery-walk and transit inputs
  are not replaced with zero and weights are not redistributed.

These are tract-level descriptive measurements and deterministic overlap categories. They do not
describe individual behavior, prove causation, measure literacy or service effectiveness, or make
a funding recommendation. Raw records, local absolute paths, reports, credentials, and database
URLs remain uncommitted.

Pending after Task 13 completion: PR URL, CI URLs, and Task 14 load-bearing review. The sanitized
Task 13 commit is recorded when created.
