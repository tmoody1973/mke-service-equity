# Plan 3 Food Data, Accessibility, and Priority verification

## Status

- Linear issue: `MOO-753`
- Branch: `codex/moo-753-food-data-access-priority`
- Task 11 implementation commit: `df859e6`
- Verification date: 2026-08-29 (America/Chicago)
- Current result: offline implementation gate passed; authoritative live run not yet executed
- Publication state: unavailable by design; no Plan 3 publish command or published status exists

This record separates reproducible offline evidence from later authoritative-source and disposable
Neon evidence. A passing fixture suite is not proof that current upstream sources, the local PBF,
the validator JAR, or the development database are available or unchanged.

## Approved analytical contract

The authoritative calculation, classification, routing, uncertainty, and Priority rules are in
[`docs/methodology/food-equity.md`](../methodology/food-equity.md). The executable registry is
`pipelines/food_equity/registry.toml`. This verification record does not duplicate formulas.

Guardrails verified offline:

- deterministic Python calculations only; no LLM input to acquisition, classification, routing,
  scores, bands, or Priority;
- exact pinned Equity Baseline run and output hash;
- no missing-to-zero conversion and no straight-line routing fallback;
- name text and SNAP authorization never imply full-service classification;
- contextual emergency-food counts are persisted but excluded from score components and the
  score-input fingerprint;
- unknown emergency-resource activity remains null and produces missing context, not zero;
- all source, version, metric, lineage, component, score, lifecycle, and output-hash writes use
  parameter binding and deterministic natural identities;
- the CLI exposes no publication or arbitrary status transition.

## Offline gate

The complete Task 12 offline gate passed on 2026-08-29:

| Check | Result |
|---|---|
| `uv sync --locked` | 37 packages resolved; 34 checked |
| Ruff check | passed |
| Ruff format check | 78 files already formatted |
| mypy | 45 source files; no issues |
| Python data tests | 564 passed; 12 integration tests deselected |
| ESLint | passed |
| TypeScript typecheck | all workspaces passed |
| JavaScript tests | web 6, contracts 3, database 29, design system 1 passed |
| Next.js production build | passed; `/`, `/_not-found`, and database health route built |
| `git diff --check` | passed |

Food-specific Task 11 proof also passed: 380 tests with 10 opt-in database checks deselected.
Those skips are expected until `DATABASE_URL_UNPOOLED` and
`MKE_PIPELINE_ENV=development` target the confirmed disposable branch.

## Runtime inputs

The authoritative run must resolve these names without printing values:

```text
CENSUS_API_KEY
MKE_FOOD_WALKING_NETWORK_PATH
MKE_FOOD_CLASSIFICATION_EVIDENCE_PATH
MKE_FOOD_CLASSIFICATION_EVIDENCE_SHA256
MKE_GTFS_VALIDATOR_JAR
MKE_PIPELINE_ENV=development
DATABASE_URL_UNPOOLED
```

The walking PBF and classification evidence must be workspace-bounded regular files. The
validator may live under ignored `.tools/`. Plan 2's exact TIGER fetch state and pinned validated
baseline must be present. Reports, raw data, normalized data, restricted partner data, validator
output, absolute local paths, and secrets remain uncommitted.

## Pending authoritative verification

Do not mark MOO-753 complete until every item below has attributable evidence.

### Neon identity and migration

- [ ] Personal project ID recorded without a connection string.
- [ ] Branch `moo-753-food-equity` is non-default, development-only, and has a seven-day TTL.
- [ ] Parent is the approved Plan 2 branch containing baseline run
  `502e2a04-b013-53cd-8b09-c9144862701a`.
- [ ] Branch ID, parent ID, expiry, database, and role are recorded.
- [ ] Migrations `0000` through `0003`, PostGIS, Plan 2/3 tables, constraints, and lifecycle
  triggers are independently verified.
- [ ] The Python and TypeScript database integration suites pass.
- [ ] No Plan 3 row is published and no Food foreign-key orphan exists.

### Official sources and stage execution

- [ ] `fetch`, `validate`, `normalize`, `classify`, `accessibility`, `load`, `score`, and
  `validate-run` each succeed separately.
- [ ] Seven source manifests plus the separate classification-evidence manifest are sanitized and
  attributable.
- [ ] The Plan 2 TIGER checksum matches the Food bundle pointer.
- [ ] SRAM, FNS, ACS, origin, GTFS, PBF, and emergency-context hashes and row/feature counts are
  recorded.
- [ ] The pinned MobilityData validator version/hash and GTFS Last-Modified, feed validity, and
  analysis dates are recorded.
- [ ] Walking graph node/edge/hash counts, resource snap exclusions, disconnected origins, and
  unreachable states reconcile.
- [ ] Retail type, active interval, full-service, override, ambiguous, and unverified counts
  reconcile without name inference.
- [ ] Emergency type/freshness/activity/hours states reconcile and remain non-scoring.

### Run, repeatability, and trace review

- [ ] Exactly 302 scores reconcile to 300 complete and 2 zero-population rows, with 1,200 score
  components and the exact 302-by-10 persisted metric grid.
- [ ] Registry, manifest, scoring-input, run, and canonical-output hashes are recorded.
- [ ] `run --through validated --verify-existing` returns the same run ID and output hash without
  duplicate source, resource, metric, component, or score rows.
- [ ] High-, middle-, low-, and insufficient/zero-population tract traces are followed from raw
  source through classification, access metrics, Food Access Need, baseline matrix cell, and
  Priority.
- [ ] Trace language reports uncertainty and context without implying causation, literacy,
  individual behavior, service effectiveness, or a funding recommendation.

## Known limitations to carry into review

- FNS SNAP retailers are not a complete food-retail inventory.
- Static GTFS measures scheduled service, not reliability, travel time to groceries, or real-time
  conditions.
- The pinned OSM graph represents encoded pedestrian access at one source date and has a fixed
  snap tolerance; it does not prove sidewalk quality or accessibility.
- The emergency-food layer is stale, has unknown activity and hours, and lacks approved public
  redistribution terms. It is development context only.
- Census and survey measures describe tract-level conditions, not individual people. Limited
  English proficiency is not literacy.
- Priority is a deterministic overlap category, not a causal finding or automated policy
  recommendation.

## Completion evidence

After the live checklist passes, append sanitized source/count/hash results, reviewed tract
traces, the validated unpublished run ID, same-run verification result, integration output, PR
URL, and CI URLs. Never append credentials, a connection string, restricted records, or raw
source rows.
