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
| Emergency food | Hunger Task Force / trusted partner structured export; Data You Can Use/Milwaukee Food Council display snapshot | Food resource inventory and clearly labeled context map |

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
Tarik explicitly approved this source and methodology contract on 2026-08-29 and approved the
lossless source/schema amendment on 2026-08-29. Executable Plan 3 registry work must implement the
approved contract without silent source substitution.

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
| `emergency_food_context` | Milwaukee Food Council/Data You Can Use `EmergencyFood_MKE_2024`; data edited 2024-08-07, schema/layer edited 2024-08-27 | `https://services5.arcgis.com/3kr3fkJcIf6EOY6g/ArcGIS/rest/services/EmergencyFood_MKE/FeatureServer/0` | `stale_unverified_context` in non-public development only; no score effect; public redistribution blocked pending partner-confirmed terms and freshness |
| `atlas_food_sites_2026` | Data You Can Use, Milwaukee Food Council, and UWM Institute for Systems Change and Peacebuilding; `Pantries 2026`, layer last edited 2026-03-05 | `https://services5.arcgis.com/3kr3fkJcIf6EOY6g/arcgis/rest/services/Pantries_2026/FeatureServer/57` via the [Milwaukee Food Environment Map](https://experience.arcgis.com/experience/4883a0957d124294aa236d9e9cc696a5) | Approved on 2026-08-30 as a source-listed Atlas display layer only; `source_listed_check_before_visiting`; no score effect |

Emergency-food and public-investment artifacts are outside the Food score-input fingerprint.
They cannot change the Food Access Need score, band, or Food Equity Priority. Missing hours remain
missing; narrative notes are not parsed into operating schedules.

The approved 2026 Atlas display snapshot contains 89 point features. The exact ArcGIS GeoJSON
response has SHA-256
`5b86d359dd55e008836dfba4f4bde45d0561567bcce9d346882392a744e77f94`; the browser-safe
normalization is generated by `pipelines/atlas_food_sites` and committed with the web application.
The app credits **Data You Can Use, Milwaukee Food Council, and UWM Institute for Systems Change
and Peacebuilding** and links to the original map. The ArcGIS item and layer are public and carry
no item-specific license or terms field; reuse follows Esri's public-content terms. Tarik
explicitly approved use with citation on 2026-08-30.

This approval does not claim that a listed site is open, active, eligible for a particular person,
or operating on the hours written in its narrative note. The source snapshot has no independently
verified current-status field. Every display therefore says **Check before visiting**, exposes a
provider phone or website when the source supplies one, and calls the notes source notes. The
layer is a release-pinned display artifact with an explicit
`display_context_only_not_part_of_score_run` relationship. It is never joined into the Food run,
never used for a proximity calculation, and cannot change Food Access Need, Equity Baseline, or
Food Equity Priority.

Contextual walking counts use separate 10-, 15-, and 20-minute metric slugs for grocery and
emergency-food inventories because the database metric value is scalar. These six observations
are never scoring inputs. Unknown emergency-resource activity remains null and makes the related
context observation missing or conflicting; it is never coerced to inactive or to an observed
zero. Missing source names also remain null.

### Source-specific validation

- Every source snapshot records exact bytes or sanitized request metadata, SHA-256, byte size,
  schema fingerprint, row/feature count, retrieval time, validity interval, and license/terms.
- SRAM must use `DD_SRAM_lapop1share` as percentage points; its low-income and vehicle-combined
  flags are not v1 scoring inputs.
- FNS dates and status are parsed strictly. Unknown status never becomes active, and duplicate
  (`Record ID`, `Authorization Date`, `End Date`) version keys fail validation.
- FNS source-derived `verified` classifications retain source and rule evidence without inventing
  a verification timestamp. Dated timestamps remain mandatory for manual/partner overrides and
  verified context events.
- The OSM artifact is immutable; `wisconsin-latest.osm.pbf` is prohibited.
- GTFS must pass the pinned validator and cover both explicit analysis dates. MCTS retrieval/last-
  update and valid-through dates must appear with any representation, along with the required
  not-sponsored/not-operated statement.
- Census API keys are never stored in URLs, manifests, logs, fixtures, or committed files.

### Operational source resolution

Live acquisition resolves the exact local PBF, reviewed classification evidence, and GTFS
Validator JAR through the environment names in the ingestion guide. Those paths and the evidence
checksum are runtime configuration, not source substitutions. The pipeline validates each local
artifact against its separately approved identity before making a new bundle pointer.

The Food bundle contains exactly seven persisted source manifests: SRAM, FNS retailers, ACS
vehicle access, tract origins, MCTS GTFS, walking network, and emergency-food context.
Classification evidence has its own immutable manifest and fingerprint because it is verification
evidence rather than a source metric. The Plan 2 TIGER snapshot remains separate canonical
geography lineage and must match the Food fetch pointer. No stage may resolve a source by
`latest`, substitute a fixture, or accept a caller-provided geography predicate.

## Atlas neighborhood reference approval (MOO-754)

Tarik explicitly approved the following source and tract-overlap rule on 2026-08-30. This is a
context and search contract only. Neighborhood names and overlaps cannot change an Equity
Baseline score, Food Access Need score, or Food Equity Priority.

| Key | Publisher and reference | Structured artifact | Approved use |
|---|---|---|---|
| `milwaukee_dcd_neighborhoods` | City of Milwaukee Department of City Development, Milwaukee Neighborhood Identification Project of 2000; City download catalog last labels the data updated January 2007 | ArcGIS `AGO/neighborhoods/MapServer/0`: `https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/AGO/neighborhoods/MapServer/0` | City-of-Milwaukee neighborhood-reference search, tract context, and optional boundary display only |

The live service exposed 190 polygon features at approval time, with stable source fields
`NBHD_ID` and `NEIGHBORHD`, source coordinate system EPSG:32054, and attribution to “City of
Milwaukee DCD and ITMD-GIS.” Ingestion must snapshot the complete response rather than making
public results depend on the mutable service. The snapshot manifest records the exact query URL,
retrieval time, SHA-256, byte size, feature count, schema fingerprint, source coordinate system,
attribution, and the source limitation below. A changed feature count, schema, or duplicate/missing
identifier fails validation until reviewed.

The approved snapshot retrieved on 2026-08-30 has SHA-256
`4a3bf2c32182b508204dcdfad9904eba3f987f2e2b0720087642c40fbf9862e5`, 496,834 bytes,
190 features, and schema fingerprint
`9ffea823c09df86ef74ea05ef6edef87ac84b4b0ded69a23c226cdac60f5719f`. Source feature
`NBHD_ID 30`, `LAND BANK`, contains one ring self-intersection. Normalization applies Shapely
`MakeValid` only to that exact feature and only when the output is a valid polygon with area
preserved within a relative tolerance of `1e-9`; any other invalid geometry or a changed repair
result fails validation.

The City says these boundaries were developed using subdivisions, major streets, physical
barriers, community participation, housing characteristics, historic areas, and residents'
opinions. The City also says they are not official City boundaries, do not necessarily match
neighborhood-association boundaries, and are not updated on an ongoing basis. Therefore public
copy calls this dataset the **City of Milwaukee neighborhood reference** or **City-published
neighborhood reference**, never “official neighborhood boundaries.” It covers the City of
Milwaukee, not every municipality in Milwaukee County. A tract without City-layer coverage shows
municipality and Census ZCTA context when available and says that no City neighborhood reference
is available; the application never invents a neighborhood.

### Approved tract-overlap rule

All spatial calculations run in PostGIS in a suitable projected coordinate system; the browser
does not calculate polygon relationships.

1. Intersect each canonical 2020 Census tract with the unioned, validated City neighborhood
   snapshot and preserve every positive-area intersection in audit data.
2. Compute `city_reference_coverage` as covered polygon area divided by tract polygon area.
   Compute each neighborhood's share using the tract area covered by the City reference as the
   denominator. These are area shares, not population shares.
3. Keep exact unrounded values for ordering and audit. Public results show overlaps of at least
   1.0%; smaller numerical/boundary slivers are combined as “Other boundary slivers” rather than
   silently reassigned. Sort by unrounded share descending, then normalized neighborhood name and
   `NBHD_ID` for deterministic ties.
4. If City-reference coverage is at least 50% and the largest neighborhood is at least 50% of the
   covered area, say “Mostly in {name}” and list every other reportable overlap. If coverage is at
   least 50% but no neighborhood has a majority, say “Spans {names}.”
5. If City-reference coverage is below 50%, do not assign a primary neighborhood. Say “Partly
   covered by the City neighborhood reference” and list the reportable overlaps. With no positive
   overlap, say “No City of Milwaukee neighborhood reference for this tract.”
6. Always explain percentages as “share of the part of this tract covered by the City neighborhood
   reference.” Never use centroid-only assignment, ZIP-to-neighborhood inference, population
   inference, or a single forced neighborhood label.

This approval does not approve an address geocoder, a USPS ZIP boundary, or a street-reference
publication source. Those contracts remain separately gated.

### Public CSV attribution rule (MOO-769)

The tract-evidence CSV may show this reference only when the exact validated snapshot is a member
of the current governed publication and the publication record permits public derived results or
direct display. Its exported source-version cell identifies the City publisher, source name, and
snapshot dataset version. If that pin is absent, the file states that neighborhood context is not
available; it does not reuse a configured development snapshot or infer a ZIP, street, or
neighborhood label.
