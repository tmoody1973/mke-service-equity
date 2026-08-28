# Data Source Registry

## Source hierarchy

When sources conflict:

1. local authoritative government source
2. federal authoritative source
3. trusted community partner
4. supplemental open data
5. manual verification

Never silently substitute a lower-quality source because it is easier to query.

## Initial source plan

| Domain | Preferred source | Use |
|---|---|---|
| Demographics/economics | 2024 Census ACS 5-Year Detailed Tables | Equity Baseline v1 |
| Census geography | 2020 Census TIGER/Line tracts | Canonical tract geometry |
| Health | CDC PLACES December 2025 release | Health subindex v1; 2023 BRFSS crude prevalence |
| Food access benchmark | USDA 2025 SRAM | Retail access |
| SNAP retailers | USDA retailer data | Retail inventory |
| Transit | MCTS GTFS | Stops/routes/frequency |
| City GIS/assets | Map Milwaukee | Local geography/assets |
| County GIS/assets | Milwaukee County Open Data | County assets/parcels |
| Emergency food | Hunger Task Force / trusted partner export | Food resource inventory |

## Partner data

Prefer a structured CSV, GeoJSON, API, or periodic export.

If unavailable, use a curated manual file with explicit:

- source
- source URL
- verification date
- verification method
- status

## Data-source record

Each source record should support:

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
