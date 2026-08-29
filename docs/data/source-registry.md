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
| Emergency food | Hunger Task Force / trusted partner structured export; Milwaukee Food Council/Data You Can Use layer as stale development context | Food resource inventory |

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

## Food Access Need v1 approved lock (MOO-753)

The complete proposed contract is
[`2026-08-29-moo-753-food-equity-design.md`](../superpowers/specs/2026-08-29-moo-753-food-equity-design.md).
Tarik explicitly approved this source and methodology contract on 2026-08-29. Executable Plan 3
registry work must implement the approved contract without silent source substitution.

### Scoring sources

| Key | Publisher and exact version | Structured artifact | Approved scoring fields/use |
|---|---|---|---|
| `sram` | USDA ERS 2025 SNAP-authorized Retailer Access Map; updated 2026-07-27 | `https://www.ers.usda.gov/media/29395/2025-snap-authorized-retailer-access-map-sram-data.zip?v=81233` | `CensusTract20`, `DD_SRAM_lapop1`, `DD_SRAM_lapop1share`; one-driving-mile SNAP access benchmark |
| `snap_retailers` | USDA FNS historical SNAP retailer locator, current through 2025-12-31 | `https://fns-prod.azureedge.us/sites/default/files/resource-files/snap-retailer-locator-data2005-2025.zip` | Record ID, official store type, location, authorization/end dates; active retailer inventory and full-service evidence |
| `acs_vehicle` | 2024 ACS 5-Year Detailed Tables, group `B08201` | `https://api.census.gov/data/2024/acs/acs5` | `B08201_001E/M` total households and `B08201_002E/M` no vehicle available |
| `tract_origins` | 2020 Census tract mean centers of population, Wisconsin | `https://www2.census.gov/geo/docs/reference/cenpop2020/tract/CenPop2020_Mean_TR55.txt` | State `55`, county `079`; deterministic population-weighted access origin |
| `mcts_gtfs` | Current MCTS static GTFS snapshot at execution | `https://kamino.mcts.org/gtfs/google_transit.zip` | Stops and scheduled unique trip departures; exact bytes, retrieval time, feed validity range, and analysis dates are manifested |
| `walking_network` | Geofabrik/OpenStreetMap Wisconsin 2026-08-27 PBF | `https://download.geofabrik.de/north-america/us/wisconsin-260827.osm.pbf` | Pedestrian-permitted network clipped to Milwaukee County plus two miles; published MD5 `87c18ce0608499afd91ed0f2a5ee8eef`, plus computed SHA-256 |
| `equity_baseline` | Approved Equity Baseline v1 development run | database run `502e2a04-b013-53cd-8b09-c9144862701a` | Validated, verified, unpublished run ID, output hash, band, and lineage for Priority lookup |

The MCTS feed is validated with MobilityData GTFS Validator `v8.0.1`; the pinned CLI JAR SHA-256
is `19293ddd9b6f954f216d4f12054bd8a3232921751c4484339e339764a91000e2`. Walking-network
processing pins `osmium==4.3.1` and `networkx==3.6.1`.

`snap_retailers` is not a complete inventory of non-SNAP food retail. FNS `Supermarket` and
`Large Grocery Store` qualify as full-service in v1. `Super Store` requires a recorded
non-membership/non-restricted evidence override. No store is classified by name alone.

The pinned FNS archive contract is exact:

- archive `snap-retailer-locator-data2005-2025.zip`, SHA-256
  `872a6f814a63514a1f1b0c4517a90309a9fbb01d97d6e4dbb1e8b20421c08cce`;
- sole member `Historical SNAP Retailer Locator Data 2005-2025.csv`, SHA-256
  `4af9a16811b7d906a2ad077eb59d3f1c7e99a32a87d2bca0900f8d14033c7b9e`;
- UTF-8 BOM, exact 15-field registry header/order, 703,441 data rows, and snapshot date
  2025-12-31;
- `Record ID` as stable retailer identity and (`Record ID`, `Authorization Date`, `End Date`) as
  historical version identity; duplicate version keys fail validation.

The classification registry uses only exact values observed in that member. This includes
`Super Store`, `Bakery Specialty`, `Fruits/Veg Specialty`, `Meat/Poultry Specialty`,
`Seafood Specialty`, and ASCII `Farmers' Market`. `Food Buying Co-op`, `Wholesaler`, and `Unknown`
are explicitly `unverified`, contextual, and non-scoring. Unobserved source-label aliases are not
accepted silently.

### Context-only source

| Key | Publisher and version | Structured artifact | Status and use |
|---|---|---|---|
| `emergency_food_context` | Milwaukee Food Council/Data You Can Use `EmergencyFood_MKE_2024`; layer records edited 2024-08-27 | `https://services5.arcgis.com/3kr3fkJcIf6EOY6g/ArcGIS/rest/services/EmergencyFood_MKE/FeatureServer/0` | `stale_unverified_context` in non-public development only; no score effect; public redistribution blocked pending partner-confirmed terms and freshness |

Emergency-food and public-investment artifacts are outside the Food score-input fingerprint.
They cannot change the Food Access Need score, band, or Food Equity Priority. Missing hours remain
missing; narrative notes are not parsed into operating schedules.

### Source-specific validation

- Every source snapshot records exact bytes or sanitized request metadata, SHA-256, byte size,
  schema fingerprint, row/feature count, retrieval time, validity interval, and license/terms.
- SRAM must use `DD_SRAM_lapop1share` as percentage points; its low-income and vehicle-combined
  flags are not v1 scoring inputs.
- FNS dates and status are parsed strictly. Unknown status never becomes active, and duplicate
  (`Record ID`, `Authorization Date`, `End Date`) version keys fail validation.
- The OSM artifact is immutable; `wisconsin-latest.osm.pbf` is prohibited.
- GTFS must pass the pinned validator and cover both explicit analysis dates. MCTS retrieval/last-
  update and valid-through dates must appear with any representation, along with the required
  not-sponsored/not-operated statement.
- Census API keys are never stored in URLs, manifests, logs, fixtures, or committed files.
