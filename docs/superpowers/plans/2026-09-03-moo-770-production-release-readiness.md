# MOO-770 — Production release readiness plan

**Branch:** `codex/moo-770-production-release`  
**Gate:** preparation approved; MOO-758 Gate 3 remains required for any production mutation,
publication, or deployment.

## Task 1 — Preserve the real unavailable-data states

Write failing contract and repository tests covering the actual validated candidate shape:

- 302 canonical tracts;
- Equity: 300 complete, 2 ineligible-zero-population;
- Food: 299 complete, 2 ineligible-zero-population, 1 insufficient-data;
- fixed CSV column family with explicit unavailable states;
- no fabricated value, percentile, weight, contribution, source, or neighborhood assignment.

Update only the server-side export representation needed to make all public routes and the CSV
agree. Verify at 375, 430, 768, 1024, and 1440 px and through assistive-technology semantics.

## Task 2 — Build a production-promotion runbook

Document a reviewed, replayable procedure that:

- inventories and verifies source/resource/neighborhood lineage from the candidate;
- applies reviewed migrations to the empty production database only after a production-specific
  migration authorization;
- promotes data through an approved controlled import/migration boundary rather than manual DML;
- creates reader/operator role separation and proves the reader cannot publish;
- records only IDs, counts, hashes, and outcomes—never credentials or connection strings.

This task produces no production migration, data transfer, or credential change.

## Task 3 — Prepare Vercel production configuration

Verify the configured project, root directory, framework, Node version, and environment-variable
names. Prepare the precise server-only variable checklist and post-deploy checks. Do not add a
production variable or deploy before MOO-758 Gate 3.

## Task 4 — Build the MOO-758 approval package

After the candidate data is safely available in a reviewed release target, build the canonical
manifest and run the mandatory production dry run. Stop and present its exact candidate IDs,
expected current publication, bundle fingerprint, source/resource decisions, counts, dry-run hash,
and proposed approval ID to Tarik.

## Task 5 — Gate 3 execution, only after explicit approval

Run the controlled publish command, immediately reconcile, deploy to Vercel production, verify
the public URL and CSV download, scan deployment errors, and record sanitized evidence. This task
is blocked until the user expressly approves the exact MOO-758 Gate 3 package.
