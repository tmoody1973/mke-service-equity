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

## Update rhythm

- ACS: annual
- CDC PLACES: annual
- USDA access benchmark: annual
- retailer data: regular check
- MCTS GTFS: regular feed check
- local GIS: monthly/quarterly check
- food resources: monthly recommended
- methodology: versioned and never automatic
