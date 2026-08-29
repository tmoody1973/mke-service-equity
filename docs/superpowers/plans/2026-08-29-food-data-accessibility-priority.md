# Plan 3 — Food Data + Accessibility + Priority Implementation Plan

> **Execution rule:** Implement one task at a time in the MOO-753 worktree. Stop after Task 1
> until the exact sources and Food Equity methodology are explicitly approved. Analytical and
> spatial implementation must begin with the listed failing tests. Do not start Plan 4.

**Goal:** Build a deterministic, versioned Food Access Need and Food Equity Priority for every
eligible canonical 2020 Census tract in Milwaukee County, preserve the complete source and
calculation lineage, and prove one isolated development run reaches `validated` without
publishing it.

**Architecture:** A registry-driven Python pipeline extends the approved Plan 2 foundations with
explicit `fetch -> snapshot -> validate -> normalize -> classify -> accessibility -> load ->
score -> validate-run` stages. Immutable source artifacts feed typed normalizers for USDA retail
and benchmark data, an approved emergency-food inventory, MCTS GTFS, an approved routable walking
network, and the approved ACS vehicle-access measure. PostGIS stores resources and analytical
geography; Python owns validation, routing/access calculations, percentiles, and scoring;
Psycopg owns transactional persistence; Drizzle owns migrations. Food Access Need remains
separate from the approved Equity Baseline, and a documented matrix combines their bands into
Food Equity Priority. Existing services remain contextual unless the approved methodology defines
a non-investment access-gap input. Public investment never changes Priority.

**Tech stack:** Existing pinned Python 3.13, pandas 3.0.5, GeoPandas 1.1.4, Shapely 2.1.2,
Pyogrio 0.13.0, PyProj 3.7.2, Psycopg 3.3.4, pytest 9.0.2, Hypothesis 6.165.10, Ruff 0.14.10,
mypy 2.3.1, PostgreSQL/PostGIS, Drizzle ORM 0.45.2, Drizzle Kit 0.31.10, uv, npm, and GitHub
Actions. Task 1 selects and pins the routable-network parser/router and GTFS validator/library;
no new analytical dependency is added before that approval.

**Source candidates verified on 2026-08-29:** USDA ERS 2025 SRAM download and reference
documentation, USDA FNS SNAP Retailer Locator data, MCTS static GTFS under its developer terms,
and the Hunger Task Force verified-site directory. The emergency-food structured export and
routable walking-network snapshot are unresolved approval decisions, not implementation
assumptions.

**Spec to produce:** `docs/superpowers/specs/2026-08-29-moo-753-food-equity-design.md`

**Tracking:** Linear `MOO-753` — Plan 3 — Food Data + Accessibility + Priority.

**Plan status:** Approved by Tarik on 2026-08-29. Task 0 is complete and Task 1 may begin.
Source and scoring methodology are not yet approved.

## Execution decisions already fixed by the contract

1. Work only in `.worktrees/moo-753` on branch
   `codex/moo-753-food-data-access-priority`.
2. Use the approved MOO-751 Equity Baseline v1 run as an immutable input. Plan 3 does not alter
   its registry, indicator values, components, scores, or lifecycle.
3. Do not infer `full_service_grocery` from SNAP authorization or store-name heuristics.
4. Do not scrape a source when an approved structured download, API, feed, or partner export
   exists.
5. Do not invent coordinates, classifications, hours, service dates, routing edges, or source
   provenance. Preserve missing and uncertain states explicitly.
6. Use PostGIS/Python for official spatial and analytical calculations. Browser and MapLibre
   calculations remain out of scope.
7. Public investment never changes Food Equity Priority. Existing service response remains
   contextual unless Task 1 explicitly approves a non-investment access-gap input.
8. Plan 3 may validate nearby transit availability and scheduled frequency. Real-time transit
   and unapproved transit travel-time routing are out of scope.
9. The authoritative run must use an isolated, expiring Neon development branch, remain
   `validated`, and expose no publish command or production write path.
10. Raw source bytes and machine reports stay ignored. Sanitized manifests, minimal fixtures,
    methodology, and concise verification evidence are committed.

## Global constraints

- Implement only the MOO-753 contract. Atlas, Tract Profile, MapLibre presentation, search,
  compare, Opportunity Explorer, export UI, and MOO-754 are out of scope.
- Stop after Task 1 until the user approves the complete source/methodology design.
- Do not mutate production, the default Neon branch, or the approved Plan 2 development run.
- Do not use an LLM for acquisition, classification, routing, calculation, scoring, Priority,
  or recommendations.
- Never replace missing, stale, suppressed, conflicting, invalid, or unverified data with zero.
- Never redistribute weights or silently fall back to a lower-quality source.
- Preserve exact lineage from Priority to Food Access Need component to access/value record to
  resource/source snapshot and from Priority to the approved Equity Baseline run.
- Preserve source licenses and terms, including MCTS attribution/update requirements and any
  OpenStreetMap attribution if that network source is approved.
- Write failing tests first for every classification, analytical, scoring, and spatial rule.
- Commit each independently reviewable task with `MOO-753` in the message.
- Do not mark MOO-753 Done until real-source verification, a load-bearing user review, CI, PR,
  and the Linear evidence checklist all pass.

## Interfaces consumed and produced

| Producer | Interface | Consumer |
|---|---|---|
| Approved Equity Baseline run | validated run ID, tract GEOID, percentile, band, methodology/source lineage | Food Priority matrix and provenance ledger |
| `registry.toml` | approved sources, resource taxonomy, metric definitions, thresholds, directions, weights, completeness, bands, matrix | validators, access engine, scorer, run fingerprint |
| snapshot boundary | immutable bytes plus sanitized `SnapshotManifest` | source adapters, persistence, verification evidence |
| `retail.py` | normalized SRAM benchmark rows, SNAP retailer records, explicit classification evidence | resource loader, access engine, quality report |
| `emergency_food.py` | source-backed pantry/meal/mobile resource records and explicit missing fields | resource loader, contextual availability metrics |
| `gtfs.py` | validated static feed records and scheduled service-frequency summaries | transit accessibility metrics |
| `walking_network.py` | validated, versioned routable graph and route result contract | walking accessibility engine |
| `vehicle_access.py` | approved ACS tract measure with MOE/reliability state | Food Access Need scorer |
| `accessibility.py` | versioned tract/resource metrics with thresholds, quality, and source lineage | scorer and database repository |
| `scoring.py` | Food Access Need components/scores, matrix-derived Priority, exclusions, canonical output hash | repository, verification report |
| `database.py` | transactional Plan 3 persistence, idempotent run lookup, lifecycle enforcement | CLI and integration tests |
| CLI | stage-specific redacted JSON report and nonzero failure status | developer workflow and verification evidence |

## File map

Plan 3 creates or modifies these responsibility groups:

- Methodology and design: `docs/methodology/food-equity.md`,
  `docs/superpowers/specs/2026-08-29-moo-753-food-equity-design.md`, and this plan.
- Python configuration: `pyproject.toml`, `uv.lock`, `.env.example`, `.gitignore`,
  `.github/workflows/ci.yml`, and `data/README.md` only as approved dependencies and artifact
  boundaries require.
- Shared pipeline primitives: move or wrap reusable snapshot/HTTP/runner contracts under
  `pipelines/common/` without changing Plan 2 behavior; keep compatibility imports and tests.
- Plan 3 registry/models: `pipelines/food_equity/registry.toml`, `registry.py`, `models.py`,
  `errors.py`, and `quality.py`.
- Source adapters: `pipelines/food_equity/sram.py`, `retail.py`, `emergency_food.py`, `gtfs.py`,
  `walking_network.py`, and `vehicle_access.py`.
- Analysis/scoring: `pipelines/food_equity/accessibility.py`, `scoring.py`, `database.py`,
  `write_plan.py`, `live.py`, `runner.py`, `cli.py`, `__main__.py`, and `__init__.py`.
- Database schema: `packages/database/src/schema/food-equity.ts`, schema exports, generated
  `packages/database/drizzle/0002_*.sql` and metadata, plus migration/schema/integration tests.
- Fixtures: `tests/data/fixtures/food_equity/**` with minimal reviewed source, spatial-network,
  GTFS, classification, and golden-scoring cases.
- Python tests: `tests/data/food_equity/test_registry.py`, `test_artifacts.py`, `test_sram.py`,
  `test_retail.py`, `test_emergency_food.py`, `test_gtfs.py`, `test_walking_network.py`,
  `test_vehicle_access.py`, `test_accessibility.py`, `test_scoring.py`, `test_runner.py`,
  `test_cli.py`, and `test_database_integration.py`.
- Manifests/evidence: `data/manifests/food-equity/**` and
  `docs/verification/plan-3-food-data-accessibility-priority.md`.
- Operational docs: `README.md`, `docs/data/ingestion.md`, `docs/data/schema.md`,
  `docs/data/source-registry.md`, `docs/data/data-quality.md`,
  `docs/development/database.md`, and `docs/architecture/repository.md` where actual behavior
  changes.

---

### Task 0: Confirm the contract and isolate the workspace

**Files:**
- Read/update: Linear `MOO-753`
- Create: this implementation plan

**Interfaces:**
- Consumes: approved MOO-753 Intent, Acceptance criteria, Verification checklist, Out of scope.
- Produces: isolated branch/worktree and executable task plan.

- [x] **Step 1: Approve the complete Linear contract**

Expected: MOO-753 contains the issue-as-spec sections, blocks MOO-754, and records Tarik's
approval.

- [x] **Step 2: Move MOO-753 to In Progress**

Expected: Linear records the start time while no implementation checklist is marked complete.

- [x] **Step 3: Create the worktree from merged `main`**

```bash
git worktree add .worktrees/moo-753 -b codex/moo-753-food-data-access-priority main
```

Expected: the feature branch starts at merge commit `ddf0671`; the primary checkout remains on
`main`.

- [x] **Step 4: Review and commit this implementation plan**

```bash
git add docs/superpowers/plans/2026-08-29-food-data-accessibility-priority.md
git commit -m "docs: plan MOO-753 food equity implementation"
```

Expected: only the reviewed plan is committed.

---

### Task 1: Resolve and approve the complete source and methodology design

**Files:**
- Create: `docs/superpowers/specs/2026-08-29-moo-753-food-equity-design.md`
- Modify: `docs/methodology/food-equity.md`
- Modify: `docs/data/source-registry.md`
- Modify: Linear `MOO-753` comments only after user review

**Interfaces:**
- Consumes: official source documentation/terms, approved Equity Baseline v1, MOO-753 contract.
- Produces: the exact non-executable methodology and source contract implemented by later tasks.

- [x] **Step 1: Resolve exact authoritative artifacts and coverage**

Document exact URL, publisher, release/vintage, geography, fields, license/terms, update cadence,
coverage, and known limitations for:

- USDA ERS 2025 SRAM tract benchmark and reference/technical documentation;
- USDA FNS SNAP retailer location artifact and authorization date/status semantics;
- full-service grocery evidence beyond SNAP authorization, or a documented limitation if a
  complete authoritative local inventory is unavailable;
- Hunger Task Force or other approved structured emergency-food export; do not treat the public
  map page as authorization to scrape;
- official MCTS static GTFS archive and terms;
- one immutable routable walking-network artifact covering Milwaukee County plus a review
  buffer;
- the exact ACS vehicle-access group/variable and vintage aligned with the approved baseline.

Expected: every required input has an approved structured artifact or is explicitly marked
blocked/limited. No authoritative snapshot or database write occurs in this step.

- [x] **Step 2: Freeze resource taxonomy and classification**

Define allowed retail and emergency-resource categories, `full_service_grocery` evidence rules,
SNAP status semantics, ambiguous/unverified handling, duplicate identity, active/freshness rules,
coordinate quality, missing-hours behavior, and manual-verification provenance. Prohibit name-only
classification.

- [x] **Step 3: Freeze accessibility calculations**

Define origins, pedestrian network filters, snap tolerances, path impedance, walk speed if time
is reported, nearest-distance behavior, 10/15/20-minute or approved distance thresholds,
boundary/tie behavior, inaccessible routes, resource categories, GTFS service date and time
window, stop-walk threshold, scheduled frequency formula, and uncertainty/quality states.

- [x] **Step 4: Resolve scoring versus contextual evidence**

For each retail, walking, transit, vehicle, economic, emergency-food, and resource-availability
metric, state whether it is:

1. a Food Access Need scoring input;
2. a displayed contextual metric; or
3. deferred.

Document overlap with Equity Baseline indicators. Public investment is always contextual and
must be absent from the run fingerprint, score components, and Priority calculation.

- [x] **Step 5: Freeze Food Access Need and Priority**

Document exact dimensions, indicator directions, within-dimension weights, dimension weights,
eligible comparison set, minimum completeness, no-redistribution rule, percentile/tie method,
bands, insufficient-data behavior, and every cell of the Equity Baseline × Food Access Need
Priority matrix. Define how a validated-but-unpublished approved Equity Baseline run is pinned in
development.

- [x] **Step 6: Present the load-bearing methodology diff for explicit approval**

Ask:

> Looking at the MOO-753 acceptance criteria, which source, classification, access threshold, or
> Priority-matrix decision would you check first?

Record the response and resolve every in-scope concern. Stop here until Tarik explicitly approves
the full design. Do not create schema, registry, adapters, or scoring code before approval.

Approval recorded: Tarik replied `approve methodology` on 2026-08-29. No in-scope concerns were
raised at the approval gate.

- [x] **Step 7: Commit the approved design**

```bash
git add docs/methodology/food-equity.md docs/data/source-registry.md docs/superpowers/specs/2026-08-29-moo-753-food-equity-design.md
git commit -m "docs(data): approve food equity methodology (MOO-753)"
```

Expected: the commit contains only approved documentation and no implementation dependency,
migration, or source artifact.

---

### Task 2: Add the Plan 3 registry, typed contracts, and shared artifact boundary

**Files:**
- Modify: `pyproject.toml`
- Modify: `uv.lock`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml`
- Modify: `data/README.md`
- Create/modify: `pipelines/common/artifacts.py`, `http.py`, `runner.py`
- Modify: compatibility imports in `pipelines/equity_baseline/**` only if primitives move
- Create: `pipelines/food_equity/__init__.py`, `models.py`, `errors.py`, `quality.py`,
  `registry.py`, `registry.toml`
- Create: `tests/data/food_equity/test_artifacts.py`, `test_registry.py`
- Modify: relevant Plan 2 tests to prove no regression

**Interfaces:**
- Consumes: approved Task 1 design.
- Produces: immutable typed Plan 3 registry, canonical SHA-256, shared secret-safe snapshots.

- [x] **Step 1: Write failing registry and shared-boundary tests**

Assert the exact approved sources, taxonomy, metric definitions, thresholds, directions, weights,
completeness, ties, bands, matrix cells, freshness rules, and contextual/scoring flags. Add
negative cases for duplicate slugs, unknown source/category, invalid weights, discontinuous bands,
incomplete matrix, public-investment input, and a contextual metric referenced by the scorer.

Prove shared snapshot handling preserves Plan 2 paths/manifests and adds an isolated
`data/{raw,manifests,reports}/food-equity/` boundary with identical collision, sanitization, and
atomicity guarantees.

```bash
uv run pytest tests/data/food_equity/test_registry.py tests/data/food_equity/test_artifacts.py -q
```

Expected RED: `pipelines.food_equity` does not exist.

- [x] **Step 2: Pin only approved dependencies**

Add the Task 1 approved GTFS/network packages with exact versions, regenerate `uv.lock`, and
document any required external validator binary/version. Do not add a routing package that
silently downloads or mutates network data at calculation time.

```bash
uv lock
uv sync --locked
```

- [x] **Step 3: Implement typed registry and common primitives**

Use frozen dataclasses, `Decimal`, closed enums, manual validation, and exact registry-byte
hashing. Keep methodology data declarative and non-executable. Preserve compatibility for all
Plan 2 imports and behavior.

- [x] **Step 4: Verify and commit**

```bash
uv run pytest tests/data/equity_baseline tests/data/food_equity/test_registry.py tests/data/food_equity/test_artifacts.py -q
uv run ruff check pipelines tests/data
uv run ruff format --check pipelines tests/data
uv run mypy pipelines
git add pyproject.toml uv.lock .env.example .gitignore .github/workflows/ci.yml data/README.md pipelines tests/data
git commit -m "feat(data): add food equity registry (MOO-753)"
```

Expected: Plan 2 and focused Plan 3 tests pass; no raw data is staged.

---

### Task 3: Add the Plan 3 PostGIS, provenance, and lifecycle schema

**Files:**
- Create: `packages/database/src/schema/food-equity.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/drizzle.config.ts` if required
- Create: generated `packages/database/drizzle/0002_*.sql`
- Modify/create: generated `packages/database/drizzle/meta/**`
- Create: `packages/database/tests/food-equity-schema.test.ts`
- Modify: `packages/database/tests/migration-scope.test.ts`
- Modify: `packages/database/tests/health.integration.test.ts` or add a scoped Plan 3 integration test

**Interfaces:**
- Consumes: approved registry and Plan 2 provenance/geography/run keys.
- Produces: constrained resource, access-metric, Food Access Need, Priority, and run tables.

- [x] **Step 1: Write failing schema and migration-scope tests**

Assert only the approved Plan 3 tables, enum additions, keys, geometry/SRID/GiST constraints,
source-snapshot lineage, resource identity/version rules, access-metric units/quality, unique run
fingerprint, approved Equity Baseline run foreign key, component lineage, output consistency, and
`draft -> validated|failed` lifecycle. Assert publication remains impossible in Plan 3.

```bash
npm test --workspace @mke/database
```

Expected RED: Plan 3 schema/migration is missing.

- [x] **Step 2: Declare schema using the approved Task 1 design**

Prefer new Plan 3 tables rather than widening Plan 2 analytical enums or redefining existing
scores. Reuse `data_sources`, `source_snapshots`, and canonical `geographies` through foreign
keys. Use PostGIS point/network geometry only where the approved design requires persistent
geometry. Every non-null analytical value must have a unit, calculation/registry version, and
usable quality state; missing-quality rows must have null values.

- [x] **Step 3: Generate and review migration**

```bash
npm run db:generate --workspace @mke/database -- --name food_equity
```

Append reviewed custom SQL only for PostGIS/lifecycle constraints Drizzle cannot express. Do not
modify `0000` or `0001` and do not loosen Plan 2 triggers.

- [x] **Step 4: Verify and commit**

```bash
npm test --workspace @mke/database
npm run typecheck --workspace @mke/database
git diff --check
git add packages/database
git commit -m "feat(database): add food equity schema (MOO-753)"
```

---

### Task 4: Ingest and validate the USDA SRAM tract benchmark

**Files:**
- Create: `pipelines/food_equity/sram.py`
- Create: `tests/data/fixtures/food_equity/sram/**`
- Create: `tests/data/food_equity/test_sram.py`

**Interfaces:**
- Consumes: exact approved 2025 SRAM structured artifact and documentation.
- Produces: canonical Milwaukee tract benchmark records with source-defined quality metadata.

- [x] **Step 1: Write failing source-contract tests**

Cover archive/member names, schema/version fingerprint, 2020 tract GEOIDs, Wisconsin/Milwaukee
filtering, required variables, source sentinel/no-data states, duplicate/missing/extra GEOIDs,
numeric ranges, source method labels, deterministic order, and strict distinction between SRAM
benchmark access and locally calculated walking access.

```bash
uv run pytest tests/data/food_equity/test_sram.py -q
```

Expected RED: SRAM adapter is missing.

- [x] **Step 2: Implement bounded fetch and normalization**

Preserve the exact source artifact before transformation. Parse only the approved member/table
and fields, validate documentation/version metadata, reconcile to the 302 canonical tracts, and
return typed sorted records. Keep source sentinel values explicit; never convert them to zero.

- [x] **Step 3: Verify and commit**

```bash
uv run pytest tests/data/food_equity/test_sram.py -q
uv run ruff check pipelines/food_equity/sram.py tests/data/food_equity/test_sram.py
uv run mypy pipelines
git add pipelines/food_equity/sram.py tests/data/fixtures/food_equity/sram tests/data/food_equity/test_sram.py
git commit -m "feat(data): normalize USDA food access benchmark (MOO-753)"
```

---

### Task 5: Ingest SNAP retailers and apply evidence-based retail classification

**Files:**
- Create: `pipelines/food_equity/retail.py`
- Create: `tests/data/fixtures/food_equity/retail/**`
- Create: `tests/data/food_equity/test_retail.py`

**Interfaces:**
- Consumes: approved USDA FNS retailer artifact plus approved classification evidence.
- Produces: source-backed retail records with SNAP and full-service states kept separate.

- [ ] **Step 1: Write failing retail/classification tests**

Cover source schema/version, authorization dates/status, retailer types, coordinates/bounds,
duplicate identity, closed/inactive records, farmers markets/delivery routes, missing location,
ambiguous classification, explicit positive/negative full-service evidence, and input-order
independence. Prove SNAP status alone and retailer name text cannot set
`full_service_grocery=true`.

```bash
uv run pytest tests/data/food_equity/test_retail.py -q
```

Expected RED: retail adapter is missing.

- [ ] **Step 2: Implement deterministic normalization and classification**

Use only approved structured fields and versioned classification tables/rules. Preserve source
record IDs and every decision reason. Records without enough evidence remain
`unverified`/`ambiguous`; they are not silently excluded or promoted.

- [ ] **Step 3: Verify and commit**

```bash
uv run pytest tests/data/food_equity/test_retail.py -q
uv run ruff check pipelines/food_equity/retail.py tests/data/food_equity/test_retail.py
uv run mypy pipelines
git add pipelines/food_equity/retail.py tests/data/fixtures/food_equity/retail tests/data/food_equity/test_retail.py
git commit -m "feat(data): classify food retailers with evidence (MOO-753)"
```

---

### Task 6: Ingest the approved emergency-food inventory

**Files:**
- Create: `pipelines/food_equity/emergency_food.py`
- Create: `tests/data/fixtures/food_equity/emergency_food/**`
- Create: `tests/data/food_equity/test_emergency_food.py`

**Interfaces:**
- Consumes: approved partner export or structured source snapshot.
- Produces: pantry, meal, mobile, and other approved records with verification and hours states.

- [ ] **Step 1: Write failing partner-source tests**

Cover exact schema/version, stable source IDs, allowed categories, coordinates/bounds, duplicate
records, active/verification dates, stale thresholds, hours versus missing hours, eligibility
text, mobile/no-fixed-location handling, and conflicting records. No test may rely on a live page
or scraper.

```bash
uv run pytest tests/data/food_equity/test_emergency_food.py -q
```

Expected RED: emergency-food adapter is missing.

- [ ] **Step 2: Implement source-specific normalization**

Preserve partner fields and terms. Do not geocode, classify, or create hours unless the approved
design names the source and method. Separate operating availability from resource counts.

- [ ] **Step 3: Verify and commit**

```bash
uv run pytest tests/data/food_equity/test_emergency_food.py -q
uv run ruff check pipelines/food_equity/emergency_food.py tests/data/food_equity/test_emergency_food.py
uv run mypy pipelines
git add pipelines/food_equity/emergency_food.py tests/data/fixtures/food_equity/emergency_food tests/data/food_equity/test_emergency_food.py
git commit -m "feat(data): normalize emergency food resources (MOO-753)"
```

---

### Task 7: Ingest and validate official MCTS static GTFS

**Files:**
- Create: `pipelines/food_equity/gtfs.py`
- Create: `tests/data/fixtures/food_equity/gtfs/**`
- Create: `tests/data/food_equity/test_gtfs.py`
- Modify: CI/tooling only for the approved validator

**Interfaces:**
- Consumes: exact MCTS GTFS ZIP and approved analysis service window.
- Produces: validated stops/routes/trips/service calendars and scheduled-frequency summaries.

- [ ] **Step 1: Write failing GTFS contract tests**

Cover required files/columns, feed metadata/version, agency, unique IDs, foreign keys, valid
coordinates, Milwaukee bounds, time values beyond 24:00, calendar/calendar_dates resolution,
route/trip/stop coverage, service window edges, frequency exactness, missing shapes as a quality
state, and deterministic output.

```bash
uv run pytest tests/data/food_equity/test_gtfs.py -q
```

Expected RED: GTFS adapter is missing.

- [ ] **Step 2: Integrate the approved validator and typed normalization**

Run the pinned recognized validator against the preserved ZIP, retain a sanitized report, and
independently enforce the subset of constraints relied on by calculations. Record MCTS feed
update/attribution metadata. Do not implement real-time ingestion or transit travel-time routing.

- [ ] **Step 3: Verify and commit**

```bash
uv run pytest tests/data/food_equity/test_gtfs.py -q
uv run ruff check pipelines/food_equity/gtfs.py tests/data/food_equity/test_gtfs.py
uv run mypy pipelines
git add pipelines/food_equity/gtfs.py tests/data/fixtures/food_equity/gtfs tests/data/food_equity/test_gtfs.py .github/workflows/ci.yml
git commit -m "feat(data): validate MCTS scheduled transit (MOO-753)"
```

---

### Task 8: Build the routable walking network and spatial access engine

**Files:**
- Create: `pipelines/food_equity/walking_network.py`
- Create: `pipelines/food_equity/accessibility.py`
- Create: `tests/data/fixtures/food_equity/network/**`
- Create: `tests/data/food_equity/test_walking_network.py`
- Create: `tests/data/food_equity/test_accessibility.py`

**Interfaces:**
- Consumes: approved network snapshot, canonical tracts/origins, classified resources, GTFS stops.
- Produces: versioned walking/proximity, resource-count, and scheduled-transit metrics.

- [ ] **Step 1: Write failing network and spatial tests**

Use a tiny directed synthetic network to cover pedestrian edge filters, one-way foot rules,
impassable edges, disconnected components, graph snapping tolerance, deterministic shortest
path, equal-distance ties, threshold edges, origin on tract boundary, duplicate resources,
outside-county resources, no qualifying resource, inaccessible stops, and source-coordinate
quality. Add known reviewed Milwaukee fixture routes only after synthetic behavior is exact.

```bash
uv run pytest tests/data/food_equity/test_walking_network.py tests/data/food_equity/test_accessibility.py -q
```

Expected RED: network/accessibility modules are missing.

- [ ] **Step 2: Parse the immutable network snapshot**

Apply only approved pedestrian tags/filters and projected distance CRS. Store or hash the
normalized graph deterministically. Never fetch network edges during a route calculation.

- [ ] **Step 3: Implement versioned access metrics**

Calculate approved nearest paths, threshold counts, and stop/frequency metrics with explicit
origins, categories, units, threshold definitions, contributing resource IDs, and quality states.
Use PostGIS for containment/intersection/reconciliation and Python for graph routing. Keep
straight-line diagnostics separate from official network outputs.

- [ ] **Step 4: Verify and commit**

```bash
uv run pytest tests/data/food_equity/test_walking_network.py tests/data/food_equity/test_accessibility.py -q
uv run ruff check pipelines/food_equity tests/data/food_equity
uv run ruff format --check pipelines/food_equity tests/data/food_equity
uv run mypy pipelines
git add pipelines/food_equity/walking_network.py pipelines/food_equity/accessibility.py tests/data/fixtures/food_equity/network tests/data/food_equity/test_walking_network.py tests/data/food_equity/test_accessibility.py
git commit -m "feat(data): calculate walking and transit access (MOO-753)"
```

---

### Task 9: Normalize vehicle access and other approved tract inputs

**Files:**
- Create: `pipelines/food_equity/vehicle_access.py`
- Create: `tests/data/fixtures/food_equity/vehicle_access/**`
- Create: `tests/data/food_equity/test_vehicle_access.py`

**Interfaces:**
- Consumes: exact approved ACS group/variables and 302 canonical tract GEOIDs.
- Produces: source-backed tract observations with MOE and reliability state.

- [ ] **Step 1: Write failing formula/source tests**

Cover exact headers/variables/vintage, formula and denominator, ACS annotations/jam values,
MOE propagation, CV thresholds, missing/nonpositive denominators, numeric bounds, duplicate/
missing/extra GEOIDs, and no missing-to-zero behavior. If Task 1 approves another economic
input, add its exact formula and double-weighting tests here.

```bash
uv run pytest tests/data/food_equity/test_vehicle_access.py -q
```

Expected RED: vehicle-access adapter is missing.

- [ ] **Step 2: Implement bounded ACS normalization**

Reuse the Plan 2 credential-safe Census request/snapshot boundary without modifying its approved
registry or output. Return one explicit observation per canonical tract.

- [ ] **Step 3: Verify and commit**

```bash
uv run pytest tests/data/food_equity/test_vehicle_access.py -q
uv run ruff check pipelines/food_equity/vehicle_access.py tests/data/food_equity/test_vehicle_access.py
uv run mypy pipelines
git add pipelines/food_equity/vehicle_access.py tests/data/fixtures/food_equity/vehicle_access tests/data/food_equity/test_vehicle_access.py
git commit -m "feat(data): normalize vehicle access constraints (MOO-753)"
```

---

### Task 10: Implement Food Access Need and Priority scoring with golden traces

**Files:**
- Create: `pipelines/food_equity/scoring.py`
- Create: `tests/data/fixtures/food_equity/golden/input.json`
- Create: `tests/data/fixtures/food_equity/golden/expected.json`
- Create: `tests/data/food_equity/test_scoring.py`

**Interfaces:**
- Consumes: approved scoring metrics, canonical eligibility, approved Equity Baseline score/band.
- Produces: components, dimensions, Food Access Need score/band, Priority, exclusions, output hash.

- [ ] **Step 1: Write scoring tests before implementation**

Test exact direction normalization, average-rank or approved tie behavior, all-equal/singleton
cases, completeness, no weight redistribution, dimension aggregation, fixed bands, every
Priority-matrix cell, tied scores, insufficient data, and deterministic canonical output.
Use Hypothesis for 0–100 bounds, monotonicity, permutation invariance, and equal-value equality.
Prove adding/changing/removing `public_investments` or contextual service records cannot change
any component, run fingerprint, Food Access Need, or Priority.

```bash
uv run pytest tests/data/food_equity/test_scoring.py -q
```

Expected RED: scorer is missing.

- [ ] **Step 2: Implement the pure deterministic scorer**

Use `Decimal` source values and exact rational intermediates where ranks/weights require them.
Quantize only at the persistence boundary. Sort by GEOID and registry order; hash canonical JSON
without timestamps or database ordering. Resolve the approved Equity Baseline by pinned run ID,
not by “latest” or browser state.

- [ ] **Step 3: Review and freeze golden traces**

Manually trace retail/access inputs, metric percentiles, dimensions, Food Access Need, Equity
Baseline matrix lookup, final Priority, and exclusions for complete, tied, missing, stale,
zero-population, and disconnected-network fixtures.

- [ ] **Step 4: Verify and commit**

```bash
uv run pytest tests/data/food_equity/test_scoring.py -q
uv run ruff check pipelines/food_equity/scoring.py tests/data/food_equity/test_scoring.py
uv run mypy pipelines
git add pipelines/food_equity/scoring.py tests/data/fixtures/food_equity/golden tests/data/food_equity/test_scoring.py
git commit -m "feat(data): score deterministic food equity priority (MOO-753)"
```

---

### Task 11: Add transactional persistence, runner, lifecycle, and CLI

**Files:**
- Create: `pipelines/food_equity/database.py`, `write_plan.py`, `runner.py`, `live.py`, `cli.py`,
  `__main__.py`
- Create: `tests/data/food_equity/test_runner.py`, `test_cli.py`,
  `test_database_integration.py`

**Interfaces:**
- Consumes: pinned snapshots, normalized resources/metrics, scoring output,
  `DATABASE_URL_UNPOOLED`, and `MKE_PIPELINE_ENV=development`.
- Produces: idempotent records, `draft -> validated|failed`, redacted reports, no publication.

- [ ] **Step 1: Write failing repository/runner/CLI tests**

Cover exact stage order, stage-only execution, read-only stages without database configuration,
development-only writes, approved Equity Baseline run resolution, one transaction, rollback,
redacted failure, draft-to-failed, same-fingerprint reuse, output-hash verification, no partial or
duplicate records, and absence of publish/status-mutation commands.

```bash
uv run pytest tests/data/food_equity/test_runner.py tests/data/food_equity/test_cli.py -q
```

Expected RED: persistence/orchestration modules are missing.

- [ ] **Step 2: Implement parameterized transactional persistence**

Insert/reuse sources and snapshots, resources, access/value records, then run/components/scores in
deterministic order. Use Psycopg parameter binding and one analytical transaction. On failure,
roll back all partial writes; a separate transaction may mark an existing draft failed with
redacted metadata.

- [ ] **Step 3: Expose the closed Plan 3 CLI**

```text
python -m pipelines.food_equity fetch
python -m pipelines.food_equity validate
python -m pipelines.food_equity normalize
python -m pipelines.food_equity classify
python -m pipelines.food_equity accessibility
python -m pipelines.food_equity load
python -m pipelines.food_equity score
python -m pipelines.food_equity validate-run
python -m pipelines.food_equity run --through validated --verify-existing
```

Every invocation writes a secret-free report under `data/reports/food-equity/`. Do not expose
`publish` or production lifecycle transitions.

- [ ] **Step 4: Add opt-in integration tests**

Against a disposable migrated development branch, verify resource/source foreign keys,
geometry/SRID, missing-quality consistency, approved Equity Baseline reference, component
lineage, orphan prevention, transaction rollback, lifecycle trigger, idempotency, and output-hash
comparison. Skip safely when environment variables are absent and never print them.

- [ ] **Step 5: Verify and commit**

```bash
uv run pytest tests/data/food_equity/test_runner.py tests/data/food_equity/test_cli.py -q
uv run ruff check pipelines tests/data
uv run ruff format --check pipelines tests/data
uv run mypy pipelines
git add pipelines/food_equity tests/data/food_equity
git commit -m "feat(data): orchestrate validated food equity runs (MOO-753)"
```

---

### Task 12: Complete offline verification and operational documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/repository.md`
- Modify: `docs/data/ingestion.md`, `schema.md`, `source-registry.md`, `data-quality.md`
- Modify: `docs/development/database.md`
- Create: `docs/verification/plan-3-food-data-accessibility-priority.md`

**Interfaces:**
- Consumes: implemented commands, schema, fixtures, and failure behavior.
- Produces: reproducible operations and a real-data verification template.

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

Expected: every offline check passes; integration tests are excluded; fixtures require no live
network or database.

- [ ] **Step 2: Document exact operation and recovery**

Record prerequisites, non-secret environment names, stage commands, artifact boundaries,
licenses/attribution, methodology/registry versions, quality states, classification evidence,
network/GTFS limits, run identity, rollback, and failure recovery. Do not duplicate formulas
in multiple drifting documents.

- [ ] **Step 3: Commit checkpoint**

```bash
git add README.md docs .github/workflows/ci.yml
git commit -m "docs(data): document food equity operations (MOO-753)"
```

---

### Task 13: Create the expiring Neon branch and run authoritative sources

**Files:**
- Local ignored: `.neon`, `.env.local`, `data/raw/**`, `data/normalized/**`, `data/reports/**`
- Create: `data/manifests/food-equity/**`
- Modify: `docs/verification/plan-3-food-data-accessibility-priority.md`

**Interfaces:**
- Consumes: personal project, approved Plan 2 data branch/run, official/partner artifacts,
  Census key when required.
- Produces: isolated migrated database, immutable manifests, one validated Plan 3 run, evidence.

- [ ] **Step 1: Confirm external identity and request live-write approval**

Verify the personal Neon project, non-default parent containing the approved Equity Baseline,
target name `moo-753-food-equity`, seven-day TTL, database/role, and development-only state.
Confirm required keys exist without printing them. Do not use an unrelated loaded connector.

- [ ] **Step 2: Create/check out the branch through repository policy**

```bash
neon checkout moo-753-food-equity --parent <approved-plan-2-branch>
neon branches list --output json
```

Inspect sanitized identity only. Record branch/project IDs, parent, expiry, database, role, and
development-only status without any connection string.

- [ ] **Step 3: Apply and independently verify migrations**

```bash
npm run db:migrate --workspace @mke/database
npm run test:integration --workspace @mke/database
uv run pytest tests/data/food_equity/test_database_integration.py -q -m integration
```

Independently query PostGIS, Plan 2/3 tables, constraints/indexes, lifecycle trigger, approved
Equity Baseline run, and zero published Plan 3 runs. Never place a database URL in commands or
evidence.

- [ ] **Step 4: Execute attributable live stages**

Run each stage separately before the complete runner:

```bash
uv run python -m pipelines.food_equity fetch
uv run python -m pipelines.food_equity validate
uv run python -m pipelines.food_equity normalize
uv run python -m pipelines.food_equity classify
uv run python -m pipelines.food_equity accessibility
uv run python -m pipelines.food_equity load
uv run python -m pipelines.food_equity score
uv run python -m pipelines.food_equity validate-run
```

Expected: every source and calculation is attributable; failures stop without partial writes;
one run reaches `validated`; no run is published.

- [ ] **Step 5: Prove repeatability and idempotency**

```bash
uv run python -m pipelines.food_equity run --through validated --verify-existing
```

Expected: identical input/run/output hashes, same run ID, no duplicate source/resource/metric/
component/score rows, and unchanged validated state.

- [ ] **Step 6: Reconcile real data and manually trace selected tracts**

Record source hashes/counts/coverage/limitations; retail type and classification counts;
ambiguous/unverified records; emergency-resource type/freshness/hours states; GTFS validator and
route/stop/trip/service counts; network topology/disconnected/snap states; access metric ranges;
302-tract reconciliation; missing/insufficient states; complete Food Access Need/Priority/band
counts; all orphan counts; approved Equity Baseline linkage; registry/input/output hashes; Git
commit; and zero publication states.

Manually trace reviewed high-, middle-, low-, and insufficient-data tracts from raw records
through classification/access metrics, Food Access Need, Equity Baseline matrix cell, and final
Priority. Include uncertainty and contextual services without implying causation or a funding
recommendation.

- [ ] **Step 7: Commit sanitized manifests and evidence**

```bash
git add data/manifests/food-equity docs/verification/plan-3-food-data-accessibility-priority.md
git commit -m "test(data): verify Milwaukee food equity run (MOO-753)"
```

Expected: no raw/normalized/report file, validator temp output, partner-restricted file,
credential, database URL, or absolute local path is staged.

---

### Task 14: Load-bearing review, CI/PR proof, and Linear closure

**Files:**
- Modify: verification evidence only if final proof is missing
- Modify: Linear `MOO-753` comments/checklists/status after proof passes

**Interfaces:**
- Consumes: complete diff, real model, authoritative run, local checks, remote CI.
- Produces: reviewed PR/evidence and auditable Linear closure.

- [ ] **Step 1: Run the final clean-worktree gate**

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

Expected: every command passes and the worktree is clean. Repeat live integration only while the
approved Neon branch exists.

- [ ] **Step 2: Ask the final load-bearing review question**

Show the user source/classification limitations, model/schema, tract traces, run status, and key
diff. Ask:

> Looking at MOO-753's acceptance criteria, what would you check first in this resource model,
> access calculation, or validated Priority run?

Add any missing in-scope verification before completion.

- [ ] **Step 3: Push branch and open/update PR**

Push `codex/moo-753-food-data-access-priority`, link MOO-753, list exact verification, disclose
data limitations, and state that the run is validated but unpublished. Wait for every required
CI/review check and record URLs.

- [ ] **Step 4: Audit scope, privacy, and publication safeguards**

Confirm no UI/Plan 4 feature, AI dependency/prompt, browser analytics, production target,
publish command, name-only grocery classification, missing-to-zero conversion, public-investment
input, secret, restricted partner artifact, or unlicensed raw data entered the diff. Confirm the
public application still reads only published runs and therefore exposes no new Plan 3 result.

- [ ] **Step 5: Close with proof**

Check every MOO-753 acceptance/verification item, post concise source/classification/spatial/
scoring/provenance/reproducibility/limitation evidence, record the merged PR and CI URLs, and move
MOO-753 to Done only after merge. Leave MOO-754 as the next Plan 4 issue; do not start it
automatically.
