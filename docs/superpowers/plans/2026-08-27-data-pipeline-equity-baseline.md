# Plan 2 — Data Pipeline + Equity Baseline Implementation Plan

> **Execution rule:** Implement one task at a time in the MOO-751 worktree. Analytical and
> spatial logic must begin with the listed failing tests. Do not start Plan 3 or MOO-752.

**Goal:** Build a reproducible, versioned Milwaukee Equity Baseline for every canonical 2020
Census tract in Milwaukee County, preserve source provenance and uncertainty, load the
approved model into Neon/PostGIS, and prove one development score run reaches `validated`
without publishing it.

**Architecture:** A registry-driven Python pipeline executes explicit
`fetch -> snapshot -> validate -> normalize -> load -> score -> validate-run` stages. Raw
official-source responses are immutable and content-addressed. Pure Python scoring operates on
typed records and exact ranks; Psycopg owns transactional ingestion and run writes; PostGIS owns
geometry storage and validity; TypeScript/Drizzle owns versioned schema migrations. CI uses
small committed fixtures only. One isolated, expiring Neon branch is used for final real-data
verification.

**Tech Stack:** Python 3.13, pandas 3.0.5, GeoPandas 1.1.4, Shapely 2.1.2, Pyogrio 0.13.0,
PyProj 3.7.2, Psycopg 3.3.4 with binary wheels, pytest 9.0.2, Hypothesis 6.165.10, Ruff
0.14.10, mypy 2.3.1, PostgreSQL/PostGIS, Drizzle ORM 0.45.2, Drizzle Kit 0.31.10, uv, npm,
GitHub Actions, official Census APIs/files, and the CDC Socrata API. The geospatial/database
versions were checked against current official package metadata on 2026-08-27.

**Spec:** `docs/superpowers/specs/2026-08-27-moo-751-equity-baseline-design.md`

**Tracking:** Linear `MOO-751` — Plan 2 — Data Pipeline + Equity Baseline.

**Plan status:** Approved methodology and design are committed at `2259478`. Implementation has
not started.

## Approved execution decisions

1. Work only in `.worktrees/moo-751` on branch
   `tarikjmoody/moo-751-plan-2-data-pipeline-equity-baseline`.
2. Use 2020 TIGER/Line tracts, 2024 ACS 5-Year Detailed Tables, and the CDC PLACES December
   2025 release exactly as approved in the design spec.
3. Use all 13 approved indicators, strict all-indicator completeness, equal domain weights,
   average-rank percentiles, and fixed 20-point bands. Do not revisit methodology in code.
4. Use bounded official-source snapshots. Raw data and machine reports stay ignored; sanitized
   manifests, fixtures, and concise verification evidence are committed.
5. Create `moo-751-equity-baseline` as a new development-only Neon branch from the Plan 1
   foundation branch, with the repository's seven-day TTL policy. Confirm the resolved branch
   before any migration or write.
6. A normal repeat invocation is idempotent. `--verify-existing` recomputes canonical results
   and compares their output hash with the stored run without creating duplicate analytical
   rows.
7. MOO-751 contains no publish command or allowed `validated -> published` transition.

## Global constraints

- Implement only the MOO-751 contract. Food data, access metrics, Food Equity Priority, UI,
  MapLibre analytical layers, Gate 1, and Plan 3 are out of scope.
- Do not mutate production or the default Neon branch.
- Do not use an LLM or browser code for ingestion, validation, normalization, scoring,
  classification, spatial validation, or recommendations.
- Never replace missing, suppressed, conflicting, or invalid data with zero.
- Do not redistribute weights for incomplete tracts.
- Preserve original source bytes before transformation and retain the exact provenance chain
  from score component to indicator value to snapshot to source.
- Never print, persist, or commit Census API keys, Neon passwords, or database URLs.
- Use PostGIS geometry types and constraints; MapLibre remains presentation-only.
- Write failing tests first for every analytical and spatial behavior.
- Commit each independently reviewable task with `MOO-751` in the message.
- Do not mark the issue Done until the real-data verification checklist, user diff-question,
  CI, and evidence comment all pass.

## Interfaces consumed and produced

| Producer | Interface | Consumer |
|---|---|---|
| `registry.toml` | approved sources, 13 typed formulas, domains, weights, quality and band rules | registry loader, normalizers, scorer, run fingerprint |
| `artifacts.py` | `SnapshotManifest`, immutable bytes, sanitized request metadata, SHA-256 | source adapters, loader, verification evidence |
| `geography.py` | canonical `GeographyRecord` objects in EPSG:4326 | database loader, eligibility reconciliation |
| `acs.py` | seven `IndicatorObservation` objects per canonical tract plus population | scorer, database loader, quality report |
| `places.py` | six `IndicatorObservation` objects per covered tract | scorer, database loader, quality report |
| `scoring.py` | `ScoreRunResult` with components, tract scores, exclusions, canonical output hash | database repository, verification report |
| `database.py` | transactional source/geography/value/run persistence and idempotent lookup | CLI runner and live integration tests |
| CLI | stage-specific JSON report and nonzero failure status | developer workflow, evidence capture, Gate 1 |

## File map

Plan 2 creates or modifies these exact responsibility groups:

- Python configuration: `pyproject.toml`, `uv.lock`, `.env.example`, `.gitignore`,
  `.github/workflows/ci.yml`, and `data/README.md`.
- Registry and core models: `pipelines/equity_baseline/registry.toml`, `registry.py`, `models.py`,
  `errors.py`, and `quality.py`.
- Snapshot infrastructure: `pipelines/equity_baseline/artifacts.py` and `http.py`.
- Source adapters: `pipelines/equity_baseline/geography.py`, `acs.py`, and `places.py`.
- Scoring and orchestration: `pipelines/equity_baseline/scoring.py`, `database.py`, `runner.py`,
  `cli.py`, `__main__.py`, and `__init__.py`.
- Database schema: `packages/database/drizzle.config.ts`,
  `packages/database/src/schema/equity-baseline.ts`, `packages/database/src/schema/index.ts`,
  generated `packages/database/drizzle/0001_*.sql` and metadata, and database tests.
- Test fixtures: `tests/data/fixtures/equity_baseline/**` using minimal GeoJSON/JSON inputs and
  reviewed golden outputs.
- Python tests: `tests/data/equity_baseline/test_registry.py`, `test_artifacts.py`,
  `test_geography.py`, `test_acs.py`, `test_places.py`, `test_scoring.py`, `test_runner.py`,
  `test_cli.py`, and `test_database_integration.py`.
- Manifests and evidence: `data/manifests/equity-baseline/**` and
  `docs/verification/plan-2-data-pipeline-equity-baseline.md`.
- Documentation: `README.md`, `docs/development/database.md`, `docs/data/ingestion.md`,
  `docs/data/schema.md`, `docs/data/source-registry.md`, and
  `docs/architecture/repository.md` only where implementation commands or final contracts need
  alignment.

---

### Task 0: Confirm the contract, approved design, and isolated workspace

**Files:**
- Read: Linear `MOO-751`
- Read: `docs/superpowers/specs/2026-08-27-moo-751-equity-baseline-design.md`
- Create: this implementation plan

**Interfaces:**
- Consumes: the complete Linear contract and user-approved methodology/design comments.
- Produces: an isolated feature branch and executable task plan.

- [x] **Step 1: Re-read MOO-751 and confirm its contract**

Expected: the issue contains Intent, Acceptance criteria, Verification checklist, Out of scope,
blocks MOO-752, and is `In Progress`.

- [x] **Step 2: Create the worktree from the approved design commit**

```bash
git worktree add .worktrees/moo-751 -b tarikjmoody/moo-751-plan-2-data-pipeline-equity-baseline main
```

Expected: the branch starts at `2259478`, and the primary checkout remains on `main`.

- [ ] **Step 3: Commit this reviewed implementation plan**

```bash
git add docs/superpowers/plans/2026-08-27-data-pipeline-equity-baseline.md
git commit -m "docs: plan MOO-751 equity baseline implementation"
```

Expected: only the plan is added in this checkpoint.

---

### Task 1: Pin the Python toolchain and implement the approved registry contract

**Files:**
- Modify: `pyproject.toml`
- Modify: `uv.lock`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml`
- Modify: `data/README.md`
- Create: `pipelines/equity_baseline/__init__.py`
- Create: `pipelines/equity_baseline/models.py`
- Create: `pipelines/equity_baseline/errors.py`
- Create: `pipelines/equity_baseline/registry.py`
- Create: `pipelines/equity_baseline/registry.toml`
- Create: `tests/data/equity_baseline/test_registry.py`

**Interfaces:**
- Consumes: the approved design's exact sources, formulas, weights, quality states, tie method,
  and bands.
- Produces: immutable typed registry/model contracts and a canonical registry SHA-256.

- [ ] **Step 1: Write the failing registry tests**

Test that the loader requires exactly 13 unique indicator slugs; three expected domains with
3/4/6 indicators; weights summing to one inside each domain and one-third across domains; the
seven exact ACS formulas; the six exact PLACES measure IDs; higher-is-worse direction; strict
completeness; average-rank tie method; fixed band boundaries; and approved vintages. Add
negative cases for duplicate slugs, unknown formula types, invalid weights, missing variables,
and overlapping band boundaries.

```bash
uv run pytest tests/data/equity_baseline/test_registry.py -q
```

Expected RED: import failure because `pipelines.equity_baseline.registry` does not exist.

- [ ] **Step 2: Pin runtime and development dependencies**

Set runtime dependencies to:

```toml
dependencies = [
  "geopandas==1.1.4",
  "pandas==3.0.5",
  "psycopg[binary]==3.3.4",
  "pyogrio==0.13.0",
  "pyproj==3.7.2",
  "shapely==2.1.2",
]
```

Add `hypothesis==6.165.10` and `mypy==2.3.1` to the development group. Configure mypy strict
mode for `pipelines`, register the `integration` pytest marker, keep integration tests excluded
by default, and add `ruff format --check` plus mypy to CI.

Add `CENSUS_API_KEY=` and `MKE_PIPELINE_ENV=` to `.env.example`. Add ignored
`data/normalized/` and `data/reports/` paths while explicitly allowing committed
`data/manifests/`. Update `data/README.md` with the Plan 2 raw/manifest/license boundary.

Run:

```bash
uv lock
uv sync --locked
```

Expected: Python 3.13 resolves binary wheels and `uv.lock` contains the exact direct pins.

- [ ] **Step 3: Implement typed registry loading**

Use `tomllib`, frozen dataclasses, `Decimal`, explicit formula-type discriminators, and manual
validation. Hash the exact committed registry bytes with SHA-256. Never evaluate registry
content. Keep scoring behavior out of this task.

- [ ] **Step 4: Make the registry checks green**

```bash
uv run pytest tests/data/equity_baseline/test_registry.py -q
uv run ruff check pipelines/equity_baseline tests/data/equity_baseline/test_registry.py
uv run ruff format --check pipelines/equity_baseline tests/data/equity_baseline/test_registry.py
uv run mypy pipelines
```

Expected: all registry tests pass, Ruff reports no findings, formatting is unchanged, and mypy
reports success with no errors.

- [ ] **Step 5: Commit checkpoint**

```bash
git add pyproject.toml uv.lock .env.example .gitignore .github/workflows/ci.yml data/README.md pipelines/equity_baseline tests/data/equity_baseline/test_registry.py
git commit -m "feat(data): add approved equity registry (MOO-751)"
```

---

### Task 2: Add the normalized PostGIS and provenance schema

**Files:**
- Modify: `packages/database/drizzle.config.ts`
- Create: `packages/database/src/schema/equity-baseline.ts`
- Create: `packages/database/src/schema/index.ts`
- Create: generated `packages/database/drizzle/0001_*.sql`
- Modify/Create: generated `packages/database/drizzle/meta/**`
- Modify: `packages/database/tests/migration-scope.test.ts`
- Create: `packages/database/tests/equity-baseline-schema.test.ts`

**Interfaces:**
- Consumes: Plan 1 PostGIS/Drizzle boundary and the approved logical model.
- Produces: `geographies`, `data_sources`, `source_snapshots`, `indicator_definitions`,
  `indicator_values`, `score_runs`, `score_components`, and `scores` with explicit constraints.

- [ ] **Step 1: Write failing schema and migration tests**

Assert table names, primary/foreign keys, snapshot and run fingerprints, unique
geography/GEOID/vintage identity, 11-digit GEOID/FIPS checks, numeric 0–100 checks, nullable
values with explicit quality state, EPSG:4326 multipolygon/point columns, GiST indexes, complete
score consistency, and the absence of food/access tables. Assert the migration contains a
score-run transition function/trigger that permits `draft -> validated` and `draft -> failed`
but rejects publication in Plan 2.

```bash
npm test --workspace @mke/database -- --exclude "**/*.integration.test.ts"
```

Expected RED: missing schema module and Plan 2 migration.

- [ ] **Step 2: Declare the Drizzle schema**

Use UUID application-assigned primary keys, timestamptz timestamps, JSONB metadata,
`numeric(15,12)` analytical values, `geometry(MultiPolygon,4326)`,
`geometry(Point,4326)`, named checks, and named indexes. Include all canonical run statuses in
the type contract (`draft`, `validated`, `published`, `superseded`, `failed`) while the Plan 2
transition trigger blocks creation or transition to publication states.

Store an `output_hash` on `score_runs`. A complete score row requires all numeric outputs and a
band; `insufficient_data` and `ineligible_zero_population` require all analytical outputs to be
null. Indicator values may be null only with a non-valid quality state and retained metadata.

- [ ] **Step 3: Generate and review the migration**

Add the schema path to `drizzle.config.ts`, then run:

```bash
npm run db:generate --workspace @mke/database -- --name equity_baseline
```

Append the reviewed transition trigger and PostGIS validity/SRID/non-empty constraints as
custom SQL in the generated migration. Do not hand-edit generated schema metadata to disagree
with the TypeScript declarations.

- [ ] **Step 4: Make database checks green**

```bash
npm test --workspace @mke/database -- --exclude "**/*.integration.test.ts"
npm run typecheck --workspace @mke/database
git diff --check
```

Expected: unit tests pass, TypeScript emits no errors, the migration creates only approved Plan
2 tables plus constraints/indexes, and the diff has no whitespace errors.

- [ ] **Step 5: Commit checkpoint**

```bash
git add packages/database
git commit -m "feat(database): add equity provenance schema (MOO-751)"
```

---

### Task 3: Build immutable snapshots, sanitized manifests, and bounded retries

**Files:**
- Create: `pipelines/equity_baseline/artifacts.py`
- Create: `pipelines/equity_baseline/http.py`
- Create: `tests/data/equity_baseline/test_artifacts.py`

**Interfaces:**
- Consumes: source URL/query, byte stream, declared source version, injected clock/opener/sleeper.
- Produces: atomically stored raw bytes and `SnapshotManifest` with sanitized provenance.

- [ ] **Step 1: Write failing artifact and HTTP tests**

Cover SHA-256 and byte-size calculation, deterministic schema fingerprints, exact source byte
preservation, atomic rename, same-checksum reuse, different-checksum distinct snapshots,
request-key redaction, JSON canonicalization, no partial target after failure, retry only for
transient network/5xx errors, and immediate failure for 4xx/schema errors. Inject time and sleep;
tests must not use the network.

```bash
uv run pytest tests/data/equity_baseline/test_artifacts.py -q
```

Expected RED: artifact modules are missing.

- [ ] **Step 2: Implement the snapshot boundary**

Use `urllib.request`, `urllib.parse`, `tempfile`, and `Path.replace`. Retry at most three times
with injected 1/2/4-second backoff. Sanitize `key`, passwords, and database URLs before logging
or manifest creation. Store raw files below `data/raw/equity-baseline/` and reports below
`data/reports/equity-baseline/`; parameterize the root for tests.

- [ ] **Step 3: Verify and commit**

```bash
uv run pytest tests/data/equity_baseline/test_artifacts.py -q
uv run ruff check pipelines/equity_baseline tests/data/equity_baseline/test_artifacts.py
uv run mypy pipelines
git add pipelines/equity_baseline tests/data/equity_baseline/test_artifacts.py
git commit -m "feat(data): preserve immutable source snapshots (MOO-751)"
```

Expected: focused tests, Ruff, and mypy pass; no generated raw file is staged.

---

### Task 4: Ingest and validate canonical 2020 tract geography

**Files:**
- Create: `pipelines/equity_baseline/geography.py`
- Create: `tests/data/fixtures/equity_baseline/tiger/tracts.geojson`
- Create: `tests/data/equity_baseline/test_geography.py`

**Interfaces:**
- Consumes: official `tl_2020_55_tract.zip` snapshot or fixture GeoJSON.
- Produces: sorted Milwaukee County `GeographyRecord` objects with valid EPSG:4326
  multipolygons and projected centroids.

- [ ] **Step 1: Write failing geography tests first**

Cover required TIGER columns; FIPS `55`/`079`; GEOID prefix/length/uniqueness; missing CRS;
wrong county; empty, null, and invalid geometry; polygon-to-multipolygon normalization;
deterministic GEOID ordering; reprojection to EPSG:4326; centroid calculation in EPSG:3071 and
reprojection; and non-empty centroid output. Reject invalid authoritative geometry instead of
repairing it silently.

```bash
uv run pytest tests/data/equity_baseline/test_geography.py -q
```

Expected RED: geography adapter is missing.

- [ ] **Step 2: Implement the bounded TIGER adapter**

Use the official URL:

`https://www2.census.gov/geo/tiger/TIGER2020/TRACT/tl_2020_55_tract.zip`

Read with `geopandas.read_file(..., engine="pyogrio")`, validate before subsetting, subset by
canonical FIPS attributes, normalize Polygon to MultiPolygon, compute centroids only in
EPSG:3071, and return sorted frozen records. This stage does not write PostGIS.

- [ ] **Step 3: Verify and commit**

```bash
uv run pytest tests/data/equity_baseline/test_geography.py -q
uv run ruff check pipelines/equity_baseline/geography.py tests/data/equity_baseline/test_geography.py
uv run mypy pipelines
git add pipelines/equity_baseline/geography.py tests/data/fixtures/equity_baseline/tiger tests/data/equity_baseline/test_geography.py
git commit -m "feat(data): normalize canonical tract geography (MOO-751)"
```

---

### Task 5: Ingest ACS groups and derive seven indicators with uncertainty

**Files:**
- Create: `pipelines/equity_baseline/quality.py`
- Create: `pipelines/equity_baseline/acs.py`
- Create: `tests/data/fixtures/equity_baseline/acs/*.json`
- Create: `tests/data/equity_baseline/test_acs.py`

**Interfaces:**
- Consumes: 2024 ACS 5-Year group responses for `B01003`, `B03002`, `C16001`, `B05002`,
  `C17002`, `B23025`, `B15003`, and `B25106`.
- Produces: population plus seven observations per canonical tract, including derived MOE, CV,
  and quality metadata.

- [ ] **Step 1: Write formula and source-contract tests first**

Create reviewed fixtures and exact expected values for every approved formula. Cover headers,
duplicate/missing GEOIDs, missing groups/variables, Census jam values and annotations,
nonpositive denominators, 0 and 100 boundaries, out-of-range inputs, sum/difference/proportion
MOE approximation, negative proportion radicand fallback, CV thresholds at 15 and 30, zero
estimate CV state, and strict no-missing-to-zero behavior. Use Hypothesis to prove valid source
counts never yield a percentage outside 0–100 and source row order never changes output.

```bash
uv run pytest tests/data/equity_baseline/test_acs.py -q
```

Expected RED: ACS and quality modules are missing.

- [ ] **Step 2: Implement bounded ACS group fetching**

Call the 2024 ACS 5-Year endpoint once per approved group with `group(<GROUP>)`, which
already includes `NAME`,
`for=tract:*`, and `in=state:55 county:079`. Read `CENSUS_API_KEY` only at request time. Store
each raw group response unchanged, but omit the key from manifest request metadata. Validate
group metadata and response headers before normalization.

- [ ] **Step 3: Implement typed formulas and uncertainty**

Use `Decimal` for source numbers. Implement only explicit registry formula types. Approximate
MOE according to Census sum/difference/proportion guidance, then apply the approved CV states.
Return a row for every expected tract/indicator, including null-valued rows with explicit
quality state and reasons.

- [ ] **Step 4: Reconcile ACS geography**

Require the ACS tract set to match the canonical positive/zero-population geography set exactly.
Report missing, extra, and duplicate GEOIDs rather than dropping them. Preserve ACS population
as eligibility input and provenance.

- [ ] **Step 5: Verify and commit**

```bash
uv run pytest tests/data/equity_baseline/test_acs.py -q
uv run ruff check pipelines/equity_baseline tests/data/equity_baseline/test_acs.py
uv run mypy pipelines
git add pipelines/equity_baseline/acs.py pipelines/equity_baseline/quality.py tests/data/fixtures/equity_baseline/acs tests/data/equity_baseline/test_acs.py
git commit -m "feat(data): normalize ACS equity indicators (MOO-751)"
```

---

### Task 6: Ingest the six approved CDC PLACES measures

**Files:**
- Create: `pipelines/equity_baseline/places.py`
- Create: `tests/data/fixtures/equity_baseline/places/tracts.json`
- Create: `tests/data/equity_baseline/test_places.py`

**Interfaces:**
- Consumes: CDC dataset `cwsq-ngmh`, Milwaukee County, the six exact measure IDs, and `CrdPrv`.
- Produces: six observations per covered tract with confidence limits and explicit missing or
  invalid states for canonical tracts.

- [ ] **Step 1: Write failing PLACES contract tests**

Cover exact `measureid` and value-type filters, source year/release metadata, 11-digit GEOIDs,
wrong county, age-adjusted contamination, duplicates, missing measures, footnoted/unusable
values, nonnumeric/out-of-range values, invalid confidence intervals, extra GEOIDs, canonical
tracts absent because of the PLACES adult-population threshold, and input-order independence.

```bash
uv run pytest tests/data/equity_baseline/test_places.py -q
```

Expected RED: PLACES adapter is missing.

- [ ] **Step 2: Implement the bounded Socrata query and normalization**

Query `https://data.cdc.gov/resource/cwsq-ngmh.json` with an explicit select list, county FIPS
`55079`, the six approved measure IDs, `datavaluetypeid='CrdPrv'`, deterministic
`locationid,measureid` ordering, and a limit safely above the expected result count. Preserve
raw bytes and sanitized SoQL metadata. Build explicit missing observations for unmatched
canonical positive-population tracts.

- [ ] **Step 3: Verify and commit**

```bash
uv run pytest tests/data/equity_baseline/test_places.py -q
uv run ruff check pipelines/equity_baseline/places.py tests/data/equity_baseline/test_places.py
uv run mypy pipelines
git add pipelines/equity_baseline/places.py tests/data/fixtures/equity_baseline/places tests/data/equity_baseline/test_places.py
git commit -m "feat(data): normalize PLACES health indicators (MOO-751)"
```

---

### Task 7: Implement exact deterministic scoring and golden regression fixtures

**Files:**
- Create: `pipelines/equity_baseline/scoring.py`
- Create: `tests/data/fixtures/equity_baseline/golden/input.json`
- Create: `tests/data/fixtures/equity_baseline/golden/expected.json`
- Create: `tests/data/equity_baseline/test_scoring.py`

**Interfaces:**
- Consumes: canonical geographies, population, 13 normalized observations per tract, and the
  validated registry.
- Produces: components, subindices, composite scores, final percentiles/bands, exclusion
  reasons, and canonical output hash.

- [ ] **Step 1: Write scoring tests before implementation**

Test average-rank percentiles with no ties, tied minima/middle/maxima, all equal values, one
eligible tract, reversed input order, and null exclusion. Test strict all-13 completeness,
zero-population ineligibility, no weight redistribution, 3/4/6 domain means, one-third domain
aggregation, final composite reranking, exact 20/40/60/80 boundaries, and tie-preserving bands.

Use Hypothesis to prove percentiles remain in 0–100, equal inputs get equal ranks, monotonic raw
values never reverse rank, and permutations preserve canonical output. The golden fixture must
include complete tracts, a tie, a zero-population tract, a missing indicator, and a
high-uncertainty but valid indicator.

```bash
uv run pytest tests/data/equity_baseline/test_scoring.py -q
```

Expected RED: scorer is missing.

- [ ] **Step 2: Implement the pure scorer**

Rank raw `Decimal` values; represent ranks, subindices, and composite intermediates with
`Fraction` so ordering and ties are exact; quantize persisted output to 12 decimal places only
at the output boundary. Sort canonical output by GEOID and registry indicator order. Hash the
canonical JSON bytes. Do not use pandas ranking, GEOID tie-breaking, random values, timestamps,
or database ordering.

- [ ] **Step 3: Review and freeze golden output**

Manually trace the fixture's indicator ranks, three subindices, composite, final percentile,
band, and exclusion reasons against the approved spec before accepting `expected.json`.

- [ ] **Step 4: Verify and commit**

```bash
uv run pytest tests/data/equity_baseline/test_scoring.py -q
uv run ruff check pipelines/equity_baseline/scoring.py tests/data/equity_baseline/test_scoring.py
uv run mypy pipelines
git add pipelines/equity_baseline/scoring.py tests/data/fixtures/equity_baseline/golden tests/data/equity_baseline/test_scoring.py
git commit -m "feat(data): score deterministic equity baseline (MOO-751)"
```

---

### Task 8: Add transactional persistence, lifecycle enforcement, runner, and CLI

**Files:**
- Create: `pipelines/equity_baseline/database.py`
- Create: `pipelines/equity_baseline/runner.py`
- Create: `pipelines/equity_baseline/cli.py`
- Create: `pipelines/equity_baseline/__main__.py`
- Create: `tests/data/equity_baseline/test_runner.py`
- Create: `tests/data/equity_baseline/test_cli.py`
- Create: `tests/data/equity_baseline/test_database_integration.py`

**Interfaces:**
- Consumes: snapshots, normalized records, scoring result, `DATABASE_URL_UNPOOLED`, and
  `MKE_PIPELINE_ENV=development` for writes.
- Produces: idempotent database records, `draft -> validated|failed` lifecycle, and structured
  stage reports.

- [ ] **Step 1: Write failing runner/CLI tests**

Use fake repositories and injected stages to cover stage ordering, stopping at requested stage,
read-only stages without database configuration, write rejection outside development mode,
transaction rollback, failure report redaction, draft-to-failed behavior, no publish command,
same-fingerprint idempotency, and `--verify-existing` recomputation/output-hash comparison.

```bash
uv run pytest tests/data/equity_baseline/test_runner.py tests/data/equity_baseline/test_cli.py -q
```

Expected RED: runner/CLI modules are missing.

- [ ] **Step 2: Implement the Psycopg repository**

Use parameterized statements and `with psycopg.connect(...)` transaction contexts. Insert
sources/snapshots/definitions/geographies/values, then create the draft run, components, and
scores in deterministic order. Use COPY only where tests prove typed/null/JSON behavior; never
construct SQL with source values. On analytical failure, roll back partial output and record a
separate redacted failed-run transaction.

The repository resolves an identical run fingerprint before writes. `--verify-existing`
recomputes the full result from pinned normalized inputs, compares its canonical output hash
with the stored `output_hash`, and returns the existing run ID without duplicate rows.

- [ ] **Step 3: Implement explicit CLI stages**

Expose:

```text
python -m pipelines.equity_baseline fetch
python -m pipelines.equity_baseline validate
python -m pipelines.equity_baseline normalize
python -m pipelines.equity_baseline load
python -m pipelines.equity_baseline score
python -m pipelines.equity_baseline validate-run
python -m pipelines.equity_baseline run --through validated
```

Use `argparse`; write one machine-readable report per invocation and a concise stdout summary.
Do not expose `publish` or arbitrary status mutation.

- [ ] **Step 4: Add opt-in integration tests**

Mark database tests `integration`. Against a disposable migrated branch, verify foreign keys,
geometry/SRID constraints, complete/incomplete score checks, rollback, lifecycle trigger,
orphan prevention, idempotency, and output-hash comparison. Tests must skip safely without a
database URL and must never print it.

- [ ] **Step 5: Verify and commit**

```bash
uv run pytest tests/data/equity_baseline/test_runner.py tests/data/equity_baseline/test_cli.py -q
uv run ruff check pipelines tests/data
uv run ruff format --check pipelines tests/data
uv run mypy pipelines
git add pipelines/equity_baseline tests/data/equity_baseline
git commit -m "feat(data): orchestrate validated score runs (MOO-751)"
```

---

### Task 9: Complete offline verification and implementation documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/repository.md`
- Modify: `docs/data/ingestion.md`
- Modify: `docs/data/schema.md`
- Modify: `docs/data/source-registry.md`
- Modify: `docs/development/database.md`
- Create: `docs/verification/plan-2-data-pipeline-equity-baseline.md`

**Interfaces:**
- Consumes: implemented commands, schema, and fixture behavior.
- Produces: developer workflow, migration/run instructions, quality semantics, and evidence
  template aligned with reality.

- [ ] **Step 1: Run the complete offline gate**

```bash
uv sync --locked
uv run ruff check pipelines tests/data
uv run ruff format --check pipelines tests/data
uv run mypy pipelines
uv run pytest tests/data -q
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

Expected: every command exits zero; database integration tests are excluded; no network or live
database is required; no user-facing responsive test changes are necessary for this backend-only
plan.

- [ ] **Step 2: Document exact operations and quality states**

Document prerequisites, environment names without secrets, stage commands, artifact locations,
approved source versions, lifecycle boundaries, idempotency, failure recovery, and how to read
quality reports. Keep the complete formulas in the approved methodology/spec rather than
duplicating inconsistent prose.

- [ ] **Step 3: Commit checkpoint**

```bash
git add README.md docs .github/workflows/ci.yml
git commit -m "docs(data): document equity baseline operations (MOO-751)"
```

---

### Task 10: Create the expiring Neon branch and run authoritative source data

**Files:**
- Local ignored: `.neon`, `.env.local`, `data/raw/**`, `data/normalized/**`, `data/reports/**`
- Create: `data/manifests/equity-baseline/**`
- Modify: `docs/verification/plan-2-data-pipeline-equity-baseline.md`

**Interfaces:**
- Consumes: personal `mke-service-equity` Neon project, Plan 1 foundation branch, official
  source endpoints, Census API key, and committed pipeline.
- Produces: migrated isolated database, immutable manifests, one `validated` run, and real
  verification evidence.

- [ ] **Step 1: Confirm external identity and request the live-write approval**

Before any mutation, verify the local Neon project/organization is the personal
`mke-service-equity` project, the parent is the Plan 1 foundation branch, the target name is
`moo-751-equity-baseline`, and the target is non-default with seven-day TTL. Do not use the
unrelated loaded Neon connector. Confirm `CENSUS_API_KEY` exists without printing it.

- [ ] **Step 2: Create/check out the branch through repository Neon policy**

```bash
neon checkout moo-751-equity-baseline --parent moo-750-foundation
neon branches list --output json
```

Inspect the JSON without printing connection strings. Record project ID, branch name/ID,
parent, database, role, expiry, and `development-only`. Repull `.env.local` through the checkout
workflow and verify `NEON_BRANCH` resolves to the recorded branch ID.

- [ ] **Step 3: Apply and independently verify migrations**

```bash
npm run db:migrate --workspace @mke/database
npm run test:integration --workspace @mke/database
uv run pytest tests/data/equity_baseline/test_database_integration.py -q -m integration
```

Use an independent `psql` session with `ON_ERROR_STOP=1` and the unpooled URL to verify PostGIS,
the eight approved tables, named constraints/indexes, lifecycle trigger, and zero published runs.
Never place the URL on the command line or in evidence.

- [ ] **Step 4: Fetch, validate, normalize, and load official sources**

Run each stage separately first so failures remain attributable:

```bash
uv run python -m pipelines.equity_baseline fetch
uv run python -m pipelines.equity_baseline validate
uv run python -m pipelines.equity_baseline normalize
uv run python -m pipelines.equity_baseline load
uv run python -m pipelines.equity_baseline score
uv run python -m pipelines.equity_baseline validate-run
```

Expected: source snapshots and reports exist locally; sanitized manifests contain checksums and
counts; the database has one validated run and no published run.

- [ ] **Step 5: Prove repeatability and idempotency**

```bash
uv run python -m pipelines.equity_baseline run --through validated --verify-existing
```

Expected: the pipeline independently recomputes the same canonical output hash, returns the
existing run ID/fingerprint, creates no duplicate source/value/component/score rows, and leaves
status `validated`.

- [ ] **Step 6: Reconcile real counts and provenance**

Record and independently query:

- TIGER canonical tract count, unique GEOIDs, FIPS containment, valid geometry, SRID, and
  non-empty centroid counts;
- ACS required group/variable coverage, population coverage, annotations, missingness, and
  reliability-state counts;
- PLACES exact measure/value-type coverage, duplicates, footnotes, missing tracts, and unmatched
  GEOIDs;
- per-source checksum/version/retrieval/license/methodology provenance;
- indicator definition/value/component/score counts and orphan counts;
- complete, insufficient, zero-population, reliability, and band counts;
- methodology version, registry hash, input hash, output hash, Git commit, and run status;
- zero `published` or `superseded` runs.

- [ ] **Step 7: Commit manifests and evidence**

Review every manifest and evidence line for secrets and local-only absolute paths, then run:

```bash
git add data/manifests/equity-baseline docs/verification/plan-2-data-pipeline-equity-baseline.md
git commit -m "test(data): verify Milwaukee baseline run (MOO-751)"
```

Expected: no raw/normalized/report file or credential is staged.

---

### Task 11: Load-bearing review, CI/PR proof, and Linear closure

**Files:**
- Modify: `docs/verification/plan-2-data-pipeline-equity-baseline.md` only if final URLs or
  reviewed evidence are missing.
- Modify: Linear `MOO-751` comments/status only after proof passes.

**Interfaces:**
- Consumes: complete diff, real data model, authoritative run, full local checks, and remote CI.
- Produces: reviewed PR/evidence and a permanently auditable Linear record.

- [ ] **Step 1: Run the final clean-checkout gate**

```bash
uv sync --locked
uv run ruff check pipelines tests/data
uv run ruff format --check pipelines tests/data
uv run mypy pipelines
uv run pytest tests/data -q
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
git status --short
```

Expected: every command passes and the worktree is clean. Repeat the live integration checks
only while the approved Neon branch still exists.

- [ ] **Step 2: Ask the required load-bearing diff question**

Show the user the implemented data model, source/quality summary, run state, and key diff. Ask:

> Looking at MOO-751's acceptance criteria, what would you check first in this data model or
> validated run?

Compare the answer with recorded checks. Add any missing in-scope verification before claiming
completion.

- [ ] **Step 3: Push the feature branch and open/update the PR**

Push the Linear-named branch, create a PR that links MOO-751, summarizes methodology without
duplicating it, lists verification commands, and states explicitly that the run is validated
but unpublished. Wait for the branch CI run and PR checks to pass; record their URLs.

- [ ] **Step 4: Audit scope and publication safeguards**

Confirm the diff adds no food/access/UI feature, AI dependency or prompt, browser analytics,
production database target, publish command, missing-to-zero conversion, or secret/raw source
file. Confirm the public application still reads only `published` runs and therefore displays
no new analytical result from this deployment.

- [ ] **Step 5: Close with proof**

Update the verification document and MOO-751 comment with source manifests, validation counts,
schema/integration queries, golden/property/repeatability results, validated run identifiers and
hashes, commit range, PR, and passing CI URL. Only after every checklist item and PR merge pass,
move MOO-751 to Done. Leave MOO-752 as the next Gate 1 issue; do not start it automatically.
