# Ingestion and Publication Pipeline

## Pipeline

External sources
→ raw snapshots
→ validation
→ normalization
→ geographic joins
→ accessibility calculations
→ scoring
→ QA
→ Neon/PostGIS
→ published score run
→ application

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

## Update rhythm

- ACS: annual
- CDC PLACES: annual
- USDA access benchmark: annual
- retailer data: regular check
- MCTS GTFS: regular feed check
- local GIS: monthly/quarterly check
- food resources: monthly recommended
- methodology: versioned and never automatic
