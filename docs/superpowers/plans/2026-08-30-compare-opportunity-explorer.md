# Plan 5 — Compare Areas and Opportunity Explorer Implementation Plan

> **Execution rule:** Implement one task at a time in the MOO-756 worktree. Task 1 is a protected
> human-approval gate: stop there until Tarik approves this executable plan and its companion
> design. Use real validated data only through the existing guarded local-preview boundary. A web
> deployment must never imply that an unpublished score run is public.

**Goal:** Add two focused, responsive analysis workflows that let people compare 2–5 census
tracts and find tracts matching explicit planning conditions without changing scores, inventing a
ranking, or presenting results as recommendations.

**Architecture:** Separate `/analyze/compare` and `/analyze/opportunity` Next.js routes reuse the existing
fail-closed Atlas run selector. Strict Zod contracts validate normalized URL state and every
server response. Bounded Drizzle/SQL repositories load comparison evidence and apply Opportunity
filters against one exact Food Equity run and its pinned Equity Baseline run. The browser owns
draft form state, navigation, accessible presentation, and MapLibre highlighting only. It does
not calculate scores, filter analytical rows, aggregate population, or perform GIS analysis.

**Tech stack:** Existing Next.js 16.3.3 App Router, React 19.2.8, TypeScript 6.0.3, HeroUI 3.2.4,
HeroUI Pro 1.0.0-beta.8, MapLibre GL JS 6.6.0, Drizzle ORM 0.45.2, PostgreSQL/PostGIS, Zod 4.4.3,
Vitest 4.1.11, Testing Library, Playwright 1.62.1, and axe-core.

**Design:** `docs/superpowers/specs/2026-08-30-moo-756-compare-opportunity-design.md`

**Tracking:** Linear `MOO-756` — Plan 5 — Compare + Opportunity Explorer. Governed Food Equity
publication remains separate under `MOO-768`; this plan may not publish or mutate a score run.

**Plan status:** Approved by Tarik on 2026-08-30 with the explicit instruction “Approve MOO-756
design and plan.” Task 1 is complete and implementation may begin.

## Fixed execution decisions

1. Work only in `.worktrees/moo-756` on `codex/moo-756-compare-opportunity-explorer`.
2. Add separate `/analyze/compare` and `/analyze/opportunity` routes under an **Analyze** navigation group; do not
   turn the Atlas into a three-mode workspace.
3. Public mode reads only a governed published bundle. Until MOO-768 supplies one, Atlas, Compare,
   and Opportunity all return the same plain-language `no_published_run` state.
4. Local preview requires the exact, server-only validated run configuration already enforced by
   `selectAtlasRun`. Preview pages remain visibly labeled, private, dynamic, and uncached.
5. Compare accepts 2–5 unique canonical tract GEOIDs for an analytical response. A one-tract URL
   is a valid setup state so **Compare this tract** can hand off from the profile.
6. Compare is summary-first: population, Priority, Equity Baseline, Food Access Need, and the four
   Food Access measures appear first; the 13 Equity Baseline indicators are expandable.
7. Differences are deterministic. Include differing Priority/band labels and indicator gaps of at
   least 20 county-percentile points, show at most five items, use a documented stable tie-break,
   surface uncertainty, and never call a tract better, worse, or recommended.
8. Opportunity v1 filters only exact-run verified score evidence: Priority, Equity Baseline
   band/percentile, Food Access Need band/percentile, no-vehicle share, SNAP retailer low-access
   share, grocery walking time, and scheduled transit service. Food-site availability, public land,
   and other context are not analytical filters in this plan.
9. Multiple selected values within a categorical filter use OR. Active filter categories combine
   with AND. Numeric thresholds are inclusive. Missing, suppressed, or conflicting values never
   become zero and are reported as exclusions.
10. Opportunity has separate draft and applied filter state. Only **Apply filters** changes the
    URL and results. Applied values remain visible as removable chips.
11. Results say **Matching areas** and use canonical tract-name/GEOID order. They report matching
    tract count and **population living in matching tracts**, plus missing-population disclosure.
    They do not claim people are affected and do not introduce a hidden ranking.
12. Postgres applies filters and population aggregation. MapLibre only renders the exact returned
    matching GEOIDs over the existing bounded Atlas geometry.
13. Keep comparison responses at or below 500,000 uncompressed bytes and Opportunity non-geometry
    responses at or below 150,000 uncompressed bytes. Existing Atlas geometry keeps its separate
    1,100,000-byte budget.
14. Do not add export, address search, AI summaries, rankings, recommendations, new source data,
    scoring or band changes, methodology changes, publication actions, resource availability
    filters, or public-land filters.
15. Commit each independently reviewable task with `MOO-756` in the message. Do not mark the issue
    Done until responsive/accessibility evidence, exact-preview review, public fail-closed proof,
    CI, user approval, PR review, and merge are complete.

## Planned interface and file map

### Shared contracts

- `packages/contracts/src/analyze/compare.ts`
  - `compareUrlStateSchema`: zero to five ordered, unique tract IDs for page setup.
  - `compareRequestSchema`: two to five ordered, unique tract IDs for an analytical load.
  - `compareResponseSchema`: available/unavailable response tied to one run.
  - `ComparisonTract`, `ComparisonMetric`, and shared provenance-reference types.
- `packages/contracts/src/analyze/opportunity.ts`
  - `opportunityFilterStateSchema` and canonical URL parameter parsing inputs.
  - `opportunityRequestSchema`: applied filters only.
  - `opportunityResponseSchema`: matching rows, counts, population totals, and missing-data counts.
  - Filters: `priorities`, `equityBands`/`equityPercentileMinimum`,
    `foodNeedBands`/`foodNeedPercentileMinimum`, inclusive no-vehicle and SNAP minimums, inclusive
    grocery-walk minimum plus explicit unreachable option, and inclusive transit maximum.
- `packages/contracts/src/analyze/index.ts` and `packages/contracts/src/index.ts`: public exports.
- `packages/contracts/tests/analyze-compare.test.ts` and
  `packages/contracts/tests/analyze-opportunity.test.ts`: strict contract and canonicalization tests.

### Exact-run database access

- `packages/database/src/analyze/compare-repository.ts`
  - `loadComparison(selectedRun, orderedGeoids, environment, createClient)`.
  - Load all requested headers, four Food components, 13 Equity indicators, uncertainty, and
    deduplicated provenance in a bounded batch; no per-tract query loop.
- `packages/database/src/analyze/opportunity-repository.ts`
  - `loadOpportunityResults(selectedRun, filters, environment, createClient)`.
  - Apply parameterized predicates server-side and return ordered non-geometry summaries.
- `packages/database/src/server.ts`: server-only exports.
- `packages/database/tests/compare-repository.test.ts`,
  `packages/database/tests/compare-repository.integration.test.ts`,
  `packages/database/tests/opportunity-repository.test.ts`, and
  `packages/database/tests/opportunity-repository.integration.test.ts`.

### Next.js server boundaries

- `apps/web/app/analyze/compare/page.tsx` and
  `apps/web/features/compare/server/load-comparison.ts`.
- `apps/web/app/analyze/opportunity/page.tsx` and
  `apps/web/features/opportunity/server/load-opportunity.ts`.
- Both loaders select the run once, pass the same `SelectedAtlasRun` to every repository call,
  validate output, and preserve the public/preview cache boundary.

### Navigation and shared application shell

- `apps/web/components/application-shell/navigation.ts`: grouped Explore/Analyze route data.
- `apps/web/components/application-shell/responsive-sidebar.tsx`: pathname-derived current item.
- `apps/web/components/application-shell/application-shell.tsx`: page-specific skip-link label,
  main target, and mobile page title without Atlas-only assumptions.
- `apps/web/features/atlas/profile/profile-content.tsx`: **Compare this tract** entry link.

### Compare presentation

- `apps/web/features/compare/compare-url-state.ts`: ordered GEOID parsing and canonical URL writing.
- `apps/web/features/compare/differences.ts`: documented pure deterministic summary engine.
- `apps/web/features/compare/compare-page.tsx`, `compare-picker.tsx`,
  `comparison-summary.tsx`, `comparison-matrix.tsx`, `comparison-cards.tsx`,
  `differences-view.tsx`, and `comparison-evidence.tsx`.
- Co-located Vitest/Testing Library tests for every state and presentation.

### Opportunity presentation and map

- `apps/web/features/opportunity/opportunity-url-state.ts`: canonical applied URL state.
- `apps/web/features/opportunity/opportunity-workspace.tsx`, `opportunity-filter-form.tsx`,
  `applied-filter-chips.tsx`, and `opportunity-results.tsx`.
- `apps/web/features/opportunity/opportunity-map.tsx` and
  `apps/web/features/map/opportunity-layers.ts`: render/highlight server-returned GEOIDs only.
- Extend `apps/web/features/map/map-canvas.tsx` only through a small explicit render-state prop;
  keep one MapLibre lifecycle and the existing tract source.

### E2E, performance, and documentation

- `tests/e2e/compare-areas.spec.ts`, `tests/e2e/opportunity-explorer.spec.ts`, and focused public
  fail-closed assertions in `tests/e2e/accessibility.spec.ts` or a new
  `tests/e2e/analyze-public-mode.spec.ts`.
- `docs/verification/plan-5-compare-opportunity-explorer.md`.
- Update README, PRD wording, architecture/repository, UX screen/accessibility/responsive specs,
  and data-quality documentation only where implemented behavior changes.

---

### Task 0: Confirm scope, dependency boundary, and isolated workspace

**Files:** Linear MOO-756/MOO-768, current repository, this plan, companion design.

- [x] Start `.worktrees/moo-756` from merged Plan 4 commit `ae59c85` on
  `codex/moo-756-compare-opportunity-explorer`.
- [x] Confirm the Atlas already supplies strict tract, profile, run, search, and geometry contracts.
- [x] Confirm there is no governed published Food run and MOO-768 remains separate.
- [x] Record the approved route organization, summary-first comparison, Differences rule,
  verified filter set, missing-data semantics, responsive behavior, and scope exclusions.
- [x] Identify the existing exact validated preview run
  `97bd1cdf-bf96-573f-8fcf-92e8676925d4` for later read-only verification only.

### Task 1: Approve the design and executable plan

**Files:**
- Create: `docs/superpowers/specs/2026-08-30-moo-756-compare-opportunity-design.md`
- Create: `docs/superpowers/plans/2026-08-30-compare-opportunity-explorer.md`
- Update after approval: Linear MOO-756 comment/evidence only

- [x] Review the exact interface/file map, URL state, deterministic Differences ordering,
  Opportunity threshold semantics, missing-data counts, payload caps, verification gates, and
  exclusions with Tarik.
- [x] Obtain explicit approval: **“Approve MOO-756 design and plan.”**
- [x] Change this document's plan status to approved and record the approval date.
- [x] Commit only the approved design and plan before implementation begins.

```bash
git add docs/superpowers/specs/2026-08-30-moo-756-compare-opportunity-design.md \
  docs/superpowers/plans/2026-08-30-compare-opportunity-explorer.md
git commit -m "docs: approve MOO-756 compare and opportunity plan"
```

**Expected outcome:** The two documents and Linear contain the same approved contract; the diff
contains no application, database, methodology, source-data, or publication change.

**Stop gate:** Do not start Task 2 until Tarik explicitly approves both documents.

---

## Phase A — Strict contracts and exact-run repositories

### Task 2: Define Compare and Opportunity contracts first

**Files:** `packages/contracts/src/analyze/**`, exports, and contract tests from the file map.

- [ ] Write failing tests before schemas for ordered unique 0–5 Compare URL tracts and strict 2–5
  analytical requests.
- [ ] Reject duplicates, a sixth tract, malformed GEOIDs, unknown properties, mixed run IDs,
  incomplete metric sets, and unsourced display values.
- [ ] Model observed, unreachable, missing, suppressed, and conflicting evidence without coercion.
- [ ] Define summary-first comparison fields and exactly four Food plus 13 Equity measures for a
  complete tract; retain explicit incomplete/zero-population states.
- [ ] Write failing Opportunity tests for sorted/deduplicated categorical arrays, finite inclusive
  baseline/Food Need percentile and raw-measure thresholds, explicit grocery-unreachable
  selection, and empty-filter state.
- [ ] Define matching count, known-population sum, missing-population tract count, filter-required
  missing-data exclusion count, ordered rows, run identity, and no geometry in the response.
- [ ] Make every object strict and export inferred types from `@mke/contracts`.

```bash
npm test --workspace @mke/contracts -- tests/analyze-compare.test.ts \
  tests/analyze-opportunity.test.ts
npm run typecheck --workspace @mke/contracts
git add packages/contracts
git commit -m "feat: define MOO-756 analysis contracts"
```

**Expected outcome:** Contract tests pass; malformed or partial analytical data fails closed; no
contract introduces scores, ranking fields, recommendations, or resource/public-land filters.

### Task 3: Implement the bounded exact-run comparison repository

**Files:** `packages/database/src/analyze/compare-repository.ts`, database exports, and tests.

- [ ] Write unit builders and failing integration tests before the query.
- [ ] Load all 2–5 requested tracts in a bounded header/Food/Equity batch rather than N profile
  requests; preserve the request's stable display order.
- [ ] Require the exact selected Food run, exact pinned Equity Baseline run, canonical 2020
  Milwaukee County geography, matching score/geography IDs, complete lineage, and unique rows.
- [ ] Reject the complete response when any requested GEOID is unknown, duplicated by storage,
  belongs to another run, or carries mismatched evidence; do not return a silent partial result.
- [ ] Retain ACS margins/ranges/reliability, raw values and states, county percentiles, definitions,
  bands, contributions, source references, and limitations.
- [ ] Deduplicate repeated provenance at the response level and validate the final contract.
- [ ] Cover Priority 1, middle/low Priority, high-uncertainty ACS, tract `55079187200` insufficient
  data, and `55079990000`/the second zero-population tract as golden cases.

```bash
npm test --workspace @mke/database -- tests/compare-repository.test.ts
npm exec --workspace @mke/database -- vitest run tests/compare-repository.integration.test.ts
npm run typecheck --workspace @mke/database
git add packages/database
git commit -m "feat: load exact-run MOO-756 comparisons"
```

**Expected outcome:** One repository operation returns 2–5 tracts from one proven run bundle with
no N+1 profile loop; mismatch and partial-data fixtures fail with stable integrity codes.

### Task 4: Implement parameterized Opportunity filtering and aggregation

**Files:** `packages/database/src/analyze/opportunity-repository.ts`, exports, and tests.

- [ ] Write table-driven unit tests for each predicate before SQL construction.
- [ ] Prove OR within selected Priority/band values and AND across active filter categories.
- [ ] Prove inclusive boundaries for Equity Baseline/Food Access Need percentile minimums,
  no-vehicle/SNAP minimums, grocery-walk minimum, and transit maximum; test observed zero
  separately from missing.
- [ ] Keep a verified `unreachable` grocery state distinct from a numeric duration and include it
  only when its explicit option is applied.
- [ ] Parameterize all values; allow only contract-known columns/operators and reject arbitrary
  field names or SQL fragments.
- [ ] Join the exact selected Food run, pinned baseline run, canonical geography, and required
  component values. Do not query latest and do not filter in JavaScript.
- [ ] Count a tract as excluded for missing filter data only when at least one active filter is
  unevaluable and every other evaluable active filter matches. If any evaluable active filter
  fails, treat the tract as an ordinary non-match even when another field is missing.
- [ ] Add mixed-case tests for match + missing, non-match + missing, multiple missing fields, and
  no missing fields so the public count and SQL tri-state rule cannot diverge.
- [ ] Aggregate known population with SQL `SUM` over non-null population, report the number of
  matching tracts with missing population, and preserve an observed population of zero.
- [ ] Return matching rows ordered by canonical tract name and then GEOID, never by score.
- [ ] Integration-test no filters, every individual filter, combined filters, no matches, all 302
  canonical tracts, one insufficient tract, and both zero-population tracts.

```bash
npm test --workspace @mke/database -- tests/opportunity-repository.test.ts
npm exec --workspace @mke/database -- vitest run tests/opportunity-repository.integration.test.ts
npm run typecheck --workspace @mke/database
git add packages/database
git commit -m "feat: query MOO-756 matching areas"
```

**Expected outcome:** Database tests prove the approved Boolean semantics, missing-data disclosure,
population wording inputs, canonical ordering, exact lineage, and parameterized execution.

### Task 5: Add fail-closed page loaders and canonical URL state

**Files:** Compare/Opportunity server loaders and URL-state helpers/tests from the file map.

- [ ] Write failing URL tests before parsers. Compare preserves first-selected order and rejects
  duplicate tract parameters with recoverable copy; Opportunity sorts/deduplicates values and
  emits one canonical parameter order.
- [ ] Use repeated `tract` parameters for Compare. Zero or one valid tract renders setup; 2–5
  invokes the repository; invalid/unknown IDs receive recoverable copy and cannot form a partial
  comparison.
- [ ] Use documented Opportunity parameters only; invalid values are removed without changing
  unrelated campaign parameters.
- [ ] In each loader, call `selectAtlasRun` once and pass that exact `SelectedAtlasRun` to every
  repository call. Validate the response again at the server boundary.
- [ ] Distinguish `no_published_run`, invalid URL, too few comparison tracts, unavailable tract,
  integrity failure, and database failure with plain-language recovery states.
- [ ] Keep validated preview dynamic/private/no-store. Add only an immutable-publication cache seam;
  do not invent a published bundle or cache preview data.

```bash
npm test --workspace @mke/web -- compare-url-state opportunity-url-state \
  load-comparison load-opportunity
npm run typecheck --workspace @mke/web
git add apps/web/features/compare apps/web/features/opportunity
git commit -m "feat: deliver MOO-756 analysis data safely"
```

**Expected outcome:** Server-loader tests prove exact-run consistency, normalized shareable URLs,
private preview behavior, and safe unavailable states without leaking environment values.

---

## Phase B — Compare Areas

### Task 6: Add route-aware Explore and Analyze navigation

**Files:** application shell/navigation files, `/analyze/compare/page.tsx`,
`/analyze/opportunity/page.tsx`, tests.

- [ ] Write shell tests for Explore → Atlas and Analyze → Compare Areas/Opportunity Explorer.
- [ ] Derive `isCurrent` from `usePathname`; remove the hard-coded Atlas current state.
- [ ] Give each route a correct visible mobile title, document title, `h1`, skip-link label, and
  main target while preserving one main landmark.
- [ ] Keep 44-pixel navigation targets, focus return, and keyboard navigation at the existing
  768-pixel sidebar boundary.
- [ ] Render initial route setup/unavailable states without loading fake fixtures.

```bash
npm test --workspace @mke/web -- application-shell navigation compare-page opportunity-page
npm run build --workspace @mke/web
git add apps/web/app apps/web/components/application-shell
git commit -m "feat: add MOO-756 Analyze routes"
```

**Expected outcome:** All three routes are reachable and announce the correct current page on
mobile and desktop; the production build includes no client database dependency.

### Task 7: Add profile handoff and accessible tract selection

**Files:** Atlas profile content, Compare picker/page, and component tests.

- [ ] Write a failing profile test for **Compare this tract** linking to
  `/analyze/compare?tract={GEOID}` without copying score values into the URL.
- [ ] Reuse the existing accessible tract/neighborhood search result contract to add tracts; final
  comparison validity is still proven by the Compare loader's exact-run repository.
- [ ] Preserve insertion order, prevent duplicate selection, enforce five maximum, and provide
  text-labeled Remove controls.
- [ ] Explain the one-tract setup state and keep the search usable when no comparison has loaded.
- [ ] Preserve back/forward and copied-link behavior after add/remove actions.

```bash
npm test --workspace @mke/web -- profile-content compare-picker compare-page
git add apps/web/features/atlas/profile apps/web/features/compare
git commit -m "feat: select MOO-756 comparison tracts"
```

**Expected outcome:** A selected Atlas tract reaches Compare in one action, and keyboard/touch users
can create and edit a valid 2–5 tract set without duplicate or hidden state.

### Task 8: Implement and document deterministic Differences

**Files:** `apps/web/features/compare/differences.ts`, tests, comparison copy.

- [ ] Write exhaustive failing tests before the engine.
- [ ] Add a Priority difference when at least two complete tracts have different Priority labels;
  add Equity/Food band differences when at least two available band labels differ.
- [ ] For each comparable measure, calculate `max(county percentile) - min(county percentile)` and
  include it only when the gap is at least 20.0 points.
- [ ] Order Priority first, then Equity Baseline band, then Food Access Need band, then measure
  gaps from largest to smallest with approved metric display order and slug as stable tie-breakers.
- [ ] Cap output at five items after ordering. Never use contribution magnitude as a new rank.
- [ ] Exclude unavailable values from numeric claims, identify insufficient comparisons, and attach
  a caution when an included ACS estimate is not in the more-stable reliability state.
- [ ] Use neutral templates such as “These tracts fall in different Priority levels” and “The
  county-percentile range is X points”; never name a winner, cause, intervention, or recommendation.
- [ ] Assert byte-for-byte stable output for reordered storage rows with the same requested tract
  order. No LLM or network call is permitted.

```bash
npm test --workspace @mke/web -- differences
git add apps/web/features/compare
git commit -m "feat: explain MOO-756 comparison differences"
```

**Expected outcome:** Golden tests prove the 20-point threshold, five-item cap, stable tie-break,
uncertainty disclosure, missing-value behavior, and non-recommendation language.

### Task 9: Build summary-first desktop matrix and mobile cards

**Files:** Compare presentation components/tests and shared styles.

- [ ] Write presentation tests for 2 and 5 complete tracts, mixed completeness, uncertainty,
  missing population, and every explicit error/empty state.
- [ ] On desktop, render one semantic table with tract column headers and summary evidence rows.
- [ ] At narrow widths, render consistently ordered stacked cards; do not squeeze or require a
  swipe-only table. Keep the Differences view directly reachable.
- [ ] Show population, Priority, Equity Baseline, Food Access Need, and all four Food Access
  measures first. Put the 13 Equity indicators in labeled HeroUI accordions.
- [ ] Reuse formatting/reliability/plain-language helpers where possible; do not fork scoring or
  interpretation logic across desktop/mobile.
- [ ] Keep source, definition, vintage, quality, uncertainty, and limitation available within one
  additional interaction for every substantive metric.
- [ ] Use aligned figures and text labels for Priority, bands, quality, and reliability; color is
  never the only signal.

```bash
npm test --workspace @mke/web -- comparison-summary comparison-matrix \
  comparison-cards comparison-evidence differences-view
npm run typecheck --workspace @mke/web
git add apps/web/features/compare apps/web/app/globals.css
git commit -m "feat: build responsive MOO-756 comparisons"
```

**Expected outcome:** Desktop and mobile expose the same evidence and meaning, complete/incomplete
states stay explicit, and no layout depends on hover, color, or horizontal table squeezing.

---

## Phase C — Opportunity Explorer

### Task 10: Build draft/applied filter state and controls

**Files:** Opportunity URL state, filter form, chips, route page, and tests.

- [ ] Write interaction tests proving the page starts with no filters and draft changes do not
  change the URL, map, counts, or results until **Apply filters** is activated.
- [ ] Provide multi-select Priority/Equity/Food band controls and explicit inclusive numeric
  controls for Equity Baseline percentile, Food Access Need percentile, no-vehicle, SNAP low
  access, grocery walking time, and scheduled transit.
- [ ] Offer **No walking route found** only as the explicit verified unreachable grocery option;
  never encode it as infinite minutes.
- [ ] Explain threshold direction in plain language: at least for no-vehicle/SNAP/walk measures and
  at most for scheduled transit.
- [ ] Validate range, step, and empty input accessibly before applying. Do not submit `NaN`, blank
  zeroes, or unknown options.
- [ ] Render applied filters as removable text chips, include Clear all, and keep draft/applied
  state understandable after back/forward navigation.
- [ ] Announce applied-filter changes without reading the full results list.

```bash
npm test --workspace @mke/web -- opportunity-url-state opportunity-filter-form \
  applied-filter-chips
git add apps/web/features/opportunity
git commit -m "feat: control MOO-756 opportunity filters"
```

**Expected outcome:** Tests prove OR/AND intent is visible, thresholds are inclusive and validated,
and only applied canonical state drives server results.

### Task 11: Synchronize server results, non-map list, and MapLibre rendering

**Files:** Opportunity workspace/results/map, map render-state helper, and tests.

- [ ] Write tests proving the same server-returned GEOID set drives result cards and map styling.
- [ ] Pass Atlas geometry and matching GEOIDs from the same selected run through the page loader;
  reject a run mismatch instead of highlighting partial results.
- [ ] Add a tested MapLibre expression/filter for matching, non-matching, selected, insufficient,
  and zero-population presentation. Do not reproduce analytical predicates in the map component.
- [ ] Keep one map instance, existing tract source, selection behavior, reset extent, attribution,
  reduced-motion behavior, and cleanup.
- [ ] Provide a complete semantic Matching areas list independent of the map. Selecting a row or
  tract polygon opens the shared tract-profile evidence for the same run.
- [ ] Keep copied URL, reload, back/forward, map selection, result selection, and applied chips in
  sync without duplicate durable state.

```bash
npm test --workspace @mke/web -- opportunity-workspace opportunity-results \
  opportunity-map opportunity-layers map-canvas
git add apps/web/features/opportunity apps/web/features/map
git commit -m "feat: synchronize MOO-756 matching areas"
```

**Expected outcome:** The map is a visual mirror of the server result, while every essential result
and selection action remains available through semantic non-map content.

### Task 12: Complete responsive Opportunity layout and result meaning

**Files:** Opportunity workspace/results/components, styles, and tests.

- [ ] On wide screens, present filters, usable map, and matching-area list together without
  reducing the map to an unusable strip.
- [ ] On tablet/mobile, keep the map primary and use HeroUI Pro sheets for filters and results;
  verify focus moves into a sheet and returns to its trigger.
- [ ] Keep practical 44-pixel controls and reachable Apply/Clear/remove actions at all snap points.
- [ ] Report “X matching census tracts” and “Y people live in matching tracts with known
  population.” Separately name the number of matching tracts whose population is unavailable.
- [ ] Report filter-required missing-data exclusions without calling ordinary non-matches missing.
- [ ] Handle no filters, no matches, missing values, no published run, invalid URL, server error,
  map error, and loading with short recovery-oriented copy.
- [ ] Never use “affected population,” “recommended areas,” “best,” “worst,” or intervention copy.

```bash
npm test --workspace @mke/web -- opportunity-workspace opportunity-results
npm run build --workspace @mke/web
git add apps/web/features/opportunity apps/web/app/globals.css
git commit -m "feat: complete responsive MOO-756 opportunity explorer"
```

**Expected outcome:** Matching counts, population meaning, exclusions, and recovery states are
clear and equivalent across desktop, tablet, and mobile.

---

## Phase D — Verification, documentation, review, and delivery

### Task 13: Enforce payload and cache boundaries

**Files:** server-loader/repository performance tests and verification record.

- [ ] Serialize a five-tract complete comparison with all required evidence and enforce no more
  than 500,000 UTF-8 bytes uncompressed.
- [ ] Serialize the largest no-filter Opportunity non-geometry response and enforce no more than
  150,000 UTF-8 bytes uncompressed.
- [ ] Confirm Opportunity reuses the Atlas geometry payload instead of duplicating geometry in its
  response; retain the existing 1,100,000-byte Atlas GeoJSON cap.
- [ ] Inspect production static client bundles for database URLs, `DATABASE_URL_UNPOOLED`, preview
  mode values, a hard-coded validated run UUID, raw SQL, and server-only package imports.
- [ ] Inspect rendered HTML/RSC, Analyze API responses, and browser network payloads. Prove public
  no-data mode exposes no validated-run identity, credentials, or internal paths. In validated
  preview, permit an immutable run ID only in a browser-safe response when it is required to bind
  a follow-up request to the same selected bundle; it must not enter a share URL or static bundle.
- [ ] Prove preview loaders do not enter a shared public cache. Leave immutable published caching
  behind the current publication interface until MOO-768 supplies a governed bundle.

```bash
npm test --workspace @mke/web -- analyze-payload load-comparison load-opportunity
npm run build --workspace @mke/web
git diff --check
git add apps/web packages/database docs/verification/plan-5-compare-opportunity-explorer.md
git commit -m "perf: bound MOO-756 analysis responses"
```

**Expected outcome:** All three byte budgets and bundle scans pass; no validated preview identity or
server secret is present in browser assets.

### Task 14: Run five-width responsive and accessibility verification

**Files:** Analyze E2E specs, focused component fixes, and verification record.

- [ ] Exercise Compare and Opportunity at 375×812, 430×932, 768×1024, 1024×900, and 1440×1000.
- [ ] Test 2-tract and 5-tract Compare, add/remove maximum behavior, expandable indicators,
  Differences, copied URLs, reload, and back/forward.
- [ ] Test Opportunity draft versus applied filters, OR within a category, AND across categories,
  chip removal, Clear all, no matches, missing-data counts, map/list selection, and copied URLs.
- [ ] Run keyboard-only flows, visible-focus checks, meaningful headings/landmarks, useful names,
  sheet focus containment/return, 44-pixel target assertions, and non-map equivalence.
- [ ] Run axe WCAG A/AA scans on both workflows and representative data/error states at all five
  widths; require zero violations.
- [ ] Emulate reduced motion and forced colors; prove status is not color-only and no essential
  information is hover-only.
- [ ] Assert no horizontal page overflow and capture one reviewed screenshot per route/width.

```bash
npm run test:e2e -- --grep "Compare Areas|Opportunity Explorer"
```

**Expected outcome:** Both workflows pass at all five required widths with zero axe violations,
usable keyboard/touch paths, working sheets, and complete non-map evidence.

### Task 15: Verify the exact validated preview and public fail-closed modes separately

**Files:** Integration/E2E evidence and
`docs/verification/plan-5-compare-opportunity-explorer.md`.

- [ ] In an isolated development process, provide the existing server-only database URL without
  printing it and set `MKE_ATLAS_DATA_MODE=validated_preview`,
  `MKE_ATLAS_PREVIEW_RUN_ID=97bd1cdf-bf96-573f-8fcf-92e8676925d4`, and
  `MKE_PIPELINE_ENV=development`.
- [ ] Reconcile the exact Food run, pinned Equity run, 302 canonical tracts, 299 complete, one
  insufficient, two zero-population, and Priority counts 18/96/136/40/9 before browser review.
- [ ] Record stable golden comparisons covering high, middle, and low Priority, Census tract
  `55079008400` uncertainty, `55079187200` insufficient data, and a zero-population tract.
- [ ] Reconcile representative Opportunity queries directly against parameterized SQL and record
  matching count, known population, population-missing count, filter-data exclusion count, and
  first/last GEOID in canonical order.
- [ ] Run the complete five-width Analyze E2E suite against only this isolated development port.
- [ ] Stop the development preview process after its tests complete and remove its preview
  variables from the shell used for the production-equivalent proof.
- [ ] In a separate clean production-mode process with preview variables absent, build/start the
  app and prove `/analyze/compare` and `/analyze/opportunity` return `no_published_run`, expose no validated data,
  and have zero axe violations.
- [ ] Never change the validated run's status, write analytical rows, or treat this verification as
  publication.

```bash
# Terminal 1: exact guarded development preview; DATABASE_URL_UNPOOLED is supplied locally.
MKE_ATLAS_DATA_MODE=validated_preview \
MKE_ATLAS_PREVIEW_RUN_ID=97bd1cdf-bf96-573f-8fcf-92e8676925d4 \
MKE_PIPELINE_ENV=development \
npm run dev --workspace @mke/web -- --hostname 127.0.0.1 --port 3011

# Terminal 2: run only against that isolated preview process.
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 \
npm run test:e2e -- --grep "Compare Areas|Opportunity Explorer"

# Stop Terminal 1 before continuing. In a clean shell with preview variables absent, build and
# start the public production-equivalent server so `next dev` and `next build` never share `.next`.
npm run build --workspace @mke/web
PORT=3012 npm run start --workspace @mke/web

# A separate terminal may now run the public fail-closed browser proof.
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3012 \
npm run test:e2e -- --grep "Analyze public fail-closed"
```

**Expected outcome:** The verification record clearly separates an exact read-only validated
development preview from a production-equivalent public response containing no score data.

### Task 16: Update product, architecture, UX, data-quality, and verification documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/product/prd.md`
- Modify: `docs/architecture/system.md`
- Modify: `docs/architecture/repository.md`
- Modify: `docs/ux/information-architecture.md`
- Modify: `docs/ux/screen-specifications.md`
- Modify: `docs/ux/accessibility.md`
- Modify: `docs/ux/responsive.md`
- Modify: `docs/data/data-quality.md`
- Create/complete: `docs/verification/plan-5-compare-opportunity-explorer.md`

- [ ] Replace PRD “affected population” wording with the implemented, approved population meaning.
- [ ] Document exact routes, URL parameters, run selection, server/browser responsibility,
  repository joins, filter semantics, missing-data behavior, Differences rules, and byte caps.
- [ ] Document desktop/mobile parity, sheet behavior, non-map access, plain-language states, and
  five-width evidence.
- [ ] Record verified commands, run identity, counts, payloads, accessibility results, screenshots,
  known limitations, and the strict separation from MOO-768 publication.
- [ ] State explicitly that food sites/public land do not filter results, MapLibre does not perform
  analysis, and no ranking/recommendation/AI is present.

```bash
npm run verify
git diff --check
git add README.md docs
git commit -m "docs: record MOO-756 analysis behavior and verification"
```

**Expected outcome:** Documentation matches implemented behavior and terminology; no document
implies a score change, source change, public data release, recommendation, or completed export.

### Task 17: Run the full completion gate and review the branch diff

**Files:** Entire branch, tests, verification record.

- [ ] Run all contract, database, web, design-system, build, and Playwright checks.
- [ ] Run database integration tests only against the disposable development branch and exact
  validated run; record their read-only outcome.
- [ ] Review `git diff main...HEAD` for accidental methodology, schema/source, publication, AI,
  ranking, export, address-search, resource-filter, or public-land-filter changes.
- [ ] Confirm new files stay small/focused, no browser analytical calculation exists, every query
  is parameterized, and all public contracts are strict.
- [ ] Resolve every failing test, console error, accessibility violation, payload regression,
  documentation mismatch, or unexplained working-tree change before user review.

```bash
npm run verify
npm run test:e2e
git diff --check
git status --short
```

**Expected outcome:** All offline/public CI-equivalent checks pass, exact-preview integration proof
is recorded separately, and the worktree contains only intentional MOO-756 changes.

### Task 18: Obtain load-bearing user review, open the PR, and merge only after approval

**Files:** Local preview, Linear MOO-756, PR description, final verification record.

- [ ] Ask Tarik to complete a real task on both pages: compare at least two tracts, explain one
  meaningful difference, apply more than one Opportunity filter, and identify what the population
  and missing-data messages mean.
- [ ] Ask whether the pages are clear enough for county leaders and advocacy groups on both phone
  and desktop. This review may materially change labels, layout, or workflow.
- [ ] Obtain explicit approval: **“Approve MOO-756 product experience.”**
- [ ] Address findings with tests and updated evidence, or amend the approved design before any
  material scope/method change.
- [ ] Push `codex/moo-756-compare-opportunity-explorer`, open the PR with exact-preview and public
  fail-closed evidence, wait for CI/review, and do not merge a failing or unapproved PR.
- [ ] Merge only after explicit user instruction, then move MOO-756 to Done and record the merge
  commit. Keep MOO-768 and Plan 6 work separate.

```bash
git status --short
git log --oneline --decorate main..HEAD
git push -u origin codex/moo-756-compare-opportunity-explorer
gh pr create --base main --head codex/moo-756-compare-opportunity-explorer
gh pr checks --watch
```

**Expected outcome:** The approved, verified branch is reviewable in one PR. Merge and Linear Done
status occur only after green CI and explicit user authorization.

## Final verification matrix

| Contract | Required proof |
|---|---|
| Task 1 approval | Companion design and executable plan approved before any implementation commit. |
| Public published-only | Production-equivalent `/analyze/compare` and `/analyze/opportunity` return no validated/draft/failed data while no publication exists. |
| Local validated preview | Exact explicit run, pinned baseline, visible preview label, private/no-store behavior, no browser secret/run leak. |
| Compare selection | Ordered unique 2–5 tracts, one-tract handoff setup, maximum enforcement, URL reload/back/forward. |
| Exact comparison evidence | One bounded exact-run load, all requested tracts, 4 Food + 13 Equity measures, uncertainty and provenance, no partial response. |
| Deterministic Differences | Priority/band differences, >=20 percentile-point gaps, stable ordering, max five, uncertainty cautions, no LLM/ranking/recommendation. |
| Opportunity Boolean semantics | OR within category, AND across categories, inclusive thresholds, explicit unreachable option, parameterized SQL. |
| Missing and population | Missing is not zero; exclusion count is distinct from ordinary non-match; known population and missing-population tracts are separate. |
| Map boundary | Server returns matching GEOIDs; MapLibre only highlights them; complete non-map result list exists. |
| Responsive | Compare table/cards and Opportunity layout/sheets verified at 375, 430, 768, 1024, and 1440 px. |
| Accessibility | Keyboard, focus, semantics, live announcements, 44 px targets, forced colors, reduced motion, non-map parity, zero axe violations. |
| Performance | Comparison <=500,000 bytes, Opportunity non-geometry <=150,000 bytes, Atlas geometry <=1,100,000 bytes. |
| Scope protection | No scoring/method/source/publication change; no export, address search, AI, ranking, recommendation, resource/public-land filter. |
| Completion | Documentation, full verification, load-bearing user approval, green PR, explicit merge instruction, Linear evidence. |
