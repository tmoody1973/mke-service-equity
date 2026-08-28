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

## Equity Baseline v1 lock

The executable registry is
[`pipelines/equity_baseline/registry.toml`](../../pipelines/equity_baseline/registry.toml). Its
canonical SHA-256 is part of every run identity. Changing a source, formula, weight, band,
completeness rule, or reliability threshold requires methodology documentation and tests; do not
edit the registry as an operational shortcut.

The v1 source identifiers are:

| Key | Dataset version | Structured source |
|---|---|---|
| `tiger` | 2020 | Census `tl_2020_55_tract` TIGER/Line ZIP |
| `acs` | 2024 ACS 5-Year | Census Data API `acs/acs5` approved groups |
| `places` | December 2025 release, 2023 estimates | CDC PLACES Socrata dataset `cwsq-ngmh` |

ACS manifests record group and geography query metadata but redact the API key. PLACES is
restricted to the six approved crude-prevalence measures and retains confidence limits and
footnotes. TIGER is read as statewide Wisconsin tract geography and filtered to Milwaukee County
only after authoritative source validation.

Every committed manifest must retain publisher, dataset version, retrieval timestamp, source
URL without credentials, checksum, byte size, row/feature count, schema fingerprint, license,
methodology reference, and sanitized request metadata. Raw responses and normalized records are
not source-registry documentation and must remain ignored.
