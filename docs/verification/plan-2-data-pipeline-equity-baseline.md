# Plan 2 — Data Pipeline + Equity Baseline Verification

**Linear issue:** MOO-751

**Methodology:** Equity Baseline v1

**Offline gate date:** 2026-08-28

**Live run status:** Pending isolated Task 10 execution

## Scope and evidence boundary

This record separates deterministic offline proof from authoritative live-source and database
proof. Offline success establishes code, fixtures, schema contracts, orchestration behavior, and
application compatibility. It does not establish that official sources were fetched or that a
Neon run was validated.

Plan 2 may create only `draft`, `validated`, and `failed` score runs. It must leave both
`published` and `superseded` counts at zero. Raw downloads, normalized extracts, reports,
credentials, connection strings, and local absolute paths must never appear in committed
evidence.

## Offline verification — passed

Run from the MOO-751 worktree with the locked Node.js 24 and Python 3.13 environments:

| Check | Observed result |
|---|---|
| `uv sync --locked` | 31 packages resolved; 28 checked |
| `uv run ruff check pipelines tests/data` | passed |
| `uv run ruff format --check pipelines tests/data` | 30 files already formatted |
| `uv run mypy pipelines` | success across 19 source files |
| `uv run pytest tests/data -q` | 182 passed, 2 integration tests deselected |
| `npm run lint` | passed |
| `npm run typecheck` | all workspaces passed |
| `npm run test` | 9 files / 30 tests passed across workspaces |
| `npm run build` | Next.js production build passed |
| `git diff --check` | passed |

The offline suite covers immutable snapshot collisions, credential sanitization, registry
validation, canonical tract geometry, ACS annotations/jam values/MOEs/reliability, PLACES
measure and confidence-interval validation, exact average-rank ties, strict completeness,
deterministic golden output, stage ordering, stop-on-failure, development-only database guards,
transaction rollback, failure redaction, lifecycle boundaries, run reuse, and output-hash
comparison. The concrete CLI wiring also has fixture proof for exact stage dispatch and a
complete two-tract persistence plan: 54 idempotent base statements, 26 indicator values and
components, two scores, deterministic input/output hashes, and no publication SQL.

Fixture scoring golden output SHA-256:

```text
ea1ecc3bc08b2a4140a17250262b8b05443b51245d7b5c1ccc97b0b630d087e8
```

That fixture is proof of deterministic implementation behavior only; it is not an authoritative
Milwaukee County output.

## Quality-state interpretation

- `verified`, `provisional`, and `stale` retain a usable numeric indicator value.
- `missing`, `suppressed`, or `conflicting` retain a null value; missing is never zero.
- `complete` requires positive population and all 13 usable indicators.
- `insufficient_data` has no score or band and lists its missing/invalid indicator reasons.
- `ineligible_zero_population` has no score or band.
- ACS coefficient-of-variation and PLACES confidence metadata remain attached to the source
  values and scoring components.
- A failed command stops at its first failing stage and emits a secret-redacted JSON report.

The complete formulas and weights remain in the approved
[methodology](../methodology/equity-baseline.md) and executable registry; this evidence record
does not redefine them.

## Authoritative live-run checklist — pending

Record sanitized facts only after the isolated run succeeds.

### Environment identity

- [ ] Personal Neon project confirmed; project ID recorded without a connection string
- [ ] Branch `moo-751-equity-baseline` confirmed non-default and `development-only`
- [ ] Parent `moo-750-foundation` confirmed
- [ ] Seven-day expiry confirmed
- [ ] Database, role, branch ID, and `NEON_BRANCH` match confirmed
- [ ] `CENSUS_API_KEY` presence confirmed without printing it

### Migration proof

- [ ] PostGIS enabled
- [ ] Eight Plan 2 tables present
- [ ] Named spatial, lifecycle, uniqueness, and foreign-key constraints verified
- [ ] Database package integration tests passed
- [ ] Python integration tests passed against the disposable branch
- [ ] Zero published or superseded runs before ingestion

### Source and normalization reconciliation

| Evidence | TIGER | ACS | PLACES |
|---|---:|---:|---:|
| Dataset version | pending | pending | pending |
| Snapshot SHA-256 | pending | pending | pending |
| Retrieved at | pending | pending | pending |
| Rows/features | pending | pending | pending |
| Schema fingerprint | pending | pending | pending |
| Canonical/matched GEOIDs | pending | pending | pending |
| Missing/unmatched/duplicate records | pending | pending | pending |

- [ ] TIGER GEOIDs unique, Milwaukee FIPS-contained, valid/non-empty SRID 4326 geometry and
  centroid counts reconciled
- [ ] ACS required groups/variables, population, annotation, missingness, and reliability counts
  reconciled
- [ ] PLACES six measures, crude value type, footnotes, missing tracts, and unmatched GEOIDs
  reconciled
- [ ] Every sanitized manifest retains version, request, checksum, size, count, schema, license,
  and methodology provenance

### Run reconciliation

| Field | Authoritative value |
|---|---|
| Run ID | pending |
| Methodology version | pending |
| Registry hash | pending |
| Input-manifest hash | pending |
| Run fingerprint | pending |
| Output hash | pending |
| Git commit | pending |
| Complete scores | pending |
| Insufficient-data scores | pending |
| Zero-population scores | pending |
| Component rows | pending |
| Indicator-value rows | pending |
| Orphan rows | pending |
| Final status | pending |
| Published/superseded runs | pending; must be 0 |

- [ ] Separate `fetch`, `validate`, `normalize`, `load`, `score`, and `validate-run` commands
  succeeded
- [ ] One validated run exists with no partial analytical rows
- [ ] `run --through validated --verify-existing` reused the run ID and fingerprint
- [ ] Independently recomputed output hash matched
- [ ] Repeat execution created no duplicate source, value, component, or score rows
- [ ] All evidence and committed manifests passed a credential and absolute-path review

## Failure recovery

On a failure, preserve the local redacted report and immutable source snapshot. Confirm the main
transaction left no partial base or analytical rows. If a draft run existed, verify only the
separate failure transaction changed it to `failed`. Correct the upstream source,
configuration, or validation issue and rerun the attributable stage; do not publish, manually
force a status, substitute another source, or convert missing data to zero.
