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
- name
- resource_type
- subtype
- address
- city
- zip
- latitude
- longitude
- geometry
- full_service_grocery
- snap_authorized
- hours_json
- eligibility
- website
- phone
- source_id
- source_record_id
- verified_at
- verification_status
- active

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
