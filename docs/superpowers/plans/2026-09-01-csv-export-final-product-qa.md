# Plan 6B — CSV Export and Final Product QA Implementation Plan

> **Execution rule:** Implement one task at a time in the MOO-769 worktree. Task 1 is a
> protected human-approval gate. Design approval does not authorize implementation until this
> executable plan is also approved. A live database branch or fixture publication requires a
> separate exact approval at Task 8. Production publication and production data mutation remain
> blocked behind Gate 3.

**Goal:** Give the public a plain-language Data page and a deterministic CSV containing the exact
tract evidence behind the current governed publication, then complete final public-MVP QA across
all routes and supported screen sizes.

**Architecture:** The server selects the one governed published bundle, a database repository
loads its explicitly pinned tract evidence in bounded set-based queries, and a strict export
builder proves membership and completeness before any bytes are serialized. A server-only CSV
serializer applies a fixed column registry, safe escaping, and spreadsheet-formula protection.
The `/data` page explains scope and limitations before linking to the route handler. The browser
never joins, scores, ranks, or infers data.

**Tech stack:** Existing Next.js 16.3.3 App Router, React 19.2.8, TypeScript 6.0.3, HeroUI Pro,
Zod 4.4.3, Drizzle ORM 0.45.2, PostgreSQL/PostGIS, Vitest 4.1.11, Playwright 1.62.1, npm
workspaces, and the repository's existing Python verification suites.

**Contract:** `docs/superpowers/specs/2026-09-01-moo-769-csv-export-final-qa-design.md`

**Tracking:** Linear MOO-769 — Plan 6B — CSV export + final product QA; child of MOO-757 and
blocking MOO-758 Gate 3.

**Plan status:** Approved by Tarik on 2026-09-02 with the response “continue.” Tasks 2–7 may
proceed offline. Task 8 still requires separate exact approval before any live Neon branch,
fixture publication, external deployment, or production-adjacent action.

**Implementation update (2026-09-02):** Offline Tasks 2–7 and Task 10 documentation are
implemented and verified. The remaining work is the complete repository gate, review, and the
separately approved live-proof path. No live database, publication, deployment, or production
data action has occurred.

## Fixed execution decisions

1. Work only in `.worktrees/moo-769` on `codex/moo-769-csv-export-final-qa`.
2. Preserve commit `84d653a` as the independently approved design checkpoint.
3. Export all 302 canonical Milwaukee County 2020 Census tracts, ordered by GEOID; do not export
   the current map filter, selection, or viewport.
4. Use one wide row per tract with the fixed column families and slugs in the approved design.
5. Export only the exact current governed publication returned in public mode. Never infer
   latest, accept a caller-supplied run, or fall back to validated preview.
6. Require explicit publication membership for every score, component, value, neighborhood
   snapshot, and source/resource decision used in the file.
7. Fail the whole export for duplicate, missing, unknown, wrong-run, unpinned, or inconsistent
   evidence. Never emit a partial CSV.
8. Preserve observed zero, unavailable states, quality, margins of error, confidence ranges,
   reliability, exclusions, provenance, methodology versions, vintages, IDs, and hashes.
9. Include the approved City of Milwaukee neighborhood overlap reference. Do not add ZIP/ZCTA
   context without a separately approved source and overlap contract.
10. Exclude geometry, coordinates, resource-level rows, emergency-food rows, public investment,
    and context-only walking counts.
11. Use RFC 4180-compatible UTF-8 CSV with CRLF rows, fixed headers, deterministic values, and
    spreadsheet-formula neutralization for every textual cell.
12. Keep the database query, row builder, and serializer server-only. No connection string,
    private provenance detail, SQL, stack trace, or secret may enter the page, error response,
    client bundle, or verification evidence.
13. Add **Download data** to the same primary navigation on every route and width. The link opens
    `/data`; it does not trigger a context-free download.
14. The Data page and endpoint fail closed for no publication, preview-only mode, inconsistent
    data, and operational failure.
15. Complete final regression, responsive, accessibility, build, bundle, and documentation QA
    before proposing the pull request.
16. Do not create or mutate a Neon branch, publish a fixture, deploy externally, or touch
    production without the separate approval identified in Task 8.
17. Commit each independently understandable task with MOO-769 in the message.
18. Do not mark MOO-769 Done until implementation, final QA, evidence, PR review, merge, and user
    approval are complete.

## Planned interface and file map

### Strict export contract and column dictionary

- `packages/contracts/src/atlas/export.ts`
  - public availability and stable failure-reason schemas;
  - immutable publication identity used by the page and file;
  - fixed Equity and Food metric slug registries;
  - fixed grouped column definitions with machine name, plain-language label, definition, unit,
    and limitation;
  - strict one-row and complete-export schemas.
- `packages/contracts/src/atlas/index.ts` and `packages/contracts/src/index.ts`
  - public contract and type exports.
- `packages/contracts/tests/atlas-export.test.ts`
  - strict parsing, fixed order, duplicate rejection, complete metric families, and unknown-field
    rejection.

### Governed database read boundary

- `packages/database/src/atlas/export-repository.ts`
  - set-based, parameterized public-export queries;
  - explicit publication-member joins for tract score pairs, 13 Equity components and values,
    four Food components and values, source snapshots/resources, and approved neighborhood
    overlaps;
  - pure builders that reject wrong-run evidence, duplicate/missing metric slugs, incomplete
    tract membership, unknown geography, and invalid provenance;
  - exactly 302 rows in GEOID order.
- `packages/database/src/server.ts`
  - read-only server export only; no publication command exposure.
- `packages/database/tests/atlas-export-repository.test.ts`
  - pure builder and mocked-query integrity tests.
- `packages/database/tests/atlas-export-repository.integration.test.ts`
  - controlled database fixture proof, run only under the existing integration opt-in.

No schema or migration is planned. If implementation discovers that the approved evidence cannot
be read without changing stored contracts, stop and amend the design and plan rather than adding
an unreviewed migration.

### Server orchestration and deterministic CSV

- `apps/web/features/data/server/load-tract-export.ts`
  - calls `selectAtlasRun` first;
  - permits only `mode: "published"`;
  - loads the exact export and maps stable redacted failures;
  - supplies both Data-page metadata and the full download payload through separate bounded
    functions so the page does not load all CSV rows.
- `apps/web/features/data/server/load-tract-export.test.ts`
  - published, no-publication, preview-only, incomplete, and thrown-error cases.
- `apps/web/features/data/server/serialize-tract-csv.ts`
  - fixed-header RFC 4180 serialization;
  - CRLF endings, deterministic formatting, empty unavailable values, JSON overlap cell, Unicode,
    quoting, and spreadsheet-formula neutralization.
- `apps/web/features/data/server/serialize-tract-csv.test.ts`
  - byte-level golden cases for commas, quotes, CR/LF, Unicode, nulls, observed zero, and formula
    prefixes (`=`, `+`, `-`, `@`, tab, and carriage return).
- `apps/web/app/api/exports/tract-evidence.csv/route.ts`
  - dynamic GET route with exact filename, `text/csv; charset=utf-8`, `Content-Disposition`,
    `X-Content-Type-Options: nosniff`, and private/no-store caching;
  - structured JSON error response when no CSV can safely be produced.
- `apps/web/app/api/exports/tract-evidence.csv/route.test.ts`
  - success bytes/headers, public unavailability statuses, redaction, and no partial body.

### Data page and global navigation

- `apps/web/app/data/page.tsx`
  - metadata and server-owned page entry point.
- `apps/web/app/data/loading.tsx`
  - accessible, responsive loading state.
- `apps/web/app/data/page.test.tsx`
  - available and unavailable server states.
- `apps/web/features/data/data-page.tsx`
  - plain-language publication summary, scope, limitations, download action, methodology/source
    links, and grouped column dictionary using HeroUI Pro components where appropriate.
- `apps/web/features/data/data-page.test.tsx`
  - understandable copy, semantic headings/table or definition lists, link behavior, and failure
    states.
- `apps/web/components/application-shell/navigation.ts`
  - add the Data navigation group/item.
- `apps/web/components/application-shell/application-shell.test.tsx`
  - prove the Data destination appears and current-page behavior remains accessible.
- `apps/web/app/globals.css`
  - only small responsive/accessibility rules that cannot be expressed with existing tokens or
    utility classes.

### Final browser and product QA

- `tests/e2e/data-export.spec.ts`
  - Data navigation, context-before-download, unavailable states, real CSV response, and keyboard
    behavior.
- `tests/e2e/application-shell.spec.ts`
  - Data link on desktop and mobile navigation.
- `tests/e2e/accessibility.spec.ts`
  - axe and keyboard coverage for `/data` plus regression coverage for public routes.
- `tests/e2e/final-product-qa.spec.ts`
  - Atlas, Tract Profile, Compare, Opportunity, and Data at 375, 430, 768, 1024, and 1440;
  - shareable URL state, horizontal overflow, loading/empty/error handling, console errors, and
    non-map access to essential information.
- Existing feature/page tests may be changed only when final QA finds a reproducible regression;
  every fix requires a failing test first and remains within approved MVP behavior.

### Documentation and sanitized evidence

- `README.md`
  - public Data page and local verification entry points.
- `docs/product/prd.md`
  - mark FR-11 implemented without changing its scope.
- `docs/architecture/system.md`
  - export read boundary and fail-closed flow.
- `docs/data/schema.md`
  - logical export view and publication-member requirements; no physical schema change.
- `docs/data/data-quality.md`
  - CSV missing/uncertainty/reliability representation.
- `docs/data/source-registry.md`
  - approved neighborhood attribution and redistribution context already used by the export.
- `docs/ux/content-style-guide.md` and the relevant Atlas UX specification
  - Data-page plain-language and uncertainty wording.
- `docs/verification/plan-6b-csv-export-final-product-qa.md`
  - secret-free commands, results, row/header/hash evidence, five-width/accessibility results,
    limitations, and explicit production exclusion.

---

## Phase 0 — Approval and workspace gates

### Task 0: Confirm scope, dependency, and isolated workspace

- [x] Confirm MOO-768/PR #7 is merged and the governed public selector exists on `origin/main`.
- [x] Create `.worktrees/moo-769` from merged main on
  `codex/moo-769-csv-export-final-qa`.
- [x] Create MOO-769 under MOO-757, mark it In Progress, and preserve Gate 3 as a separate issue.
- [x] Read the project guardrails, PRD, architecture, methodology, data quality, source registry,
  UX specifications, Plan 6A, and current Atlas/profile/analyze implementation.

**Expected outcome:** Work is isolated and based on the actual governed public-read boundary.

### Task 1: Approve and checkpoint this executable plan

**Files:** This plan and Linear approval evidence only.

- [x] Review the exact file map, test-first sequence, export integrity rules, live-QA gate, and
  production exclusions with Tarik.
- [x] Obtain approval on 2026-09-02 with the response: **continue.**
- [x] Change Plan status to Approved and record the approval date and exact response.
- [x] Add the approval evidence to MOO-769.
- [ ] Commit this plan before implementation.

    git add docs/superpowers/plans/2026-09-01-csv-export-final-product-qa.md
    git commit -m "docs: approve MOO-769 implementation plan"

**Expected outcome:** The approved design and executable plan are separate reviewable commits.

**Stop gate:** Do not begin Task 2 or create/mutate a Neon branch before explicit plan approval.

---

## Phase A — Contract and governed read model

### Task 2: Define the fixed export and dictionary contract first

**Files:** Contract and contract-test files from the file map.

- [ ] Write failing tests for exact slug/header order, strict identities, metric families, missing
  states, dictionary completeness, and unknown fields.
- [ ] Define the immutable publication summary and complete 302-row export schema.
- [ ] Define one registry as the source of truth for both CSV headers and the public dictionary.
- [ ] Keep machine names stable and explanatory labels/definitions plain.
- [ ] Reject duplicate columns, duplicate GEOIDs, missing metrics, and invalid ordered membership.

    npm test --workspace @mke/contracts -- tests/atlas-export.test.ts
    npm run typecheck --workspace @mke/contracts
    git add packages/contracts
    git commit -m "feat: define MOO-769 export contract"

**Expected outcome:** Tests establish the public file contract before database or UI code exists.

### Task 3: Build the publication-pinned export repository

**Files:** Database export repository, tests, and server barrel from the file map.

- [ ] Write failing builder tests for exact 302-tract membership, GEOID order, published IDs and
  hashes, the 13+4 metric set, neighborhoods, provenance, observed zero, missing states,
  uncertainty, and exclusions.
- [ ] Write failure cases for duplicate, missing, unknown, wrong-run, unpinned, and inconsistent
  evidence.
- [ ] Implement bounded set-based parameterized reads tied to `SelectedAtlasRun` and its
  publication ID; do not make 302 per-tract profile calls.
- [ ] Use explicit publication-member joins and approved source/resource policy decisions.
- [ ] Keep parsing/building pure where possible and return only the strict contract.
- [ ] Export only the read function through `@mke/database/server`.

    npm test --workspace @mke/database -- tests/atlas-export-repository.test.ts
    npm run typecheck --workspace @mke/database
    git add packages/database
    git commit -m "feat: load MOO-769 governed tract export"

**Expected outcome:** The server can construct a complete typed export only from one internally
consistent current publication.

---

## Phase B — Safe file delivery

### Task 4: Implement server orchestration and deterministic serialization

**Files:** Data server loader/serializer files and tests from the file map.

- [ ] Write loader tests proving public-only selection and fail-closed redacted states.
- [ ] Write serializer tests before implementation, including byte-stable fixture output.
- [ ] Add safe formula neutralization before CSV quoting for all textual cells.
- [ ] Use fixed decimal/date/JSON representations and preserve observed zero separately from
  unavailable values.
- [ ] Prove identical input produces identical bytes and SHA-256.

    npm test --workspace @mke/web -- features/data/server
    npm run typecheck --workspace @mke/web
    git add apps/web/features/data/server
    git commit -m "feat: serialize MOO-769 tract evidence CSV"

**Expected outcome:** A server-only function produces safe, deterministic CSV bytes or a stable
unavailable state—never a partial file.

### Task 5: Add the fail-closed CSV route

**Files:** Route and route-test files from the file map.

- [ ] Consult current official Next.js Route Handler documentation through Context7 before
  writing framework-specific response and caching code.
- [ ] Write response tests first for status, MIME type, filename, no-store, nosniff, deterministic
  bytes, and JSON failures.
- [ ] Implement GET without accepting run/publication query parameters.
- [ ] Ensure thrown database/serialization errors are redacted and do not emit CSV headers.
- [ ] Add a static test proving no mutation/publication module is imported by the route.

    npm test --workspace @mke/web -- app/api/exports/tract-evidence.csv/route.test.ts
    npm run typecheck --workspace @mke/web
    git add apps/web/app/api/exports apps/web/features/data/server
    git commit -m "feat: deliver MOO-769 public tract CSV"

**Expected outcome:** The exact current publication can be downloaded safely, while every invalid
state fails closed with a small redacted JSON response.

---

## Phase C — Plain-language public experience

### Task 6: Add Download data navigation and Data page

**Files:** Data page, navigation, styles, and tests from the file map.

- [ ] Write component/page/navigation tests first for available and unavailable states.
- [ ] Add **Download data** to desktop and mobile primary navigation.
- [ ] Build `/data` with publication identity, full-file scope, limitations, methodology/source
  links, uncertainty help, neighborhood caveat, and the grouped dictionary.
- [ ] Use the shared contract registry for the dictionary so page copy and headers cannot drift.
- [ ] Use HeroUI Pro components where they fit and existing design tokens everywhere.
- [ ] Ensure 44px touch targets, logical headings, keyboard access, visible focus, semantic
  dictionary content, screen-reader status, forced colors, reduced motion, and no horizontal
  overflow.
- [ ] Keep all essential information visible without a tooltip or map.

    npm test --workspace @mke/web -- app/data features/data components/application-shell
    npm run lint --workspace @mke/web
    npm run typecheck --workspace @mke/web
    git add apps/web/app/data apps/web/features/data apps/web/components/application-shell \
      apps/web/app/globals.css
    git commit -m "feat: add MOO-769 plain-language Data page"

**Expected outcome:** Anyone can understand what the file contains and its limits before choosing
to download it on mobile or desktop.

### Task 7: Complete offline final product QA and fix regressions

**Files:** E2E specifications from the file map and only test-backed affected implementation
files.

- [ ] Add Data export, application shell, accessibility, and five-width final-QA browser tests.
- [ ] Exercise Atlas, tract profiles, Compare, Opportunity, and Data with available, loading,
  empty/partial, and unavailable fixtures.
- [ ] Verify shareable URLs, keyboard/focus order, semantic names, contrast, touch targets,
  reduced motion, forced colors, screen-reader alternatives, and no horizontal overflow at 375,
  430, 768, 1024, and 1440 pixels.
- [ ] Check browser console/page errors and essential non-map information.
- [ ] Fix only reproducible in-scope regressions, with a failing test before each change.
- [ ] Confirm preview data and publication controls are absent from public pages and the client
  bundle.

    npm test --workspace @mke/web
    npm run test:e2e -- tests/e2e/data-export.spec.ts tests/e2e/application-shell.spec.ts \
      tests/e2e/accessibility.spec.ts tests/e2e/final-product-qa.spec.ts
    npm run build --workspace @mke/web
    git add apps/web tests/e2e
    git commit -m "test: complete MOO-769 final product QA"

**Expected outcome:** All public MVP routes pass the approved usability, responsive,
accessibility, safety, and consistency checks using controlled local fixtures.

---

## Phase D — Separately approved live proof

### Task 8: Obtain approval for disposable live verification

Before any live action, present the exact:

- Neon project and proposed branch name;
- parent branch and seven-day expiry;
- migration state (read-only; no new migration planned);
- controlled publication fixture, including IDs and why it is not authoritative production data;
- commands and environment guards;
- verification queries and expected row/member counts; and
- cleanup/recovery procedure.

- [ ] Obtain explicit approval naming that branch and fixture.
- [ ] Record the approval in MOO-769.
- [ ] Do not use the existing production database or publish the authoritative development runs.

**Stop gate:** Without this exact approval, skip live mutation and document the limitation. Do
not weaken offline checks and do not mark live proof complete.

### Task 9: Run approved live export reconciliation and performance proof

- [ ] Create only the approved expiring child branch.
- [ ] Apply existing migrations and load only the approved controlled fixture.
- [ ] Publish only the disposable fixture through the governed MOO-768 command with development
  environment guards.
- [ ] Prove one exact publication, 302 ordered rows, 13 Equity and four Food components per
  complete tract, pinned neighborhood context, correct uncertainty/missing states, and stable
  bytes/hash across repeated downloads.
- [ ] Measure bounded query count, response time, and file size; document results without
  credentials or connection strings.
- [ ] Prove no latest inference, preview fallback, partial output, mutation, or production access.
- [ ] Remove or allow expiry of only the disposable branch according to the approved cleanup.

**Expected outcome:** The full read path is proven against production-shaped PostgreSQL data while
the authoritative runs and production remain unchanged.

---

## Phase E — Documentation, full verification, and review

### Task 10: Update operating documentation and verification evidence

**Files:** Documentation files from the file map.

- [ ] Document the Data page, file contract, public-only selector, missing/uncertainty encoding,
  neighborhood caveat, formula protection, error behavior, and support checks.
- [ ] Record fixed headers, row count, publication/run IDs, hashes, file hash/size, test counts,
  five-width results, accessibility evidence, performance, and known limitations without secrets.
- [ ] State explicitly that no production publication, mutation, or deployment occurred.

    git diff --check
    git add README.md docs
    git commit -m "docs: record MOO-769 export and QA evidence"

**Expected outcome:** Public and operator documentation accurately describe the shipped behavior
and its evidence.

### Task 11: Run the complete repository and security gate

- [ ] Run formatting/diff checks, ESLint, all workspace typechecks and unit tests, Python suites,
  controlled integration suites, full Playwright coverage, production build, and bundle checks.
- [ ] Confirm no secret-like values, generated CSVs, screenshots, browser profiles, database
  URLs, or private reports are tracked.
- [ ] Confirm route/database imports are server-only and no publication mutation enters web code.
- [ ] Confirm every changed behavior has documentation and every planned width/state is covered.
- [ ] Review the complete diff against the approved design and issue acceptance criteria.

    git diff --check origin/main...HEAD
    npm run verify
    PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest
    npm run test:e2e
    git status --short

**Expected outcome:** One clean, reproducible evidence set supports review without relying on
production.

### Task 12: Push, review, and merge only after approval

- [ ] Push `codex/moo-769-csv-export-final-qa`.
- [ ] Open a PR linked to MOO-769 and MOO-757 with the design, plan, evidence, test results, live
  proof or explicit limitation, and production exclusion.
- [ ] Wait for required GitHub checks and resolve review findings with test-backed commits.
- [ ] Ask Tarik to review the final behavior and evidence.
- [ ] Merge only on Tarik's explicit request.
- [ ] After merge, verify the main-branch commit, close MOO-769, update MOO-757, and leave MOO-758
  Gate 3 blocked until its separate candidate and approval package are ready.

**Expected outcome:** The CSV export and final public-MVP QA land through a reviewable PR, while
production publication remains a distinct governed decision.

## Completion criteria

MOO-769 is complete only when:

- the approved design and plan are committed independently;
- `/data` is understandable, responsive, accessible, and reachable everywhere;
- the CSV contains exactly the approved fixed columns and 302 ordered canonical tract rows from
  one exact governed publication;
- all evidence, missingness, uncertainty, neighborhood context, provenance, IDs, hashes, and
  versions survive the export correctly;
- unsafe/inconsistent/unpublished states emit no CSV;
- CSV bytes, headers, filename, escaping, and formula protection pass deterministic tests;
- all five widths and every public route pass final product QA;
- full repository, browser, build, bundle, and security checks pass;
- sanitized documentation and verification evidence are committed;
- the PR is reviewed and merged; and
- MOO-758 Gate 3 remains separately blocked with no production mutation or publication performed.
