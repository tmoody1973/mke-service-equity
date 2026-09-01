# Plan 6A — Governed Food Equity Publication Lifecycle Implementation Plan

> **Execution rule:** Implement one task at a time in the MOO-768 worktree. Task 2 is a protected
> human-approval gate. Contract approval does not authorize schema implementation, an expiring
> Neon branch, or any publication action until this executable plan is also approved. Development
> verification uses controlled fixtures only. Production publication remains blocked behind
> Gate 3.

**Goal:** Add a deterministic, auditable, forward-only publication lifecycle that exposes one
internally consistent Food Equity release and its exact pinned Equity Baseline through the
server-only public Atlas selector.

**Architecture:** PostgreSQL owns lifecycle enforcement, release membership, immutability,
atomic replacement, and current-release uniqueness. Strict TypeScript contracts define canonical
manifest, command, audit, and public-selector boundaries. A separate server-only CLI performs
read-only dry runs and invokes the controlled database operation. The web application can only
read the singular current release and fails closed when it is absent or inconsistent.

**Tech stack:** Existing Node.js 24, TypeScript 6.0.3, Drizzle ORM 0.45.2, Neon PostgreSQL,
PostGIS, Zod 4.4.3, Vitest 4.1.11, Python 3.13 verification tooling, npm workspaces, and GitHub
Actions. Add a direct workspace CLI runner only if required by the approved implementation; do
not reuse a transitive dependency implicitly.

**Contract:** docs/superpowers/specs/2026-09-01-moo-768-governed-publication-design.md

**Tracking:** Linear MOO-768 — Plan 6A — Governed Food Equity publication lifecycle.

**Plan status:** Approved by Tarik on 2026-09-01 with the explicit response
“Approve MOO-768 implementation plan.” Tasks 3–8 may proceed offline. Task 9 still requires a
separate approval for the exact expiring Neon development branch, and production publication
remains blocked behind Gate 3.

## Fixed execution decisions

1. Work only in .worktrees/moo-768 on codex/moo-768-publication-lifecycle.
2. Preserve commit add20f4 as the separately approved contract checkpoint.
3. Add only forward migration 0005 after the existing 0004 neighborhood migration. Never edit an
   applied migration.
4. Keep the authoritative Equity and Food development runs validated and unchanged throughout
   implementation and fixture verification.
5. Use controlled fixture runs for publish, replace, withdraw, retry, and failure tests.
6. A release is one exact Food run, its pinned baseline, relational score/component/value
   membership, exact snapshots/resources, and explicit redistribution decisions.
7. Current means the zero-or-one atlas_publications row in published state. Do not infer latest.
8. A replacement and all affected run/release transitions occur in one transaction under one
   release-channel advisory lock.
9. Re-publication and superseded-to-current are prohibited. Rollback is a forward replacement or
   an approved withdrawal, never deletion or status reversal.
10. A direct web deployment, browser request, pipeline command, Atlas query, or Server Action has
    no publication capability.
11. The application reader and publication operator are separate production capabilities.
12. All public selector and command SQL is parameterized and server-only.
13. Every release member and source/resource decision is explicit. Category, latest timestamp,
    proximity, or mutable source pointers cannot determine public membership.
14. EmergencyFood_MKE_2024 remains prohibited. The separately approved Pantries 2026 static
    display layer is not silently folded into the analytical publication bundle.
15. Published or superseded analytical/member rows are immutable and non-deletable.
16. Safe retries require the same idempotency key and byte-identical canonical request.
17. Every command produces secret-free audit evidence. No connection string, API key, raw
    environment value, or credential-bearing URL enters a report.
18. Actual production publication, including the authoritative validated runs, requires a later
    Gate 3 approval naming the exact candidate and evidence.
19. Commit each independently understandable task with MOO-768 in the message.
20. Do not mark MOO-768 Done until live development-branch proof, full repository verification,
    security review, documentation, PR review, and user approval are complete.

## Planned interface and file map

### Publication contracts

- packages/contracts/src/atlas/publication.ts
  - release state and redistribution decision enums;
  - canonical release manifest schema;
  - dry-run, publish, reconcile, withdrawal, and audit schemas;
  - strict current-publication summary schema.
- packages/contracts/src/atlas/run.ts
  - published selection includes immutable publication ID and published timestamp;
  - validated preview remains unchanged and carries no fake publication identity.
- packages/contracts/src/atlas/index.ts and packages/contracts/src/index.ts
  - public type/schema exports only.
- packages/contracts/tests/atlas-publication.test.ts and atlas-run.test.ts
  - strict parsing, canonical sorting, hash inputs, and unavailable-state tests.

### Database schema and migration

- packages/database/src/schema/publication.ts
  - atlas_publications;
  - score, Equity component, Food component, snapshot, and resource member tables;
  - append-only audit events;
  - enums, foreign keys, checks, unique/partial indexes, and restrict behavior.
- packages/database/src/schema/equity-baseline.ts and food-equity.ts
  - reviewed lifecycle enum/check updates only.
- packages/database/src/schema/index.ts
  - schema exports.
- packages/database/drizzle/0005_governed_publication.sql
  - forward-only SQL, lifecycle/immutability guards, grants, and controlled operation.
- packages/database/drizzle/meta files
  - generated Drizzle snapshot and journal update.
- packages/database/tests/publication-schema.test.ts,
  publication-schema.integration.test.ts, and migration-scope.test.ts
  - static and live schema guarantees.

### Canonical manifest and policy

- packages/database/src/publication/manifest.ts
  - deterministic canonicalization and SHA-256 bundle fingerprint;
  - exact member IDs/fingerprints and explicit source/resource decisions;
  - no latest/category inference.
- packages/database/src/publication/policy.ts
  - closed redistribution vocabulary and required attribution/terms/warnings;
  - prohibited EmergencyFood_MKE_2024 decision;
  - no automatic direct-display approval for FNS resources.
- packages/database/src/publication/reconciliation.ts
  - exact-run lineage, membership, counts, hashes, and quality checks.
- packages/database/tests/publication-manifest.test.ts,
  publication-policy.test.ts, and publication-reconciliation.integration.test.ts.

### Controlled publication operation

- packages/database/src/publication/repository.ts
  - parameterized dry-run/reconcile reads;
  - controlled transactional publish and withdraw calls;
  - typed stable failure codes without raw database errors.
- packages/database/src/publication/command.ts
  - command option parsing, environment/database guard, confirmation, idempotency, and reports.
- packages/database/src/publication/cli.ts
  - server-only entry point; no web export.
- packages/database/src/publication/report.ts
  - canonical secret-free report writer under ignored data/reports/publication.
- packages/database/package.json and root package scripts
  - explicit CLI/test commands.
- packages/database/tests/publication-repository.test.ts,
  publication-repository.integration.test.ts, publication-command.test.ts, and
  publication-report.test.ts.

### Public read boundary

- packages/database/src/atlas/run-selector.ts
  - singular current-publication query and strict consistency validation;
  - unchanged exact validated-preview branch.
- packages/database/src/server.ts
  - export only the read selector, never mutation functions.
- Atlas, profile, Compare, and Opportunity repositories
  - continue receiving one SelectedAtlasRun; use publication identity where public consistency or
    caching requires it.
- packages/database/tests/atlas-run-selector.test.ts and integration tests.
- packages/contracts and web loader/component tests affected by the richer published summary.

### Operations, security, and evidence

- docs/data/schema.md, data-quality.md, methodology/scoring-governance.md,
  data/ingestion.md, development/database.md, architecture/system.md, and README.md.
- docs/operations/publication-runbook.md
  - dry-run, publish, reconcile, replace, withdraw, monitoring, incident, and Gate 3 procedure.
- docs/verification/plan-6a-governed-publication-lifecycle.md
  - sanitized exact evidence and limitations.
- tests/security or repository checks proving no client/web mutation import.
- GitHub workflow changes only when necessary to enforce an already approved gate; no workflow may
  auto-publish.

---

## Phase 0 — Approval and workspace gates

### Task 0: Confirm dependency, scope, and isolated workspace

- [x] Confirm MOO-756 is merged and MOO-768 is the P0 child of MOO-757.
- [x] Create .worktrees/moo-768 from merged origin/main.
- [x] Use codex/moo-768-publication-lifecycle.
- [x] Mark MOO-768 In Progress and record that no schema/publication mutation occurred.
- [x] Audit README, PRD, architecture, methodology, source registry, data quality, logical schema,
  deployment/database docs, current selectors, run schemas, migrations, and lifecycle tests.

**Expected outcome:** Work is isolated and the plan is based on the repository's real boundaries.

### Task 1: Approve and checkpoint the publication contract

- [x] Document state machines, permissions, atomicity, one-current rule, rollback/supersession,
  resource policy, command, audit metadata, selector, and recovery.
- [x] Obtain explicit response: Approve MOO-768 publication contract.
- [x] Record approval in the contract and Linear.
- [x] Commit the approved contract independently as add20f4.

**Expected outcome:** The issue's pre-schema contract gate is satisfied without a code or data
change.

### Task 2: Approve this executable implementation plan

**Files:** This plan and Linear approval evidence only.

- [ ] Review exact file boundaries, fixture strategy, migration sequence, CLI controls, live branch
  plan, verification gates, and production exclusion with Tarik.
- [x] Obtain explicit response: **Approve MOO-768 implementation plan.**
- [x] Change Plan status to Approved, record the approval date, and add Linear evidence.
- [ ] Commit this approved plan before schema implementation.

    git add docs/superpowers/plans/2026-09-01-governed-publication-lifecycle.md
    git commit -m "docs: approve MOO-768 implementation plan"

**Expected outcome:** Contract and executable plan are separately approved and committed.

**Stop gate:** Do not start Task 3 or create/mutate a Neon branch before explicit approval.

---

## Phase A — Strict contracts and forward schema

### Task 3: Define publication contracts before storage

**Files:** Contract files and tests from the publication-contract file map.

- [ ] Write failing tests first for strict release state, member roles, redistribution decisions,
  UUID/hash/timestamp fields, idempotency, approval, and confirmation inputs.
- [ ] Define canonical manifest collections with deterministic sort keys and duplicate rejection.
- [ ] Keep operational metadata separate from the bundle-fingerprint input.
- [ ] Model published run summaries with publication ID/timestamp while leaving validated-preview
  contracts explicit and unchanged.
- [ ] Reject unknown fields, empty approval/actor/reason values, malformed hashes, duplicate
  members, prohibited public-display decisions, and unbounded audit payloads.

    npm test --workspace @mke/contracts -- tests/atlas-publication.test.ts tests/atlas-run.test.ts
    npm run typecheck --workspace @mke/contracts
    git add packages/contracts
    git commit -m "feat: define MOO-768 publication contracts"

**Expected outcome:** Strict tests define a closed, deterministic release boundary without adding
any migration or database connection.

### Task 4: Add reviewed forward schema and lifecycle guards

**Files:** Schema, migration, metadata, and schema tests from the file map.

- [ ] Write static migration/schema tests before generating SQL.
- [ ] Extend Food status with published and superseded and update only the reviewed completion,
  output-hash, and validation checks.
- [ ] Replace Plan 2/3 transition guards with the approved forward-only state machines while
  preserving draft-to-validated/failed behavior.
- [ ] Add publication/member/audit tables, explicit FKs, checks, unique constraints, and one
  partial unique current-release index.
- [ ] Add append-only release/audit protections and update/delete guards for every released
  analytical, value, snapshot, resource, and membership row.
- [ ] Add a controlled database operation and required grants without exposing table DML to the
  application reader or pipeline writer.
- [ ] Prove invalid direct inserts/status changes and partial member sets cannot become current.
- [ ] Confirm migration 0005 is additive/forward-only and does not edit 0000–0004.

    npm test --workspace @mke/database -- tests/publication-schema.test.ts tests/migration-scope.test.ts
    npm run typecheck --workspace @mke/database
    git add packages/database/src/schema packages/database/drizzle packages/database/tests
    git commit -m "feat: add MOO-768 governed publication schema"

**Expected outcome:** Offline tests prove the intended SQL objects and transition rules. No live
database has been touched.

### Task 5: Build deterministic manifest and redistribution policy

**Files:** Manifest/policy/reconciliation modules and unit tests.

- [ ] Write failing golden tests for stable manifest bytes and bundle fingerprint regardless of
  storage query order.
- [ ] Reject duplicate, missing, wrong-run, hash-mismatched, or ambiguous member IDs.
- [ ] Require exact score pairs for every canonical geography and exact components/value rows for
  both run systems.
- [ ] Require all contributing source snapshots and the explicit scoring resource inventory.
- [ ] Require terms reference, attribution, warning, and one redistribution decision per
  source/resource membership.
- [ ] Prove EmergencyFood_MKE_2024 can only be prohibited_public_use.
- [ ] Prove no FNS direct-display decision appears automatically and Pantries 2026 is not inferred
  into the analytical bundle.
- [ ] Keep missing and unavailable facts explicit; never turn them into zero or omit their
  exclusion evidence.

    npm test --workspace @mke/database -- tests/publication-manifest.test.ts tests/publication-policy.test.ts
    npm run typecheck --workspace @mke/database
    git add packages/database/src/publication packages/database/tests
    git commit -m "feat: reconcile MOO-768 release manifests"

**Expected outcome:** Identical exact membership yields one stable fingerprint; every ambiguity or
unapproved public resource fails closed.

---

## Phase B — Controlled command and public selector

### Task 6: Implement transactional publish, replace, and withdraw

**Files:** Publication repository and database integration tests.

- [ ] Write controlled fixture integration tests before repository implementation.
- [ ] Acquire the single release-channel advisory lock and compare the expected current release.
- [ ] Lock/revalidate candidate runs, hashes, validation evidence, and exact member rows.
- [ ] Insert release/member rows and promote the candidate atomically.
- [ ] Replace by superseding the current Food/release and only superseding its baseline when the
  new release does not reuse it.
- [ ] Withdraw only the exact current release under separate approval, leaving zero current.
- [ ] Enforce one current release through transaction checks plus the partial unique index.
- [ ] Prove a forced failure at every mutation stage rolls back all publication/status changes.
- [ ] Prove published/superseded analytical content and audit history cannot update or delete.

    npm exec --workspace @mke/database -- vitest run tests/publication-repository.integration.test.ts
    npm run typecheck --workspace @mke/database
    git add packages/database/src/publication packages/database/tests
    git commit -m "feat: transact MOO-768 publication changes"

**Expected outcome:** Fixture tests prove atomic first publication, replacement, baseline reuse,
withdrawal, concurrency defense, and zero partial state after failure.

### Task 7: Add guarded CLI, audit events, and secret-free reports

**Files:** Command/CLI/report files, scripts, dependency lock, and tests.

- [ ] Write argument/environment/redaction/idempotency tests first.
- [ ] Implement dry-run, publish, reconcile, and withdraw as separate explicit commands.
- [ ] Require exact environment, candidate/current IDs, approval ID, idempotency key, dry-run
  hash, actor, reason, and confirmation values.
- [ ] Refuse production without the Gate 3 guard inputs; refuse any write when database identity
  cannot be safely checked.
- [ ] Persist append-only attempted and outcome events where reachable and always emit a
  secret-free local report.
- [ ] Return prior success for an identical safe retry; reject an idempotency-key collision.
- [ ] Ensure raw exceptions, URLs, credentials, and environment values are redacted.
- [ ] Keep the CLI outside packages/database/src/server.ts and every web import graph.

    npm test --workspace @mke/database -- tests/publication-command.test.ts tests/publication-report.test.ts
    npm run typecheck --workspace @mke/database
    git add packages/database package.json package-lock.json
    git commit -m "feat: operate MOO-768 publication safely"

**Expected outcome:** Offline tests prove the command cannot accidentally target production,
cannot publish without the exact dry run/approval, and emits no secrets.

### Task 8: Replace the public fail-closed stub with the governed selector

**Files:** Atlas run contract, run selector, database exports, downstream tests.

- [ ] Write published-selector tests before changing the no_published_run branch.
- [ ] Query the zero-or-one published release with exact Food/Baseline IDs, hashes, status,
  publication ID/time, and member summary; do not order by date or query latest.
- [ ] Reject missing, duplicate, superseded, hash-mismatched, incompletely manifested, or
  prohibited-public-member releases.
- [ ] Preserve the exact guarded validated-preview query and its private/dynamic behavior.
- [ ] Include immutable publication identity in public response/cache identity.
- [ ] Prove Atlas, profile, Compare, and Opportunity receive the same SelectedAtlasRun and cannot
  switch releases during one request.
- [ ] Confirm packages/database/src/server.ts exports no publication mutation function.

    npm test --workspace @mke/database -- tests/atlas-run-selector.test.ts
    npm test --workspace @mke/contracts -- tests/atlas-run.test.ts
    npm test --workspace @mke/web -- run-selector load-atlas load-profile load-comparison load-opportunity
    npm run typecheck
    git add packages/contracts packages/database apps/web
    git commit -m "feat: select MOO-768 public releases"

**Expected outcome:** Public mode reads one governed bundle or fails closed; validated preview
remains unchanged and no web request can publish.

---

## Phase C — Live development proof and operational documentation

### Task 9: Approve and create the expiring Neon verification branch

**Human gate:** Ask Tarik to approve the exact branch before any creation or migration.

- [ ] Resolve and record the existing Neon project, source branch containing the validated Plan 2
  and Plan 3 runs, database, role, non-default status, and planned seven-day expiry without
  printing a connection string.
- [ ] Propose child branch moo-768-publication-lifecycle with a seven-day TTL.
- [ ] Obtain explicit approval for that exact development-only branch.
- [ ] Create/checkout it, verify identity, and record sanitized IDs/expiry.
- [ ] Confirm the authoritative run IDs, statuses, output hashes, fingerprints, counts, and zero
  current publications before migration.

**Expected outcome:** A confirmed disposable branch contains untouched authoritative validated
runs and no published release.

### Task 10: Apply migration and independently verify schema/permissions

- [ ] Apply only migrations 0000–0005 to the approved branch.
- [ ] Verify PostGIS, journal scope, enums, tables, indexes, partial uniqueness, FKs, triggers,
  controlled operation, grants, and application/pipeline denial paths with independent SQL.
- [ ] Reconfirm authoritative run hashes, fingerprints, counts, and validated statuses are
  unchanged.
- [ ] Run database TypeScript integration and Python integration gates against this branch only.

    npm run db:migrate --workspace @mke/database
    npm run test:integration --workspace @mke/database
    uv run pytest tests/data -q -m integration

**Expected outcome:** The forward migration is correct in reality and preserves all validated
development evidence.

### Task 11: Exercise controlled fixture lifecycle and reconcile reality

- [ ] Insert controlled validated fixture pairs that cannot be mistaken for authoritative runs.
- [ ] Dry-run and publish fixture A; independently reconcile every member/hash/count/decision.
- [ ] Safely retry the identical request and prove no duplicate release/member/audit success.
- [ ] Prove all invalid transitions: draft/failed publication, missing/mismatched baseline,
  incomplete validation, wrong hash, missing member, duplicate current, re-publication,
  published-content mutation/deletion, and superseded-as-current.
- [ ] Publish fixture B, prove fixture A becomes superseded atomically, and prove exact selector
  switch with no partial response.
- [ ] Exercise rollback-by-forward-replacement logic and approved withdrawal on fixtures.
- [ ] Force transaction failure and prove no partial release/status survives.
- [ ] Prove prohibited emergency-food and unapproved resources never enter a public member set.
- [ ] Confirm authoritative Plan 2/3 runs remain validated, unchanged, and unpublished.

**Expected outcome:** Live evidence satisfies every MOO-768 verification item without publishing
authoritative or production data.

### Task 12: Write runbook, monitoring, incident, and recovery documentation

**Files:** Operations/runbook plus core docs and verification record.

- [ ] Document exact dry-run, publish, reconcile, replace, withdraw, safe retry, and report
  handling procedures without credentials.
- [ ] Document Gate 3 approval evidence, role separation, expected-current compare-and-swap,
  monitoring checks, current selector, cache identity, and source licensing limitations.
- [ ] Document incident responses for rejected dry run, failed transaction, no current release,
  selector inconsistency, post-release application fault, suspected credentials, and source-term
  change.
- [ ] State that operators never hand-edit statuses, members, hashes, or pointers.
- [ ] Update schema, ingestion, database, architecture, scoring governance, data quality, and
  README behavior only where the implementation now differs.
- [ ] Record sanitized live commands, counts, hashes, test outcomes, branch TTL, and limitations.

    git add README.md docs
    git commit -m "docs: operate and verify MOO-768 publication"

**Expected outcome:** A different authorized operator can safely understand the process and its
stop conditions without seeing a secret or assuming production approval.

---

## Phase D — Security, full verification, review, and delivery

### Task 13: Prove permission, web-boundary, and secret controls

- [ ] Test application reader SELECT boundary and denial of publication operation/table mutation.
- [ ] Test pipeline writer cannot publish.
- [ ] Test publication operator can execute only the controlled operation and required reads.
- [ ] Prove browser/client bundles contain no database/publication credentials, mutation exports,
  approval IDs, or CLI code.
- [ ] Prove Next.js build/start, Vercel deploy hooks, and ordinary public routes cannot invoke a
  publication write.
- [ ] Run GitGuardian or the repository's approved secret scanner on the complete branch diff.
- [ ] Review SQL injection, identifier allowlists, parameterization, report path safety, and
  redaction behavior.

**Expected outcome:** Publication is a server-only least-privilege capability with no web or
deployment path.

### Task 14: Run full offline and isolated live verification

- [ ] Run focused contract/database/CLI/selector suites.
- [ ] Run the entire repository gate.
- [ ] Run migration/integration tests on the approved expiring Neon branch.
- [ ] Re-run final read-only reconciliation after all tests.
- [ ] Confirm no authoritative run status/hash/count changed and no production connection was
  used.

    npm run verify
    uv run pytest -q
    npm run test:integration --workspace @mke/database
    git diff --check

**Expected outcome:** All deterministic, application, migration, integration, security, and
documentation gates pass with exact recorded evidence.

### Task 15: Review, PR, and Gate 3 stop

- [ ] Review every commit/diff against the approved contract and MOO-768 acceptance criteria.
- [ ] Push codex/moo-768-publication-lifecycle and open a PR linked to MOO-768.
- [ ] Run CI, CodeRabbit, secret scanning, and resolve substantive review findings.
- [ ] Obtain Tarik's approval to merge after evidence review.
- [ ] Merge and record the merge commit/PR in Linear.
- [ ] Mark MOO-768 Done only after merge and evidence.
- [ ] Leave production publication unperformed. Create or advance the separate Gate 3 release
  decision with exact candidate/dry-run evidence only when Tarik explicitly requests it.

**Expected outcome:** The governed mechanism is merged and proven, while public production data
remains unchanged until Gate 3.

## Definition of done

MOO-768 is complete only when:

- the approved contract and plan are implemented without silent deviation;
- the forward schema and controlled operation pass offline and live development tests;
- one-current uniqueness, atomic replacement, forward-only recovery, and immutability are proven;
- exact analytical/source/resource membership and redistribution policy reconcile;
- the public selector is server-only, deterministic, and fail-closed;
- application/pipeline roles cannot publish and no web/deployment path can mutate data;
- authoritative validated runs remain unchanged and unpublished;
- runbook, verification evidence, security checks, full tests, PR review, user approval, and merge
  are complete; and
- no production publication has occurred without Gate 3.

## Approval requested

Approval authorizes Tasks 3–8 offline implementation. Task 9 still requires a separate approval
for the exact expiring Neon branch. Actual production publication remains separately gated.

Required response: **Approve MOO-768 implementation plan.**
