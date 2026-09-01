# Plan 5 Compare Areas and Opportunity Explorer verification

## Status

- Linear issue: `MOO-756`
- Branch: `codex/moo-756-completion-gate`
- Verification date: 2026-09-01
- Current checkpoint: Task 18 product experience and PR #6 merge approved
- Publication state: no Food Equity run is published; governed publication remains tracked by
  `MOO-768`

This checkpoint verifies the uncompressed response budgets, geometry separation, production
client-bundle boundary, public fail-closed responses, validated-preview exposure rules, and cache
seams for Compare Areas and Opportunity Explorer. It does not publish a run and does not implement
the immutable published cache planned for MOO-768.

## Payload budgets

Always-running web tests construct a contract-valid five-tract comparison with all four Food
Access measures, all thirteen Equity Baseline indicators, and required provenance per tract. They
also construct the largest contract-valid no-filter Opportunity response with 302 matching tract
summaries. Both tests measure `Buffer.byteLength(JSON.stringify(value), "utf8")`, not JavaScript
character count.

Read-only reconciliation against validated Food Equity run
`97bd1cdf-bf96-573f-8fcf-92e8676925d4` on the disposable Neon branch produced:

| Payload | Measured UTF-8 bytes | Enforced maximum | Result |
|---|---:|---:|---|
| Complete five-tract Compare response | 55,311 | 500,000 | passed |
| No-filter 302-tract Opportunity response, without geometry | 144,569 | 150,000 | passed |
| Shared 302-feature Atlas GeoJSON | 1,052,366 | 1,100,000 | passed |

The Opportunity response contains tract properties, score summaries, filters, run metadata, and
summary counts. It contains neither a `geometry` nor a `coordinates` key. The page continues to
load the separately bounded Atlas feature collection and gives that same collection to MapLibre;
Opportunity does not return a second polygon copy.

The live integration tests retain all three caps. The no-filter Opportunity integration now also
asserts the geometry keys are absent. These opt-in checks passed 9 tests across the Compare,
Opportunity, and Atlas repositories. The always-running fixture checks protect the Compare and
Opportunity budgets when a live preview database is unavailable in CI.

## Production client-bundle boundary

Every Webpack production build now runs `verify-analysis-client-bundle.mjs`. The fresh Task 13
build recursively scanned 32 JavaScript assets under `.next/static`. It fails when an asset contains:

- `DATABASE_URL` or `DATABASE_URL_UNPOOLED`;
- a preview environment-variable name;
- the validated preview run UUID;
- a PostgreSQL connection URI;
- `@mke/database`, `drizzle-orm`, or `server-only` import markers; or
- SQL-shaped SELECT, INSERT, UPDATE, or DELETE text.

The scan passed with no findings. The generic `validated_preview` contract enum remains in client
code because the visible preview badge must distinguish preview data from published data. It is a
mode label, not a run identity, credential, or environment value. The exact preview UUID and all
preview environment-variable names remain absent from static client assets.

## Public fail-closed response inspection

The production server was started with database and preview environment variables explicitly
removed. The following responses contained no UUID, database variable, PostgreSQL URI, internal
filesystem path, or preview identity:

| Response | Bytes | Cache boundary |
|---|---:|---|
| Compare rendered HTML | 18,663 | `private, no-cache, no-store, max-age=0, must-revalidate` |
| Opportunity rendered HTML | 53,142 | `private, no-cache, no-store, max-age=0, must-revalidate` |
| Compare RSC navigation | 989 | dynamic; no forbidden value |
| Opportunity RSC navigation | 6,117 | dynamic; no forbidden value |
| Atlas search no-data JSON | 51 | `private, no-store, max-age=0` |
| Atlas profile no-data JSON | 51 | `private, no-store, max-age=0` |

Both related JSON routes returned only
`{"state":"unavailable","reason":"no_published_run"}`. Analyze results have no separate public
JSON endpoint; their browser payload is the inspected server-rendered HTML/RSC response. Public
mode never fell back to the validated run.

## Validated-preview response inspection

Validated preview is deliberately rejected by `NODE_ENV=production`. The browser-safe preview was
therefore inspected through the guarded development server with `MKE_PIPELINE_ENV=development`,
the exact run UUID, and the disposable database connection supplied only to the server process.

- Five-tract Compare HTML, filtered Opportunity HTML, filtered Opportunity RSC, and the exact-run
  tract-profile JSON contained no database variable, connection URI, credential, or internal path.
- The immutable run UUID appeared in browser-safe result data so a selected tract profile could be
  bound to the same run. The profile route remained `private, no-store, max-age=0`.
- Share URLs contained only ordered tract IDs or normalized filters. They contained neither a
  `run` parameter nor a UUID.
- The filtered Opportunity RSC was `text/x-component`, `no-cache, must-revalidate`, and carried the
  Atlas geometry separately from the non-geometry Opportunity result.
- Database URLs were never printed, written to a verification artifact, or committed.

## Cache-seam proof

Both analysis routes are `force-dynamic` and call Next's request-time `connection()` boundary
before selecting data. Loader tests now make two successive validated-preview requests and prove
that run selection and the validated-preview repository loader are each called twice. No shared
memoized result is used. The published branch remains a separate `loadImmutablePublished` seam,
but it intentionally performs no caching until MOO-768 supplies a governed immutable publication
identity.

Public production HTML and related APIs returned private/no-store headers. The guarded development
preview returned no-cache/must-revalidate HTML/RSC, while selected-profile JSON remained
private/no-store. No preview response enters a shared public cache.

## Automated checkpoint

| Check | Result |
|---|---:|
| Task 13 payload/loader tests | 22 passed |
| Web unit/component tests | 179 passed |
| Contracts tests | 84 passed |
| Database unit tests | 125 passed |
| Design-system tests | 1 passed |
| Live Compare/Opportunity/Atlas repository tests | 9 passed |
| Workspace lint and typechecks | passed |
| Next.js production build | passed |
| Production client assets scanned | 32, no findings |
| Public HTML/RSC/API exposure scan | passed |
| Guarded-preview HTML/RSC/API exposure scan | passed |
| `git diff --check` | passed |

The 389 offline tests passed. The web suite was run with four workers and a 15-second per-test
ceiling after an initial unconstrained run caused unrelated five-second UI-test timeouts under
local process contention; the four affected files also passed independently with one worker.

## Commands exercised at this checkpoint

```text
npm test --workspace @mke/web -- analyze-payload load-comparison load-opportunity
npm run lint --workspace @mke/web
npm run typecheck --workspace @mke/web
npm run build --workspace @mke/web
npm run verify:analysis-bundle --workspace @mke/web
npx vitest run tests/compare-repository.integration.test.ts \
  tests/opportunity-repository.integration.test.ts \
  tests/atlas-repository.integration.test.ts
git diff --check
```

The live integration command requires the documented development-preview guards and read-only
connection to the disposable Neon branch. At the Task 13 checkpoint, the complete five-width
Compare and Opportunity interaction, keyboard, axe, forced-colors, reduced-motion, screenshot,
and browser-error matrix remained for Task 14 below.

## Task 14 responsive and accessibility matrix

Task 14 ran the complete Analyze browser suite against the guarded local validated preview at the
five approved viewport sizes. The browser process received only the exact preview-run identifier;
the database connection remained in the isolated Next.js server process and was neither printed
nor written to an artifact. This checkpoint did not publish, supersede, or mutate a score run.

| Route | 375 × 812 | 430 × 932 | 768 × 1024 | 1024 × 900 | 1440 × 1000 |
|---|---:|---:|---:|---:|---:|
| Compare Areas | passed | passed | passed | passed | passed |
| Opportunity Explorer | passed | passed | passed | passed | passed |

All 10 cases passed with zero axe WCAG A/AA violations. Each case also asserted no horizontal
page overflow, meaningful route headings and landmarks, visible keyboard focus, practical 44-pixel
targets, reduced-motion behavior, forced-colors rendering, and visible text for priority, preview,
missing-data, and non-recommendation states. The exact HeroUI Pro development-only Sidebar
hydration warning was excluded from this guarded `next dev` error collector; every other console
error and page error remained fatal. Task 15 still owns the separate production-mode zero-error
proof.

Compare coverage exercised two and five tracts; maximum selection; keyboard add/remove; stable
selection order; expanded indicator evidence; Differences; invalid links without partial data;
copied URLs; reload; and browser Back/Forward. It proved the desktop table and narrow stacked cards
use the same evidence contract and that the share URL contains no run identity.

Opportunity coverage exercised draft versus applied state; Priority 1 or 2 within one category;
an Equity band across categories; keyboard chip removal and Clear all; zero-match results; three
tracts excluded for missing filter data; map controls; non-map result selection; selected-profile
evidence; invalid filters without partial results; copied URLs; reload; and browser Back/Forward.
At 375, 430, and 768 pixels it also proved Sheet initial focus, focus containment, Escape return,
draft persistence, and 44-pixel triggers/close controls. At 1024 pixels the reviewed layout uses
filters beside the map with matching areas below so text remains readable; 1440 pixels retains the
three-column planning workspace.

The first browser pass identified and Task 14 fixed three concrete issues:

- expanded Compare source links used a low-contrast accent color;
- mobile Opportunity sheets did not request initial focus and their close controls were smaller
  than the practical touch target; and
- the shared MapLibre container placed `aria-label` on a plain `div`, which axe correctly rejected.

The visual review then corrected the cramped 1024-pixel three-column Opportunity layout and added
browser position assertions for the two-column 1024 and three-column 1440 contracts.

Reviewed screenshots are generated locally at:

```text
artifacts/plan-5/task-14/compare/width-375.png
artifacts/plan-5/task-14/compare/width-430.png
artifacts/plan-5/task-14/compare/width-768.png
artifacts/plan-5/task-14/compare/width-1024.png
artifacts/plan-5/task-14/compare/width-1440.png
artifacts/plan-5/task-14/opportunity/width-375.png
artifacts/plan-5/task-14/opportunity/width-430.png
artifacts/plan-5/task-14/opportunity/width-768.png
artifacts/plan-5/task-14/opportunity/width-1024.png
artifacts/plan-5/task-14/opportunity/width-1440.png
```

The Task 14 browser command was:

```text
PLAYWRIGHT_BASE_URL=http://localhost:3011 \
MKE_ATLAS_DATA_MODE=validated_preview \
MKE_ATLAS_PREVIEW_RUN_ID=<exact validated run supplied locally> \
npm run test:e2e -- --grep "Compare Areas|Opportunity Explorer" --workers=1
```

Final Task 14 gates also passed: 179 web unit tests across 45 files, web lint, web
typecheck, the Next.js production build, a 32-asset production client scan with no
server-only or secret findings, and `git diff --check`.

## Task 15 exact-preview and public fail-closed proof

Task 15 first reconciled the exact validated development preview through the parameterized
database repositories on the disposable Neon branch. The connection string was supplied only to
the test and server processes and was neither printed nor written to an artifact. The immutable
identities and result universe were:

| Contract | Exact result |
|---|---:|
| Food Equity run | `97bd1cdf-bf96-573f-8fcf-92e8676925d4` |
| Pinned Equity Baseline run | `502e2a04-b013-53cd-8b09-c9144862701a` |
| Canonical 2020 tracts | 302 |
| Complete / insufficient / zero-population | 299 / 1 / 2 |
| Priority 1 / 2 / 3 / 4 / 5 | 18 / 96 / 136 / 40 / 9 |

Golden comparison assertions preserved Priority 1, 3, and 5 examples in requested order. Census
tract `55079008400` retained its 61.3% housing-cost-burden estimate, plus-or-minus 22.5 percentage
point Census 90% margin of error, 97th county percentile, and `use_with_caution` reliability.
Census tract `55079187200` remained `insufficient_data` with no inferred measures or Priority, and
zero-population tract `55079990000` remained explicitly ineligible and unscored.

Representative Opportunity calls used the production-parameterized repository query and proved
OR within Priority, AND across filter categories, explicit missing-data exclusions, population
meaning, and canonical result order:

| Applied conditions | Matches | Known population | Population missing | Missing filter data | First / last GEOID |
|---|---:|---:|---:|---:|---|
| Priority 1 | 18 | 58,869 | 0 | 3 | `55079000101` / `55079009600` |
| Priority 1 or 2 | 114 | 365,125 | 0 | 3 | `55079000101` / `55079009800` |
| Priority 1 or 2, and Equity High | 29 | 89,959 | 0 | 2 | `55079012300` / `55079009100` |

The three focused live repository files passed 9 tests. The wider database integration command
also passed all 12 tests across six files, including schema, health, and tract-profile lineage.
No test changed a run status or wrote analytical rows.

The isolated development server then received only the exact validated-preview configuration and
ran the complete Compare and Opportunity suite on port 3011. All 10 route/width cases passed in
4.7 minutes across 375×812, 430×932, 768×1024, 1024×900, and 1440×1000. Afterward that process was
stopped before any production build or public-mode check began.

For the separate public proof, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `MKE_ATLAS_DATA_MODE`,
`MKE_ATLAS_PREVIEW_RUN_ID`, and `MKE_PIPELINE_ENV` were explicitly removed from the build, server,
and browser-test environments. The clean Webpack production build passed and scanned 32 client
assets with no preview identity, database secret, server-only module, or SQL finding. A separate
production server ran on port 3012.

At all five required widths, both `/analyze/compare` and `/analyze/opportunity` displayed “No
published Food Equity results yet” and said that nothing from a private preview was shown. The
strict production browser collector allowed no ignored console errors or page errors. All five
combined route/width cases passed with zero browser errors, zero axe WCAG A/AA violations, no
horizontal overflow, and no validated run UUID, `validated_preview` state, or representative
validated value in rendered HTML. The production process was stopped after the proof.

Task 15 did not publish, supersede, or mutate a run. Public mode remained fail-closed, and governed
publication remains exclusively tracked by `MOO-768`.

```text
# Exact read-only repository proof, with approved local server-only environment supplied
npm run test:integration --workspace @mke/database -- --reporter=verbose

# Exact guarded preview on isolated port 3011
npm run test:e2e -- --grep "Compare Areas|Opportunity Explorer" --workers=1

# Clean production build and separate public server on port 3012
npm run build --workspace @mke/web
npm run test:e2e -- --grep "Analyze public fail-closed" --workers=1
```

## Task 16 documentation reconciliation

Task 16 reconciled the README and current product, architecture, repository, information
architecture, screen, accessibility, responsive, data-quality, and verification documents with
the implemented Plan 5 behavior. The current documentation now records:

- exact `/analyze/compare` and `/analyze/opportunity` routes and canonical URL parameters;
- exact-run/publication selection and the strict separation from `MOO-768`;
- server-owned joins, parameterized filtering, ordering, population summaries, and missing-data
  classification versus browser-owned pending controls and presentation;
- Compare's 2–5 ordered tract contract, responsive matrix/cards, progressive evidence, and
  deterministic 20-point/five-item Differences rules;
- Opportunity's OR-within/AND-across inclusive filters, applied-versus-draft state, missing-filter
  tri-state rule, canonical order, non-map equivalence, and 1024/1440 layout distinction;
- 500 KB Compare, 150 KB geometry-free Opportunity, and 1.1 MB shared Atlas GeoJSON caps; and
- five-width keyboard, Sheet, forced-colors, reduced-motion, target-size, axe, screenshot, exact-
  preview, and public fail-closed evidence.

Current limitations remain explicit: no governed Food Equity publication exists yet; public
Analyze therefore shows `no_published_run`. Contextual food sites, public land, and public
investment are not filters. Address/ZIP/municipality authority remains separately gated. Export
is Plan 6 work. Published immutable caching remains `MOO-768` work. No ranking, recommendation,
causal claim, browser analytical GIS, score recalculation, or AI is present.

| Task 16 verification | Result |
|---|---:|
| Repository lint | passed |
| All workspace typechecks | passed |
| Web tests with four workers / 15-second ceiling | 179 passed |
| Contracts tests | 84 passed |
| Database offline tests | 125 passed |
| Design-system tests | 1 passed |
| Next.js production build | passed |
| Production client asset scan | 32 assets, no findings |
| `git diff --check` | passed |

The first unconstrained `npm run verify` invocation reached all lint/typecheck gates and the test
phase, where 15 UI tests exceeded Vitest's default five-second timeout under local worker
contention. The same complete 179-test web suite then passed with the already documented
four-worker, 15-second ceiling; contracts, database, and design-system suites passed unchanged.
The production build and bundle scan were rerun after the bounded suite and passed. No application,
contract, database, methodology, source, publication, or export behavior changed in Task 16.

```text
npm run verify
npm test --workspace @mke/web -- --maxWorkers=4 --testTimeout=15000
npm run build --workspace @mke/web
git diff --check
```

## Task 17 completion gate

Task 17 reran the complete repository, database, design, build, and browser verification before
the product-review gate. The web test command now carries the already-proven four-worker and
15-second ceiling directly in `apps/web/package.json`, so `npm run verify` is stable under local
process contention without weakening any assertion.

The complete guarded preview used the exact validated Food Equity run and the approved valid City
neighborhood snapshot. All 40 applicable tests passed across 375, 430, 768, 1024, and 1440 pixels;
the five public-only tests skipped by design. The neighborhood search and tract profile therefore
also proved the configured City reference instead of exercising the intentional
`snapshot_not_configured` state. Accessibility and shell coverage distinguish this guarded
development preview from public production while excluding only the exact HeroUI Pro React Aria
ID hydration warning produced by Next's development renderer. Every other console error and page
error remains fatal.

The separate clean public run explicitly removed the database, preview-run, neighborhood-snapshot,
data-mode, and pipeline-environment variables. All 15 applicable public tests passed at the same
five widths; 30 preview-only tests skipped by design. The public collector ignored no browser
errors, Analyze stayed fail-closed, and no validated preview data appeared.

Read-only reconciliation against the disposable Neon branch passed all 12 database integration
tests across six files, including PostGIS health, schema, the exact Atlas bundle, Compare and
Opportunity golden results, and tract-profile lineage. The connection string was supplied only to
the test and server processes and was not printed or written to an artifact. No run status or
analytical row was changed.

The `main...HEAD` audit found no schema, scoring-methodology, source-ingestion, publication,
export, address-authority, public-land, resource-ranking, or AI change. The Plan 5 database joins
and Opportunity filters remain in parameterized Drizzle SQL; strict Zod contracts validate the
server results. MapLibre receives already-selected geometry only for display and interaction.
Missing values are not replaced with zero, contextual food sites and public investment do not
change results, and matching areas remain canonically ordered rather than ranked. Changed files
remain focused on verification, responsive/accessibility corrections, documentation, and the
client-bundle boundary.

| Task 17 verification | Result |
|---|---:|
| `npm run verify` | passed |
| Offline tests | 389 passed |
| Exact read-only database integrations | 12 passed |
| Exact validated-preview Playwright matrix | 40 passed, 5 skipped |
| Clean public Playwright matrix | 15 passed, 30 skipped |
| Required responsive widths | 375, 430, 768, 1024, 1440 passed |
| Next.js production build | passed |
| Production client asset scan | 32 assets, no findings |
| `main...HEAD` guardrail audit | passed |
| `git diff --check` | passed |

```text
npm run verify
npm run test:integration --workspace @mke/database -- --reporter=verbose
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 \
  MKE_ATLAS_DATA_MODE=validated_preview \
  MKE_ATLAS_PREVIEW_RUN_ID=<exact validated run supplied locally> \
  npm run test:e2e -- --workers=1
env -u DATABASE_URL -u DATABASE_URL_UNPOOLED -u MKE_ATLAS_DATA_MODE \
  -u MKE_ATLAS_PREVIEW_RUN_ID -u MKE_ATLAS_NEIGHBORHOOD_SNAPSHOT_ID \
  -u MKE_PIPELINE_ENV npm run test:e2e -- --workers=1
git diff --check
git status --short
```

Task 17 did not publish, supersede, or mutate a run. MOO-756 now stops at the required Task 18
product-review gate.

## Task 18 product review

On 2026-09-01, Tarik reviewed the exact validated local preview after receiving the required
Compare Areas and Opportunity Explorer task prompt and explicitly approved the MOO-756 product
experience. No review finding or requested amendment was reported. This approval authorizes the
verified branch to proceed to pull-request review; it is not merge authorization.

Before merge, CodeRabbit completed its review and posted seven bounded findings. The branch now
uses the canonical SNAP retailer low-access label, identifies higher values as worse access,
requires both validated-preview mode and an exact HeroUI/React Aria signature before excluding the
known development-only hydration warning, checks both animation names and transition durations,
waits for negligible-motion state to settle, requires configured Playwright viewports, and uses a
retrying URL assertion after keyboard filter edits. The preview verification commands now provide
the explicit data mode to the test process.

After those corrections, `npm run verify` passed all 389 offline tests and the production build
scanned 32 client assets with no finding. The complete exact-preview browser matrix passed 40
applicable tests with five public-only skips. A fresh isolated production server on port 3012 then
passed all 15 applicable public tests with 30 preview-only skips. Tarik separately authorized
merging PR #6 on 2026-09-01 after the review completed.
