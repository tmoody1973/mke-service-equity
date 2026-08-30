# Logical Data Model

## geographies

- id
- geoid
- geography_type
- name
- state_fips
- county_fips
- geometry
- centroid
- population
- vintage

The geography type, GEOID, and vintage form a unique canonical identity. Plan 2 stores 2020
Milwaukee County Census tracts with valid PostGIS `MultiPolygon` and centroid geometry in
EPSG:4326.

## data_sources

- id
- name
- publisher
- source_url
- dataset_version
- geography
- retrieved_at
- valid_from
- valid_to
- update_frequency
- license
- methodology_url
- status
- notes

## source_snapshots

- id
- source_id
- dataset_version
- retrieved_at
- checksum_sha256
- byte_size
- storage_uri
- row_or_feature_count
- schema_fingerprint
- request_metadata
- validation_status

## indicator_definitions

- indicator_id
- methodology_version
- slug
- name
- description
- domain
- unit
- source_id
- higher_is_worse
- baseline_included
- weight
- methodology
- formula_definition

## indicator_values

- id
- geoid
- indicator_id
- snapshot_id
- value
- margin_of_error
- confidence_low
- confidence_high
- data_year
- quality_status
- quality_metadata

## food_resources

- id
- source_id
- source_record_id
- canonical_resource_key

`food_resources` holds stable source identity. Display and validity fields belong to immutable
resource versions.

## food_resource_versions

- id
- resource_id
- snapshot_id
- version_fingerprint
- category
- name (nullable when the source is blank)
- address, city, postal_code, website, phone, hours
- geometry and coordinate_status
- verification_status and classification_evidence
- full_service_grocery and snap_authorized
- active (nullable when the source does not establish activity)
- valid_from and valid_to
- verified_at

Historical identity is resource, source snapshot, and the validity interval with null endpoints
treated as values. Source-derived `verified` classification does not require an invented
`verified_at`; override and verified-context states do.

## access_metrics

- geoid
- resource_category
- nearest_distance_miles
- nearest_walk_minutes
- resources_10_min_walk
- resources_15_min_walk
- resources_20_min_walk
- transit_access_score
- vehicle_access_indicator
- calculation_version
- calculated_at

The physical tables are `food_access_metric_values` and
`food_access_metric_snapshots`. Each scalar metric value links every contributing immutable
snapshot. Context counts use distinct 10-, 15-, and 20-minute slugs and remain outside scoring.

## food_scores

Food score rows link the Plan 3 run, canonical geography, and exact Equity Baseline score. They
store both domain scores, raw and percentile Food Access Need, both bands, Priority, quality
status, and `exclusion_reasons`. The reasons remain present for insufficient and zero-population
rows even though their analytical values are null.

## score_runs

- id
- methodology_version
- registry_hash
- input_manifest_hash
- run_fingerprint
- scoring_implementation_version
- started_at
- completed_at
- data_vintages
- git_commit
- status
- failure_metadata

Plan 2 may create `draft`, `validated`, or `failed` runs. It does not expose a transition to
`published`.

## score_components

- score_run_id
- geoid
- indicator_value_id
- indicator_percentile
- effective_weight
- quality_status

## scores

- score_run_id
- geoid
- demographic_score
- socioeconomic_score
- health_score
- composite_score
- equity_baseline_percentile
- equity_baseline_band
- quality_status

Indicator values remain independent of score runs because percentiles depend on the eligible
comparison set. `score_components` records the exact value, percentile, and effective weight
used by a run. Food access and Food Equity Priority are added only by their later approved
plans.

## Plan 2 integrity and lifecycle

Migration `0001_equity_baseline.sql` creates eight approved tables: `data_sources`,
`source_snapshots`, `geographies`, `indicator_definitions`, `indicator_values`, `score_runs`,
`score_components`, and `scores`. Foreign keys prevent orphan analytical rows, and unique
constraints make source snapshots, normalized values, and run fingerprints idempotent.

Geography is database-checked as an 11-digit tract GEOID with matching state/county FIPS,
non-empty valid `MultiPolygon` geometry and non-empty `Point` centroid, both at SRID 4326.
Indicator value and score constraints preserve the distinction between a usable value and a
missing-quality state. An incomplete or zero-population score row must have every numerical
score and band set to null.

The Plan 2 lifecycle trigger permits only:

```text
draft -> validated
draft -> failed
```

It rejects inserts or transitions to `published` and `superseded`, plus every other status
transition. A validated run requires a 64-character lowercase output hash and validation result;
a failed run requires completion and failure metadata but no output hash. Later publication work
must introduce its own reviewed lifecycle migration rather than bypass this trigger.

`run_fingerprint` identifies the methodology, registry, input manifests, implementation, and
other deterministic inputs for one run. `output_hash` identifies the canonical scored output.
An existing fingerprint is reused; `--verify-existing` also requires a matching independently
recomputed output hash.

## Plan 3 integrity and lifecycle

Migration `0002_food_equity.sql` introduces stable resources, immutable resource versions,
scalar access metrics, many-to-many snapshot lineage, Food score runs, components, and scores.
Forward-only migration `0003_food_equity_contract_amendment.sql` makes source-blank names and
unknown activity nullable, changes resource-version identity to include both validity endpoints
with `NULLS NOT DISTINCT`, adds dated-verification checks, and requires structured score
exclusion reasons.

Foreign keys prevent resource/source, version/resource, version/snapshot, metric/geography,
metric/snapshot, component/run, component/geography, score/run, score/geography, and pinned
baseline orphans. Resource geometry is a non-empty EPSG:4326 point only when the coordinate state
supports one. Metric state/value and quality checks preserve observed zero, unreachable, and
missing as different facts. The production write plan reconciles a 302-by-10 persisted metric
grid, a 302-by-4 scoring grid, all metric/snapshot links, 1,196 components, and 302 scores before
validation. The exact Food score shape is 299 complete, one attributable `insufficient_data`, and
two `ineligible_zero_population` rows.

The separate Food lifecycle permits only `draft -> validated` and `draft -> failed`; it contains
no `published` value. Each run pins the exact validated Equity Baseline ID and output hash. Base
records are conflict-safe and reusable, while analytical rows and the lifecycle transition share
one transaction. A failed transaction leaves no partial draft. A pre-existing draft may be
marked failed only through the guarded, redacted repository path.

## public_investments

- id
- project_name
- agency
- program
- amount
- funding_source
- start_date
- end_date
- status
- location
- geometry
- source_id
