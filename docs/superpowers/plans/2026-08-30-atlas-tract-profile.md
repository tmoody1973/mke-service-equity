# Plan 4 — Food Equity Atlas and Tract Profile Implementation Plan

> **Execution rule:** Implement one task at a time in the MOO-754 worktree. Stop after Task 1
> until Tarik approves this plan and the companion design. Use real validated data only through
> the approved local preview boundary; never make it public by implication.

**Goal:** Build a responsive, accessible Food Equity Atlas and Tract Profile that renders every
canonical Milwaukee County tract, explains the approved Food Equity result with complete data
quality and provenance, and safely separates local validated preview from governed public data.

**Architecture:** Server-only TypeScript selects an allowed run, performs exact Drizzle/PostGIS
joins, prepares bounded GeoJSON and profile contracts, and validates all outbound data with Zod.
Next.js server boundaries deliver presentation-ready data. A focused client workspace coordinates
URL state, HeroUI/HeroUI Pro controls, and one MapLibre map instance. MapLibre visualizes and
selects geography only; PostGIS/Python remain authoritative for analytical and spatial results.

**Tech stack:** Existing Next.js 16.3.3, React 19.2.8, TypeScript 6.0.3, HeroUI 3.2.4, HeroUI Pro
1.0.0-beta.8, MapLibre GL JS 6.6.0, Drizzle ORM 0.45.2, PostgreSQL/PostGIS, Zod through the
contracts package, Vitest 4.1.11, Testing Library, Playwright 1.62.1, and axe-core.

**Design:** `docs/superpowers/specs/2026-08-30-moo-754-atlas-tract-profile-design.md`

**Tracking:** Linear `MOO-754` — Plan 4 — Food Equity Atlas + Tract Profile. Linear `MOO-768`
owns the governed Food publication lifecycle and blocks Gate 3, not local MOO-754 implementation.

**Plan status:** Approved by Tarik on 2026-08-30. Task 1 is complete and Phase A may begin.

## Fixed execution decisions

1. Work only in `.worktrees/moo-754` on `codex/moo-754-atlas-tract-profile`.
2. Public mode returns only a governed published bundle. Until MOO-768 supplies it, public mode
   returns `no_published_run`.
3. Local preview requires explicit server-only development configuration and one exact validated
   Food run ID. It is always visibly labeled and never cached publicly.
4. Start canonical geography-first so insufficient and zero-population tracts remain visible.
5. Do not query "latest" score, resource version, or snapshot.
6. Do not add analytical or containment calculations to the browser.
7. Keep direct MapLibre primitives for arbitrary tract polygon sources/layers; use HeroUI Pro for
   the surrounding workspace and documented interaction primitives.
8. Do not ship address or neighborhood search until authority, terms, attribution, and server-side
   containment are proven.
9. Do not ship a public resource layer until its exact lineage and redistribution terms are
   proven. Missing approval is an unavailable state, not an empty dataset.
10. Commit each independently reviewable task with `MOO-754` in the message. Do not mark the issue
    Done until PR merge, verification evidence, responsive/accessibility review, and a
    load-bearing user review pass.

## Planned file map

- Contracts: `packages/contracts/src/atlas/**`, exports, and contract tests.
- Database: `packages/database/src/atlas/**`, server exports, and unit/integration tests.
- Route/server boundary: `apps/web/app/page.tsx`, `apps/web/app/tract/[geoid]/route.ts` or an
  equivalent reviewed server endpoint, plus cache/error boundaries.
- Workspace: `apps/web/features/atlas/**` for layout, state, legend, tract list, profile,
  explanation, search, and state views.
- Map: focused files under `apps/web/features/map/**` for tract source/layers, selection, and
  camera helpers; retain one map lifecycle.
- Styles/tokens: `apps/web/app/globals.css` and `packages/design-system/**` only for approved
  semantic map states not already represented.
- E2E: `tests/e2e/atlas*.spec.ts` and reviewed fixtures/mocks that never masquerade as live data.
- Docs: README, architecture/repository, schema, data quality, UX, and
  `docs/verification/plan-4-food-equity-atlas.md` where actual behavior changes.

---

### Task 0: Confirm contract, amendment, and isolated workspace

**Files:** Linear MOO-754/MOO-768, this plan, companion design.

- [x] Merge Plan 3 PR #3 into `main` and move MOO-753 to Done.
- [x] Expand and approve the complete MOO-754 issue contract; move it to In Progress.
- [x] Create `.worktrees/moo-754` from merged `main`.
- [x] Record preview-first amendment and create MOO-768 for governed Food publication.
- [x] Audit existing frontend, database joins, publication dependency, HeroUI components, and
  MapLibre source/layer lifecycle.

### Task 1: Approve the Atlas design and executable plan

**Files:**
- Create: `docs/superpowers/specs/2026-08-30-moo-754-atlas-tract-profile-design.md`
- Create: `docs/superpowers/plans/2026-08-30-atlas-tract-profile.md`
- Update after approval: Linear MOO-754 comment/evidence only

- [x] Review the lifecycle, presentation contract, layout, first visible slice, search/resource
  deferrals, and verification boundary with Tarik.
- [x] Record explicit approval in both documents and Linear.
- [x] Commit only the approved design and plan.

```bash
git add docs/superpowers/specs/2026-08-30-moo-754-atlas-tract-profile-design.md \
  docs/superpowers/plans/2026-08-30-atlas-tract-profile.md
git commit -m "docs: approve MOO-754 atlas design and plan"
```

**Stop gate:** No Task 2 implementation before approval.

---

## Phase A — First visible Atlas slice

### Task 2: Define browser-safe Atlas contracts first

**Files:**
- Create: `packages/contracts/src/atlas/run.ts`
- Create: `packages/contracts/src/atlas/tract.ts`
- Create: `packages/contracts/src/atlas/profile.ts`
- Create: `packages/contracts/src/atlas/index.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/tests/atlas*.test.ts`

- [ ] Write failing tests for the available/unavailable discriminated union.
- [ ] Test priority 1–5 versus `null`, complete/insufficient/zero-population quality, and explicit
  missing-value states.
- [ ] Test GeoJSON `MultiPolygon` and stable feature `id=GEOID`.
- [ ] Test that raw storage URIs, credentials, and operational validation payloads are rejected.
- [ ] Implement the smallest Zod schemas/types that satisfy the tests.
- [ ] Export public contracts from `@mke/contracts`.

```bash
npm test --workspace @mke/contracts
npm run typecheck --workspace @mke/contracts
git commit -am "feat: define MOO-754 atlas presentation contracts"
```

### Task 3: Implement fail-closed run selection

**Files:**
- Create: `packages/database/src/atlas/data-mode.ts`
- Create: `packages/database/src/atlas/run-selector.ts`
- Modify: `packages/database/src/server.ts`
- Create: `packages/database/tests/atlas-data-mode.test.ts`
- Create: `packages/database/tests/atlas-run-selector.integration.test.ts`
- Modify: `.env.example`

- [ ] Write failing table tests for public, preview, production, missing UUID, wrong status, missing
  pinned baseline, and unexpected environment combinations.
- [ ] Parse `MKE_ATLAS_DATA_MODE` and `MKE_ATLAS_PREVIEW_RUN_ID` in a server-only module.
- [ ] Reject preview in production/Vercel production and never fall back to another run.
- [ ] Select the exact validated Food run and validate its pinned baseline/hashes.
- [ ] Keep the public selector behind a publication repository interface that returns unavailable
  until MOO-768 supplies a governed bundle; do not fake an enum literal or latest-row query.
- [ ] Redact environment values and connection details from errors.

```bash
npm test --workspace @mke/database -- atlas-data-mode atlas-run-selector
git add .env.example packages/database
git commit -m "feat: add fail-closed MOO-754 run selection"
```

### Task 4: Build the canonical tract Atlas repository

**Files:**
- Create: `packages/database/src/atlas/atlas-repository.ts`
- Create: `packages/database/src/atlas/geometry.ts`
- Create: `packages/database/tests/atlas-repository.integration.test.ts`
- Create: `packages/database/tests/atlas-geometry.test.ts`
- Modify: `packages/database/src/server.ts`

- [ ] Write failing integration tests that start from all canonical Milwaukee County tracts and
  preserve exact feature count, GEOID, insufficient data, and zero-population rows.
- [ ] Test exact Food run, Food score, geography, pinned baseline run, and baseline score joins.
- [ ] Test duplicate/missing pinned rows fail the entire contract instead of dropping geography.
- [ ] Select explicit columns only and convert PostGIS geometry to valid EPSG:4326 GeoJSON.
- [ ] Measure raw geometry/payload before deciding on simplification.
- [ ] If required, add tested server-side `ST_SimplifyPreserveTopology` with documented tolerance;
  keep analytical/containment queries on canonical geometry.
- [ ] Validate repository output with `@mke/contracts` before returning it.

```bash
npm test --workspace @mke/database -- atlas-repository atlas-geometry
git add packages/database
git commit -m "feat: query MOO-754 canonical tract atlas data"
```

### Task 5: Add a cache-safe server delivery boundary

**Files:**
- Create: `apps/web/features/atlas/server/load-atlas.ts`
- Create: `apps/web/features/atlas/server/load-atlas.test.ts`
- Modify: `apps/web/app/page.tsx`
- Create or modify: `apps/web/app/loading.tsx`, `apps/web/app/error.tsx`

- [ ] Write tests for available, no-published-run, invalid-preview, contract-failure, and database
  failure states.
- [ ] Load public data only through immutable publication identity; keep preview dynamic and out of
  shared public caching.
- [ ] Deliver safe user copy and structured server diagnostics.
- [ ] Ensure no database package client is included in a client bundle.

```bash
npm test --workspace @mke/web -- load-atlas
npm run build --workspace @mke/web
git add apps/web
git commit -m "feat: deliver MOO-754 atlas data safely"
```

### Task 6: Implement durable Atlas URL and workspace state

**Files:**
- Create: `apps/web/features/atlas/atlas-url-state.ts`
- Create: `apps/web/features/atlas/atlas-url-state.test.ts`
- Create: `apps/web/features/atlas/atlas-workspace.tsx`
- Create: `apps/web/features/atlas/atlas-workspace.test.tsx`
- Modify: `apps/web/features/map/map-shell.tsx`

- [ ] Write tests for valid/invalid `tract`, `layer`, and supported filter values.
- [ ] Make URL state the durable source for selection and active layer.
- [ ] Preserve back/forward navigation and reloadable tract links.
- [ ] Keep transient hover, panel, and viewport state local.
- [ ] Render an explicit validated-preview banner before any map work.

```bash
npm test --workspace @mke/web -- atlas-url-state atlas-workspace
git add apps/web/features
git commit -m "feat: coordinate MOO-754 atlas workspace state"
```

### Task 7: Render and select canonical tract polygons

**Files:**
- Modify: `apps/web/features/map/map-canvas.tsx`
- Create: `apps/web/features/map/tract-layers.ts`
- Create: `apps/web/features/map/tract-layers.test.ts`
- Create: `apps/web/features/map/map-camera.ts`
- Create: `apps/web/features/map/map-camera.test.ts`
- Modify: `apps/web/features/map/map-config.ts`

- [ ] Write tests for fill/line expressions for priorities 1–5, insufficient data, zero population,
  hover, and selected outline.
- [ ] Add GeoJSON source and layers only after map style load; update data without recreating map.
- [ ] Use feature state keyed by GEOID for hover/selection and clear old state safely.
- [ ] Implement pointer, keyboard-adjacent list selection, touch activation, cursor, resize, reset
  extent, and complete cleanup.
- [ ] Retain production basemap configuration and required attribution; do not add unapproved tiles.

```bash
npm test --workspace @mke/web -- map-canvas tract-layers map-camera
git add apps/web/features/map
git commit -m "feat: render MOO-754 tract priority map"
```

### Task 8: Add legend, non-map tract list, and compact summary

**Files:**
- Create: `apps/web/features/atlas/priority-legend.tsx`
- Create: `apps/web/features/atlas/tract-list.tsx`
- Create: `apps/web/features/atlas/tract-summary.tsx`
- Create: corresponding component tests

- [ ] Use documented HeroUI primitives and semantic list/button markup.
- [ ] Label every priority and quality state in text; do not rely on color.
- [ ] Coordinate map, list, URL, and summary selection without duplicate state.
- [ ] Keep zero population, unavailable, and insufficient data explanations distinct.
- [ ] Announce the selected tract appropriately without noisy hover announcements.

```bash
npm test --workspace @mke/web -- priority-legend tract-list tract-summary
git add apps/web/features/atlas
git commit -m "feat: add accessible MOO-754 tract selection"
```

### Task 9: Build the responsive first-slice workspace

**Files:**
- Create: `apps/web/features/atlas/explore-panel.tsx`
- Create: `apps/web/features/atlas/tract-profile-container.tsx`
- Modify: `apps/web/features/atlas/atlas-workspace.tsx`
- Modify: `apps/web/app/globals.css`
- Create: responsive component/E2E tests

- [x] Fetch current Sheet/Resizable/EmptyState HeroUI Pro docs before using their APIs.
- [x] Implement wide Explore/map/profile layout and compact 1024 px behavior.
- [x] Implement tablet/mobile map-first layout with accessible bottom sheet.
- [x] Preserve one shared summary content component across panel and sheet.
- [x] Handle loading, unavailable, invalid selection, and error views without fake values.
- [x] Verify map resize and focus behavior across every panel/sheet transition.

```bash
npm test --workspace @mke/web -- atlas-workspace tract-profile-container
npm run test:e2e -- --grep "Atlas first slice"
git add apps/web
git commit -m "feat: complete MOO-754 first visible atlas slice"
```

### Task 10: Verify the first visible slice against isolated Neon

**Files:**
- Create/update: `docs/verification/plan-4-food-equity-atlas.md`

- [x] Use local server-only preview variables with run
  `97bd1cdf-bf96-573f-8fcf-92e8676925d4`; never commit the database URL or Census key.
- [x] Record run/methodology ID, canonical tract count, priority/quality counts, payload bytes,
  geometry validity, and several GEOID score traces.
- [x] Confirm public mode returns `no_published_run` and response/browser bundles contain no
  validated run data.
- [x] Review screenshots at 375, 430, 768, 1024, and 1440 px.
- [x] Run keyboard, touch-target, reduced-motion, forced-colors, and axe checks.
- [ ] Obtain Tarik's review of the real first slice before Phase B.

```bash
npm run verify
npm run test:e2e -- --grep "Atlas"
git add docs/verification/plan-4-food-equity-atlas.md
git commit -m "test: verify MOO-754 first atlas slice"
```

---

## Phase B — Complete Tract Profile

### Task 11: Query exact Food and Equity evidence

**Files:** `packages/database/src/atlas/profile-repository.ts`, tests, contract refinements.

- [ ] Write integration tests for exact component/value/snapshot/source joins for both scoring
  systems, including contribution, direction, state, unit, and quality.
- [ ] Prove profile run and geography match the selected Atlas bundle.
- [ ] Preserve missing/suppressed/conflicting states and reject duplicate lineage.
- [ ] Return source-backed nearest-resource facts only when pinned by the scored metric.

### Task 12: Render deterministic full profile and provenance

**Files:** `apps/web/features/atlas/profile/**`, explanation helpers, tests.

- [ ] Build summary, Why this result, Food evidence, Community context, Data quality, and
  Provenance sections.
- [ ] Test approved plain-language explanation templates and contribution labels.
- [ ] Clearly separate score inputs from context and avoid causal/policy claims.
- [ ] Include source/methodology/version/validity limitations without dumping internal metadata.
- [ ] Reuse content across wide panel and mobile sheet.

---

## Phase C — Search and approved contextual layers

### Task 13: Implement authoritative tract/ZIP/municipality search

**Files:** server search repository/route, SearchField UI, tests, documentation.

- [ ] Query current documentation for any new provider/library before implementation.
- [ ] Build exact/prefix tract GEOID, tract label, authoritative ZIP, and municipality results.
- [ ] Resolve every result to canonical tract GEOIDs server-side.
- [ ] Add accessible SearchField keyboard behavior, no-result state, and URL selection.

### Task 14: Decide and implement address/neighborhood authority

- [ ] Document candidate provider terms, privacy, limits, attribution, production suitability, and
  failure behavior; obtain approval before sending user queries externally.
- [ ] Use PostGIS containment for an approved geocoded point.
- [ ] Enable neighborhood search only with an approved reliable boundary/name source.
- [ ] If unresolved, retain transparent unavailable copy and close the task without guessing.

### Task 15: Audit and add only approved contextual resource layers

- [ ] Prove exact source snapshot, run relationship, public redistribution permission, dates,
  attribution, and quality for each proposed layer.
- [ ] Keep contextual resources visually and semantically separate from score inputs.
- [ ] Never show unverified/stale resources as current verified service locations.
- [ ] If MOO-768 schema is required for deterministic pinning, document dependency and leave the
  layer unavailable until it is merged.

---

## Phase D — Completion and handoff

### Task 16: Responsive, accessibility, design, and performance hardening

- [ ] Run component/E2E tests at all required widths and across all data states.
- [ ] Complete keyboard-only, screen-reader-oriented, focus, forced-colors, reduced-motion,
  contrast, and 44 px target review.
- [ ] Measure Atlas/profile payloads, map interaction, initial render, and bundle impact; document
  thresholds and fixes.
- [ ] Complete HeroUI/MapLibre visual review against the approved civic evidence design.

### Task 17: Documentation and operational verification

- [ ] Update README, architecture/repository, schema/data quality, UX, environment, and source
  documentation to match implemented behavior.
- [ ] Prove public fail-closed behavior on a production-equivalent build.
- [ ] Re-run isolated Neon traces without mutating or publishing the validated run.
- [ ] Run `npm run verify` and full Playwright suite; attach concise evidence to MOO-754.

### Task 18: Load-bearing review, PR, and merge

- [ ] Ask a question that can materially change the outcome: whether the real Atlas explains a
  selected tract clearly enough and whether map/list/mobile behavior supports the intended task.
- [ ] Address review findings or amend the approved contract explicitly.
- [ ] Review the branch diff for accidental methodology, publication, data, or out-of-scope work.
- [ ] Push branch, open PR with verification/preview evidence, wait for CI/review, and merge only
  after approval.
- [ ] Move MOO-754 to Done only after merge; keep MOO-768 governed separately.

## Final verification matrix

| Contract | Required proof |
|---|---|
| Public published-only | Production-equivalent test and Vercel preview show no validated/draft/failed score data. |
| Local validated preview | Exact explicit run, visible banner, no shared cache, no client env leak. |
| Canonical geography | Expected tract count, stable GEOIDs, valid geometry, all quality states retained. |
| Exact analytical lineage | Selected Food run, pinned baseline, components, source snapshots, and hashes trace. |
| Map interaction | Pan/zoom/reset, pointer/touch, map/list selection, selected outline, URL reload. |
| Profile | Summary, drivers, access evidence, context separation, quality, and provenance. |
| Search | Authoritative result source, server containment, terms/attribution, accessible no-result state. |
| Resource layers | Explicit approval, deterministic snapshot/run pin, redistribution terms, quality labels. |
| Responsive | 375, 430, 768, 1024, 1440 px screenshots and interaction flows. |
| Accessibility | Keyboard, focus, semantics, text alternatives to color, sheet behavior, axe, reduced motion. |
| Performance | Payload and bundle measurements, stable map instance, bounded geometry, cache evidence. |
| Completion | Full CI, documentation, load-bearing user review, PR merge, Linear evidence. |
