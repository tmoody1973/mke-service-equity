# Ingestion and Publication Pipeline

## Pipeline

External sources
→ raw snapshots
→ validation
→ normalization
→ geographic joins
→ scoring
→ QA
→ Neon/PostGIS
→ published score run
→ application

Plan 2 stops at a `validated` Equity Baseline run. Accessibility calculations, publication,
and application consumption belong to later plans.

## Equity Baseline commands

Install the locked Python environment with `uv sync --locked`. Live source acquisition also
requires `CENSUS_API_KEY`. Database-writing stages require both
`MKE_PIPELINE_ENV=development` and `DATABASE_URL_UNPOOLED`; the runner rejects every other
environment. Never echo these values, put them in command arguments, or store them in reports.

Run stages separately when establishing or troubleshooting an authoritative run:

```bash
uv run python -m pipelines.equity_baseline fetch
uv run python -m pipelines.equity_baseline validate
uv run python -m pipelines.equity_baseline normalize
uv run python -m pipelines.equity_baseline load
uv run python -m pipelines.equity_baseline score
uv run python -m pipelines.equity_baseline validate-run
```

After one validated run exists, independently recompute and compare its canonical output hash:

```bash
uv run python -m pipelines.equity_baseline run --through validated --verify-existing
```

The CLI does not accept `publish` or arbitrary lifecycle mutations. Its default workflow is
wired to the approved official-source adapters, immutable artifacts, deterministic scorer, and
parameterized repository. The isolated Task 10 run must still exercise that wiring against the
official endpoints and disposable Neon branch. Until that evidence is recorded, do not
interpret the offline gate as proof of a live ingestion.

Each invocation writes a canonical JSON report beneath `data/reports/equity-baseline/`. The
timestamped report contains the command, completed stages, status, run ID when one exists,
reuse/verification flags, output hash when available, and a redacted error. A nonzero exit and
`status: failed` mean processing stopped at the first failing stage. Reports are local and must
not be committed.

## Raw snapshots

Preserve original source material before transformation.

Suggested structure:

```text
data/raw/
  acs/<vintage>/<retrieved-date>.json
  places/<release>/<retrieved-date>.csv
  usda/<dataset>/<retrieved-date>.csv
  mcts/<retrieved-date>/gtfs.zip
```

Large raw files may move to object storage; the repository should retain manifests and checksums.

For the Equity Baseline, use bounded official inputs: the 2020 Wisconsin TIGER/Line tract
shapefile, approved 2024 ACS 5-Year variables for Milwaukee County tracts, and the six approved
CDC PLACES crude-prevalence measures for Milwaukee County. Preserve raw responses under the
ignored `data/raw/` tree and commit sanitized manifests under `data/manifests/`.

Each manifest records the exact request without credentials, source version, retrieval time,
SHA-256, byte size, row or feature count, schema fingerprint, and local storage URI. CI uses
committed fixtures rather than live source availability.

Plan 2 artifact locations are fixed:

```text
data/raw/equity-baseline/       # immutable, content-addressed source bytes; ignored
data/normalized/equity-baseline/ # derived normalized records; ignored
data/reports/equity-baseline/   # quality and command reports; ignored
data/manifests/equity-baseline/ # sanitized provenance only; reviewed before commit
```

Reusing an identical content hash is safe. A collision at an existing content-addressed path is
an error rather than an overwrite.

## Validation gates

Examples:

### Census/ACS
- expected geography count
- unique GEOIDs
- required variables present
- numeric ranges valid

### CDC
- Milwaukee County only
- tract GEOIDs match canonical geography
- required measures available

### Food resources
- valid coordinates
- expected geographic bounds
- allowed resource categories
- duplicate detection completed

If validation fails, do not publish the new dataset. Preserve the last verified published data.

Loading and scoring are transactional. A failed validation or scoring operation must not leave
partial analytical rows. MOO-751 records a failed run and a structured quality report; it does
not fall back to another source or publish a result.

Missing, suppressed, invalid, or conflicting values remain explicit; they are never converted
to zero. A positive-population tract missing any of the 13 required indicators is
`insufficient_data`. A zero-population tract is `ineligible_zero_population`. Only complete
tracts receive subindices, a composite, a final percentile, and a band. ACS reliability states
and PLACES confidence intervals remain attached to their values.

Run identity is content-based. An identical run fingerprint reuses the existing validated run
instead of duplicating source, value, component, or score rows. With `--verify-existing`, the
pipeline must recompute the canonical output and reject any output-hash mismatch.

The explicit `load` stage idempotently writes source, snapshot, geography, definition, and value
records. Draft creation, analytical rows, and the transition to `validated` share one Psycopg
transaction, which also safely replays the idempotent base statements. An exception rolls that
transaction back. If a draft already exists, a separate transaction may record a redacted
`failed` state after rollback. Recovery starts by reading the local quality report and
correcting the source, configuration, or validation failure; never force a status or partially
replay SQL.

## Food Equity commands and lossless resource rules

Plan 3 exposes only `fetch`, `validate`, `normalize`, `classify`, `accessibility`, `load`, `score`,
`validate-run`, and `run --through validated [--verify-existing]`. The final three stages require
`MKE_PIPELINE_ENV=development` and `DATABASE_URL_UNPOOLED`. Every valid invocation writes a
secret-free report under `data/reports/food-equity/`; there is no publish or production-status
command.

Source rows are persisted without display defaults. A blank resource name or unknown active state
remains null. Multiple FNS validity intervals in the same immutable snapshot remain separate
versions. Source-derived FNS classification relies on the exact snapshot and declarative rule;
manual/partner overrides and verified context require dated verification evidence. Contextual
10-, 15-, and 20-minute counts are separate scalar metrics and cannot enter Food Access Need or
Priority. Score exclusions are retained verbatim for audit and recovery.

## Update rhythm

- ACS: annual
- CDC PLACES: annual
- USDA access benchmark: annual
- retailer data: regular check
- MCTS GTFS: regular feed check
- local GIS: monthly/quarterly check
- food resources: monthly recommended
- methodology: versioned and never automatic
