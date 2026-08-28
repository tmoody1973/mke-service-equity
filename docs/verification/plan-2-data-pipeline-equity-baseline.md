# Plan 2 — Data Pipeline + Equity Baseline Verification

**Linear issue:** MOO-751

**Methodology:** Equity Baseline v1

**Offline gate date:** 2026-08-28

**Live run status:** Passed on isolated `moo-751-equity-baseline` branch, 2026-08-28

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
| `uv run pytest tests/data -q` | 184 passed, 2 integration tests deselected |
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

## Authoritative live-run checklist — passed

Only sanitized facts are recorded. Raw source files, normalized outputs, reports, and credentials
remain ignored local artifacts.

### Environment identity

- [x] Personal Neon project `wispy-glitter-41930798` confirmed without recording a connection
  string
- [x] Branch `moo-751-equity-baseline` / `br-damp-math-a5e3wtpa` confirmed non-default,
  non-primary, and `development-only`
- [x] Parent `moo-750-foundation` / `br-dark-dew-a5x4dxm6` confirmed
- [x] Seven-day expiry `2026-09-04T09:24:21Z` confirmed
- [x] Database `neondb`, role `neondb_owner`, local branch link, and branch ID confirmed
- [x] `CENSUS_API_KEY` presence confirmed without printing it

### Migration proof

- [x] PostGIS 3.6.0 enabled
- [x] Eight Plan 2 tables present
- [x] Named spatial, lifecycle, uniqueness, and foreign-key constraints verified
- [x] Database package integration test passed
- [x] Two Python integration tests passed against the disposable branch
- [x] Zero published or superseded runs before ingestion

The first live load exposed that 4,242 individually awaited parameterized inserts could outlast a
direct Neon session. The failed transaction rolled back to zero base and analytical rows. Psycopg
pipeline mode now batches those commands while preserving one atomic transaction; the corrected
load completed successfully, and rollback behavior remains covered by unit and integration tests.

### Source and normalization reconciliation

| Evidence | TIGER | ACS | PLACES |
|---|---:|---:|---:|
| Dataset version | 2020 | 2024 ACS 5-year | December 2025 release; 2023 estimates |
| Snapshot SHA-256 | `154481f2…545834` | eight group hashes below | `0579e47c…aa8e2` |
| Retrieved at | 2026-08-28 09:38:43Z | 2026-08-28 09:52:26–32Z | 2026-08-28 09:52:33Z |
| Rows/features | 1,542 statewide features | 302 rows in each of eight groups | 1,800 measure rows |
| Schema fingerprint | `9df96b3b…0106` | eight group schemas in manifests | `ab30102d…3589` |
| Canonical/matched GEOIDs | 302 Milwaukee tracts | 302 in every group | 300 positive-population tracts |
| Missing/unmatched/duplicate records | 0 / 0 / 0 | 14 explicit missing values on two zero-population tracts; 0 unmatched/duplicate GEOIDs | two zero-population tracts excluded by contract; 0 unmatched/duplicate GEOIDs |

ACS group snapshot hashes:

- `B01003`: `06ed1f4b09eaa029a4adb98b76a47aa4f5f833ad542ad4ab2084321e87620eaa`
- `B03002`: `a80b10c6b7ac2a3b7c15085bc3b95ad5d29029f3b8deaa1372e59c68832257f8`
- `C16001`: `62d61e22a1dcade21a68f38c5ddfb7608e12b206174348d0bd26fe5190758ee1`
- `B05002`: `a18916ca24248294a101d08fffcc214c6ede9a34fe748a96f8e9d70b51a7a3c2`
- `C17002`: `d5244a0038df2cbb566a6ff3da23b5f66147538b008aff764ecadac108542ba5`
- `B23025`: `bd840d814c23ad4da79599d93e3e0d5dce7eab3018bae5a423121157c46dbc73`
- `B15003`: `5e0a245842fe5fb50e1c307e82c112383e35f183ce0780add135648dd0f2dddb`
- `B25106`: `650bcb965d60bb7739d5405bfa2a363d1149bf3526c46870de37a9d7b83b124f`

- [x] TIGER GEOIDs unique, Milwaukee FIPS-contained, valid/non-empty SRID 4326 geometry and
  centroid counts reconciled
- [x] ACS required groups/variables, population, annotation, missingness, and reliability counts
  reconciled
- [x] PLACES six measures, crude value type, footnotes, missing tracts, and unmatched GEOIDs
  reconciled
- [x] Every sanitized manifest retains version, request, checksum, size, count, schema, license,
  and methodology provenance

### Run reconciliation

| Field | Authoritative value |
|---|---|
| Run ID | `502e2a04-b013-53cd-8b09-c9144862701a` |
| Methodology version | `equity-baseline-v1` |
| Registry hash | `8e31bf6f2d89963d24bb76f2074cafc8848a69ca147e6015cc83716ce5fcbfc2` |
| Input-manifest hash | `b34eaa2dcbc823ae2e145467e95de2b175066eeceac2dd7ccded4f06cdea6b8d` |
| Run fingerprint | `125f23262552c9179d6dae2be69b44b30042ee5bdfdc9c5188087d73b6d531e8` |
| Output hash | `19069c257e8f51fb4370b1ec8d04c6f823bd85e133846cf504866404c2c4e946` |
| Git commit | `af32c1df7e679320cb341a36044b107a7a072300` |
| Complete scores | 300 |
| Insufficient-data scores | 0 |
| Zero-population scores | 2 |
| Component rows | 3,900 |
| Indicator-value rows | 3,914 |
| Orphan rows | 0 |
| Final status | `validated` |
| Published/superseded runs | 0 |

- [x] Separate `fetch`, `validate`, `normalize`, `load`, `score`, and `validate-run` commands
  succeeded
- [x] One validated run exists with no partial analytical rows
- [x] `run --through validated --verify-existing` reused the run ID and fingerprint
- [x] Independently recomputed output hash matched
- [x] Repeat execution created no duplicate source, value, component, or score rows
- [x] All evidence and committed manifests passed a credential and absolute-path review

## Failure recovery

On a failure, preserve the local redacted report and immutable source snapshot. Confirm the main
transaction left no partial base or analytical rows. If a draft run existed, verify only the
separate failure transaction changed it to `failed`. Correct the upstream source,
configuration, or validation issue and rerun the attributable stage; do not publish, manually
force a status, substitute another source, or convert missing data to zero.
