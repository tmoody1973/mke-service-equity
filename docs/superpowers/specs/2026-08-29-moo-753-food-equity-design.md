# MOO-753 Food Equity Source and Methodology Design

**Status:** Approved by Tarik on 2026-08-29

**Issue:** MOO-753 — Plan 3 — Food Data + Accessibility + Priority

**Prepared:** 2026-08-29

**Implementation gate:** Satisfied by Tarik's explicit `approve methodology` response on
2026-08-29. Later tasks must implement this contract without silent deviation.

## Decision summary

Food Access Need v1 has two equally weighted domains:

1. **Retail Access**
   - share of residents more than one driving-network mile from any SNAP-authorized retailer;
   - walking-network access from the tract center of population to the nearest explicitly
     classified full-service grocery.
2. **Transportation Constraint**
   - share of households with no vehicle available;
   - scheduled transit service intensity reachable within a ten-minute walk.

The four indicators are equally weighted in the final composite. Economic conditions are not a
third domain because the approved Equity Baseline already measures poverty, unemployment,
educational attainment, and housing cost burden. Adding them again would double-weight economic
vulnerability when Food Access Need is combined with the Equity Baseline.

Emergency-food availability, other food resources, and public investment are contextual. They do
not reduce measured need, enter a score-input fingerprint, change a band, or change Food Equity
Priority. Scheduled transit is the one approved existing-service measure proposed as a scoring
input: it represents a transportation access gap, not a judgment about agency performance or
investment.

## 1. Authoritative source contract

Research in this section resolved documentation and metadata only. Temporary research downloads
were placed outside the repository. No source snapshot has been accepted, committed, or loaded.
Every executable fetch will create a checksum-verified manifest before normalization.

### 1.1 USDA ERS 2025 SRAM

| Property | Contract |
|---|---|
| Publisher | U.S. Department of Agriculture, Economic Research Service |
| Artifact | `2025-snap-authorized-retailer-access-map-sram-data.zip` |
| Exact URL | `https://www.ers.usda.gov/media/29395/2025-snap-authorized-retailer-access-map-sram-data.zip?v=81233` |
| Download page | `https://www.ers.usda.gov/data-products/food-access-research-atlas/download-the-data` |
| Reference guide | `https://www.ers.usda.gov/data-products/food-access-research-atlas/documentation/snap-authorized-retailer-access-map-reference-guide` |
| Technical methods | `https://www.ers.usda.gov/data-products/food-access-research-atlas/documentation/snap-authorized-retailer-access-map-data-sources-and-technical-methods` |
| Release | 2025 SRAM, archive files dated 2026-07-23, USDA page updated 2026-07-27 |
| Source vintages | June 2025 SNAP retailers; 2020 Census; LandScan USA 2020; 2020–2024 ACS; Esri StreetMap Premium Custom Roads 2026 Release 1 |
| Geography | 2020 census tracts in the 50 states and District of Columbia |
| Required file | `SRAM Driving Distance Data.csv` |
| Required fields | `CensusTract20`, `State`, `County20`, `DD_SRAM_lapop1`, `DD_SRAM_lapop1share` |
| Scoring value | `DD_SRAM_lapop1share`, expressed as percentage points from 0 through 100 |
| Update cadence | Periodic, not guaranteed annual |
| Terms | U.S. federal statistical data; preserve USDA attribution and the reference-guide citation |

`DD_SRAM_lapop1share` is the share of the tract population living more than one mile by
driving-network distance from the nearest SNAP-authorized food retailer. It is a benchmark of
access to **any** fixed-location SNAP-authorized retailer, not a grocery-quality measure and not a
walking measure. Farmers markets and delivery routes are excluded by USDA.

Known limitations retained in provenance and user-facing explanations:

- SRAM uses driving paths, not pedestrian or transit paths.
- SNAP authorization does not establish full-service grocery selection or quality.
- The SNAP inventory does not contain every food retailer.
- Population is distributed using LandScan patterns and assumes subgroup distributions follow
  the overall population pattern.
- Store positions can be inaccurate; USDA estimates approximately one percent may remain in the
  wrong county after review.
- Online food purchasing, pantries, affordability, store quality, sidewalks, safety, terrain,
  and individual mobility limitations are not represented.

The 2019 LRAM is not a v1 source. It uses 2010 tracts and a proprietary 2019 TDLinx inventory, so
it is too old and geographically misaligned for the current local score.

### 1.2 USDA FNS historical SNAP retailer locator

| Property | Contract |
|---|---|
| Publisher | USDA Food and Nutrition Administration, formerly Food and Nutrition Service |
| Artifact | `snap-retailer-locator-data2005-2025.zip` |
| Exact URL | `https://fns-prod.azureedge.us/sites/default/files/resource-files/snap-retailer-locator-data2005-2025.zip` |
| Documentation page | `https://fns-prod.azureedge.us/snap/retailer-locator/data` |
| Store definitions | `https://fns-prod.azureedge.us/snap/store-definitions` |
| Snapshot date | Current as of 2025-12-31; archive published 2026-02-10 |
| Geography | United States; filter to resources within Milwaukee County plus a two-mile review buffer |
| Required fields | `Record ID`, `Store Name`, `Store Type`, address fields, `County`, `Latitude`, `Longitude`, `Authorization Date`, `End Date` |
| Update cadence | Historical file is periodic; this v1 methodology pins the named 2005–2025 snapshot |
| Terms | Public USDA administrative data; preserve source and snapshot-date attribution |

A row is active at the pinned snapshot when its authorization date is on or before 2025-12-31
and its end date is empty or after 2025-12-31. A malformed date, end date before authorization,
or ambiguous status produces `status_unknown`; it is never silently treated as active.

This source covers SNAP-authorized retailers. It can miss a full-service grocery that does not
participate in SNAP. That coverage limitation is accepted for v1 and must be displayed. A newer
snapshot is a methodology/source-version change, not an operational overwrite.

### 1.3 Full-service grocery evidence

USDA FNS store type is the primary structured evidence. `full_service_grocery` is assigned only
under these rules:

| FNS store type | v1 classification |
|---|---|
| `Supermarket` | `full_service_grocery` |
| `Large Grocery Store` | `full_service_grocery` |
| `Super Store/Chain Store` | `candidate_full_service`; requires documented evidence that the location is open to the general public without paid membership or restricted eligibility |
| `Medium Grocery Store` | `grocery_other`, contextual |
| `Small Grocery Store` | `grocery_other`, contextual |
| `Convenience Store` | `convenience`, contextual |
| `Combination Grocery/Other` | `combination_grocery_other`, contextual |
| Specialty categories | matching `specialty_*` category, contextual |
| Farmers market / direct marketing farmer | `seasonal_or_direct`, contextual |
| Military commissary | `restricted_access`, never full service |
| Internet retailer / delivery route | `non_fixed_or_online`, never used for walking access |
| Missing or unrecognized | `unverified`, never full service |

FNS defines Large Grocery Store as carrying a wide selection across all four staple-food
categories and Supermarket as carrying an extensive variety. Medium and small grocery stores
carry moderate or small selections and therefore do not meet this conservative v1 definition.

Evidence for a Super Store/Chain Store override must include resource ID, asserted
classification, evidence type, evidence URL or partner document reference, verifier, verification
timestamp, and notes. Acceptable evidence is an authoritative structured local category, a
partner-provided classification, or a dated manual verification record. Store name alone,
substring matching, brand lists, coordinates, or an LLM are prohibited evidence.

### 1.4 Emergency-food resources

| Property | Contract |
|---|---|
| Publishers | Milwaukee Food Council and Data You Can Use |
| Structured service | ArcGIS FeatureServer item `303b7e4385a6450fa7d36d76a1ba5a67`, layer `MFC_EmergencyFood` (`0`) |
| Exact endpoint | `https://services5.arcgis.com/3kr3fkJcIf6EOY6g/ArcGIS/rest/services/EmergencyFood_MKE/FeatureServer/0` |
| Partner page | `https://www.mkefoodcouncil.org/mapping` |
| Item title | `EmergencyFood_MKE_2024` |
| Coverage | Milwaukee County points |
| Fields | name, address, city, ZIP, phone, type, notes, website, service area, point geometry |
| Published types | `Food Bank`, `Food Pantry`, `Food Pantry and Recovery`, `Meal Program` |
| Layer edit date | 2024-08-27T15:25:33Z |
| Item metadata modified | 2025-07-09T18:44:48Z |
| Service terms | Public query access; item metadata contains no license or attribution terms |

This is an approved structured candidate, not a scraped map. For v1 it may be ingested only as
`stale_unverified_context` in a non-public development environment. It cannot be represented as a
current verified resource directory or redistributed publicly until the partners confirm reuse
terms and provide or affirm a current verification date. Hours are absent as structured fields;
text notes must not be parsed into operating hours.

The source is contextual and never blocks or changes a score. A fresh Hunger Task Force or partner
CSV, GeoJSON, API, or periodic export can replace it only through a documented source-version
change. The Hunger Task Force public map is not authorization to scrape.

### 1.5 MCTS static GTFS

| Property | Contract |
|---|---|
| Publisher | Milwaukee County Transit System, operated by Milwaukee Transport Services |
| Exact URL | `https://kamino.mcts.org/gtfs/google_transit.zip` |
| Terms | `https://www.ridemcts.com/policies/developer-terms` |
| Coverage | Scheduled MCTS service represented by the feed |
| Required files | `agency.txt`, `calendar_dates.txt` and/or `calendar.txt`, `routes.txt`, `trips.txt`, `stops.txt`, `stop_times.txt`; optional `feed_info.txt` |
| Validation | MobilityData canonical GTFS Validator `v8.0.1` CLI JAR; SHA-256 `19293ddd9b6f954f216d4f12054bd8a3232921751c4484339e339764a91000e2`; Java 17+ |
| Update cadence | Mutable operational feed; exact bytes, SHA-256, retrieval time, and service validity range are recorded per snapshot |

The temporary 2026-08-29 research copy used `calendar_dates.txt` only and covered 2026-06-07
through 2026-12-05. Those dates are evidence that the proposed method is executable, not an
accepted source snapshot.

Every representation must say it is not sponsored or operated by MTS/MCTS, state when the feed
was retrieved or last updated, and state the date through which its represented data is valid.
Static GTFS is scheduled service, not real-time performance or a complete guarantee of service.

### 1.6 Walking network

| Property | Contract |
|---|---|
| Data creator | OpenStreetMap contributors |
| Distributor | Geofabrik GmbH |
| Artifact | `wisconsin-260827.osm.pbf` |
| Exact immutable URL | `https://download.geofabrik.de/north-america/us/wisconsin-260827.osm.pbf` |
| Artifact timestamp | 2026-08-27 data; file published 2026-08-28T17:33Z |
| Byte size | 292,160,666 bytes |
| Published MD5 | `87c18ce0608499afd91ed0f2a5ee8eef` |
| Coverage | Wisconsin; execution clips to Milwaukee County plus a two-mile buffer after parsing |
| License | Open Database License 1.0; attribute OpenStreetMap contributors and Geofabrik; derived database obligations remain documented |
| Parser | `osmium==4.3.1` (PyOsmium), streamed with node locations |
| Router | `networkx==3.6.1`, weighted Dijkstra using an explicit `length_m` edge attribute |

The implementation also computes and pins SHA-256; the published MD5 is checked as an additional
publisher checksum. `wisconsin-latest.osm.pbf` is prohibited because it is mutable.

### 1.7 Tract access origins

| Property | Contract |
|---|---|
| Publisher | U.S. Census Bureau |
| Artifact | Wisconsin 2020 tract mean centers of population |
| Exact URL | `https://www2.census.gov/geo/docs/reference/cenpop2020/tract/CenPop2020_Mean_TR55.txt` |
| Fields | `STATEFP`, `COUNTYFP`, `TRACTCE`, `POPULATION`, `LATITUDE`, `LONGITUDE` |
| Filter | Wisconsin `55`, Milwaukee County `079` |
| Join | `STATEFP + COUNTYFP + TRACTCE` equals canonical 11-character 2020 tract GEOID |

The center of population is a deterministic, population-weighted single origin and is preferable
to the geometric centroid. It still cannot represent every resident's origin or within-tract
variation; that limitation is displayed with every local walking metric.

### 1.8 ACS vehicle availability

| Property | Contract |
|---|---|
| Publisher | U.S. Census Bureau |
| Dataset | 2024 ACS 5-Year Detailed Tables, group `B08201` |
| API | `https://api.census.gov/data/2024/acs/acs5` |
| Geography | Tracts in Wisconsin `55`, Milwaukee County `079` |
| Denominator | `B08201_001E` total households; `B08201_001M` 90% MOE |
| Numerator | `B08201_002E` households with no vehicle available; `B08201_002M` 90% MOE |
| Formula | `100 × B08201_002E / B08201_001E` |

The numerator is a subset of the denominator. The percentage-point MOE uses the Census
proportion formula already implemented by the Equity Baseline, including the approved
root-sum fallback when subtraction would yield a negative radicand. Denominator zero, Census
sentinel values, missing estimates, or invalid ranges are missing—not zero. Reliability state and
MOE remain attached to the value; high uncertainty is visible but does not independently exclude
an otherwise valid estimate.

## 2. Resource identity, quality, and freshness

### Canonical identity and duplicates

- FNS `Record ID` is the primary retailer source ID.
- ArcGIS service item ID + layer ID + `ObjectID` is the emergency-resource source ID.
- A canonical resource version includes source ID, source-snapshot checksum, classification, and
  validity interval.
- Exact duplicate source IDs in one snapshot fail validation.
- Possible cross-source duplicates are linked, not deleted. Matching may propose candidates using
  normalized address and proximity, but a merge requires deterministic evidence or a recorded
  manual decision.
- A resource moving, changing category, closing, or reopening creates a new version; history is
  retained.

### Coordinate states

`source_coordinate`, `authoritative_geocode`, `manually_verified`, `invalid`, and `missing` are
preserved. Coordinates must be numeric, within valid longitude/latitude ranges, and inside the
Milwaukee County two-mile review buffer for scoring retail resources. Invalid or missing
coordinates are never invented or geocoded without an approved structured geocoder and manifest.

Every active full-service grocery in the review buffer must snap to the walking graph within the
approved tolerance or the scoring run fails. Contextual resources may be retained as
`unroutable_context` with no access calculation.

### Freshness

- SRAM, FNS, ACS, tract origins, and the OSM PBF are exact v1 vintages. A different vintage is a
  source-contract change.
- MCTS GTFS must validate and cover both analysis dates in the source snapshot.
- Emergency resources become `verified_context` only with partner-confirmed reuse terms and a
  record- or dataset-level verification date no more than 90 days before retrieval. Otherwise
  they remain `stale_unverified_context`.
- Missing hours remain missing. Counts and hours are separate; text is never converted to hours.

## 3. Accessibility contract

### Pedestrian graph

The graph is clipped to Milwaukee County plus a two-mile buffer in Wisconsin Transverse Mercator
(`EPSG:3071`). It includes line ways with a `highway` tag unless the way is an area, proposed,
construction, abandoned, a raceway, a motorway, or a motorway link. Ways with `foot=no` or
`foot=private` are excluded. `access=no` or `access=private` is excluded unless an explicit
`foot=yes`, `foot=designated`, or `foot=permissive` overrides it.

Pedestrian edges are bidirectional unless an explicit pedestrian-direction tag prohibits a
direction. Steps are included without a speed penalty. Edge impedance is projected length in
meters; zero, negative, missing, or non-finite lengths fail graph validation. Parallel edges are
retained with stable OSM identifiers. Adjacency, source nodes, and resources are sorted by stable
IDs before graph construction and tie resolution.

This is legal/encoded walking connectivity, not sidewalk quality, personal safety, snow
clearance, slope, wheelchair access, or an ADA route. Those limitations are explicit.

### Snapping, thresholds, and ties

- Origins, full-service groceries, emergency resources, and GTFS stops snap to the nearest graph
  node within **200 meters** in projected space.
- No point outside the tolerance is snapped. There is no Euclidean routing fallback.
- Equal-distance node ties choose the lowest stable OSM node ID.
- Walking speed is **3 miles per hour**, exactly `80.4672` meters per minute.
- Thresholds are inclusive: ten minutes = `804.672 m`; fifteen = `1,207.008 m`; twenty =
  `1,609.344 m`.
- A resource exactly on the county-buffer boundary or threshold is included.
- Equal nearest-resource distances choose the lowest canonical resource ID for the displayed
  nearest resource; all tied resources remain in threshold counts.

### Grocery walking access

For each tract origin, multi-source weighted Dijkstra computes distance to the nearest active
`full_service_grocery`. Outputs retain nearest resource ID, `reachable`, network meters, walk
minutes, and counts within 10/15/20 minutes.

If the origin is validly snapped but its connected component contains no full-service grocery,
the raw state is `unreachable` with no invented distance. For ranking, all unreachable tracts sort
above every finite distance and tie with one another. An unsnapped origin or invalid graph is
missing and makes the tract insufficient.

The same threshold calculations may be produced for emergency resources, but only as contextual
outputs and only with their stale/verification state attached.

### Scheduled transit access

The analysis week is explicit source metadata. It is the first complete Monday-through-Sunday
week beginning on or after the GTFS retrieval date for which the feed provides service records;
if no complete week exists, validation fails. The scoring dates are that week's Tuesday and
Saturday. Both dates and the feed validity range enter the score-input fingerprint.

For each tract:

1. Find GTFS stops reachable within the inclusive ten-minute walking threshold.
2. For Tuesday and Saturday separately, select scheduled departures from `10:00:00` inclusive to
   `14:00:00` exclusive using `calendar.txt` plus `calendar_dates.txt`, or the latter alone when
   it is the feed's authoritative service calendar.
3. Deduplicate a trip reachable at multiple stops by `trip_id` so it represents one boarding
   opportunity.
4. Divide the unique departure count by four hours.
5. Set `scheduled_service_intensity` to the lower of Tuesday and Saturday departures per hour.

No reachable stop is a valid observed value of zero. Missing/invalid GTFS, an uncovered analysis
date, an unsnapped origin, or a failed calendar join is missing, not zero. The measure does not
model transfer quality, travel time to a grocery, fares, reliability, crowding, real-time
performance, paratransit, or service outside the two windows.

## 4. Scoring and contextual decisions

| Metric | Direction of greater need | v1 treatment | Reason |
|---|---:|---|---|
| SRAM population share beyond one driving mile from any SNAP retailer | Higher | Retail Access scoring input | Population-distributed federal access benchmark |
| Nearest full-service grocery walking access | Farther/unreachable | Retail Access scoring input | Local pedestrian access to explicitly classified full-service food retail |
| Full-service grocery counts within 10/15/20 minutes | Lower | Contextual | Explainability; not an additional correlated score input |
| Households with no vehicle available | Higher | Transportation Constraint scoring input | Direct transportation constraint |
| Scheduled transit service intensity within a ten-minute walk | Lower | Transportation Constraint scoring input | Explicitly approved non-investment access-gap input |
| Transit routes/stops/counts outside the formula | N/A | Contextual | Explainability only |
| Poverty, unemployment, education, housing burden | Higher | Deferred from Food Access Need | Already represented in Equity Baseline; avoids double-weighting |
| Emergency-food sites, types, and access | N/A | Contextual | Service response must not reduce measured need |
| Farmers markets, small/specialty/convenience retail | N/A | Contextual | Availability does not establish full-service grocery access |
| Public investment | N/A | Contextual outside score run | Never changes need or Priority |
| Transit travel time to a grocery | Higher | Deferred | Requires a separately approved reliable routing contract |
| Store quality, price, selection, hours | N/A | Deferred | No complete authoritative structured v1 source |

Score-run identity and context identity are separate. Emergency-food or investment changes may
change a contextual-resource snapshot, but cannot change, invalidate, or create a Food Access
Need score run.

## 5. Food Access Need v1 calculation

### Eligibility and completeness

The tract universe is the approved 2020 Milwaukee County tract universe from Equity Baseline v1.
A tract is eligible only when it has positive population, a complete approved Equity Baseline
result, and all four Food Access Need indicators. Every baseline-eligible tract must receive a
complete Food Access Need result for a run to validate. Any missing indicator produces
`insufficient_data`; weights are never redistributed. Zero-population tracts remain
`ineligible_zero_population`.

### Percentiles, ties, and weights

Indicator direction is normalized so higher percentile always means greater need. Among the
complete eligible comparison set, for `N > 1`:

`indicator percentile = 100 × (average_rank - 1) / (N - 1)`

For `N = 1`, percentile is 50. Average ranks preserve ties. Walking `unreachable` is an ordered
state above every finite distance, not a numeric imputation. Scheduled service intensity is
ranked in reverse because lower service means greater constraint.

Dimensions and weights are:

- Retail Access = 50% SRAM one-mile share percentile + 50% grocery-walk percentile.
- Transportation Constraint = 50% no-vehicle percentile + 50% reverse transit-intensity
  percentile.
- Raw Food Access Need composite = 50% Retail Access + 50% Transportation Constraint.
- Food Access Need county percentile = average-rank percentile of the raw composite using the
  same tie rule.

Each raw indicator therefore has a 25% effective composite weight. No weight is learned or
optimized from outcomes.

Bands are fixed:

- Very Low: `0–<20`
- Low: `20–<40`
- Moderate: `40–<60`
- High: `60–<80`
- Very High: `80–100`

Ties may create unequal band populations. Every output retains raw values, direction-normalized
percentiles, dimension values, raw composite, county percentile, band, source versions, quality
states, and methodology version.

### Equity Baseline pin in development

Development pins validated, verified, unpublished Equity Baseline run
`502e2a04-b013-53cd-8b09-c9144862701a`. The Food run records that run ID, its output hash,
methodology version, and source fingerprint. It fails if the tract universe or stored hash does
not match.

A Food run based on a validated-but-unpublished baseline may itself reach `validated` for
development verification, but it is not publishable. Production continues to read only
`published` runs. Neither this design nor a web deployment publishes either score.

## 6. Food Equity Priority matrix

Priority is a direct lookup using the approved Equity Baseline band and Food Access Need band.
Priority 1 is the highest overlap of vulnerability and food-access need; Priority 5 is the
lowest. The matrix is complete and deterministic:

| Equity Baseline \ Food Access Need | Very Low | Low | Moderate | High | Very High |
|---|---:|---:|---:|---:|---:|
| **Very Low** | 5 | 4 | 4 | 3 | 3 |
| **Low** | 4 | 4 | 3 | 3 | 2 |
| **Moderate** | 4 | 3 | 3 | 2 | 2 |
| **High** | 3 | 3 | 2 | 2 | 1 |
| **Very High** | 3 | 2 | 2 | 1 | 1 |

There is no adjustment for emergency-food sites, other services, investment, political
boundaries, funding history, or policy preference. Missing either band produces
`priority_insufficient_data`; a Priority value is never inferred.

## 7. Determinism and validation requirements

- Exact source bytes, byte size, SHA-256, published checksum when available, schema fingerprint,
  row count, retrieval time, validity range, and sanitized request metadata are manifested.
- Source IDs and dates are parsed strictly; malformed data cannot be coerced to zero.
- The canonical score-input fingerprint includes the methodology/registry version, scoring source
  manifests, full-service classification evidence, graph filter and thresholds, GTFS analysis
  dates/window, baseline run identity/hash, and scoring rules.
- Emergency-food and public-investment artifacts are excluded from the score-input fingerprint.
- Canonical ordering is GEOID, source ID, stable OSM ID, and GTFS ID as applicable.
- Repeated execution with identical inputs must produce the same output hash.
- Golden traces must reproduce each raw input, ranking direction, percentile, dimension,
  composite, band, matrix cell, Priority, quality state, and provenance link.
- A validated run requires full tract reconciliation, all source validators, no silent row loss,
  no unresolved active full-service grocery coordinates, no insufficient baseline-eligible tract,
  and zero prohibited contextual fields in score inputs.

## 8. Approval decisions

The 2026-08-29 approval covers all of these load-bearing choices:

1. the six scoring artifacts and exact vintages above;
2. the conservative full-service grocery classification and documented Super Store override;
3. the 2020 tract center of population as one origin per tract;
4. the pedestrian filter, 200-meter snap tolerance, 3-mph walk speed, and inclusive 10/15/20
   minute thresholds;
5. the Tuesday/Saturday 10 a.m.–2 p.m. scheduled transit formula;
6. transit frequency as a non-investment access-gap score input;
7. emergency food as stale contextual evidence pending terms and refresh;
8. exclusion of a separate economic domain;
9. equal indicator/domain weights, average-rank percentiles, fixed bands, complete-case rule, and
   no weight redistribution;
10. the complete 5×5 Food Equity Priority matrix; and
11. development-only use of the pinned validated, unpublished Equity Baseline run.

Any change to those choices requires a methodology version change, documentation, tests, and a
new run. Approval does not authorize publication or production mutation.
