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

## indicator_definitions

- indicator_id
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

## indicator_values

- geoid
- indicator_id
- value
- margin_of_error
- percentile
- data_year
- quality_status
- source_id

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
- started_at
- completed_at
- data_vintages
- git_commit
- status

## scores

- score_run_id
- geoid
- demographic_percentile
- socioeconomic_percentile
- health_percentile
- equity_baseline_percentile
- food_access_percentile
- food_priority
- quality_status

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
