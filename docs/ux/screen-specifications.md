# Screen Specifications

## 1. Atlas

### Desktop
Three-column analytical workspace:

- left: layers/filters
- center: MapLibre map
- right: selected tract context panel

Default layer: Food Equity Priority.

### Mobile
Map-first.

- prominent search
- map canvas
- Filters and Layers controls
- selected tract opens bottom sheet
- bottom sheet can expand without losing map context

### Search

The current local-preview search accepts a full or partial Census tract ID, tract label, or name
from the persisted City of Milwaukee neighborhood reference. Every result is resolved by the
server to a canonical census tract before it can change the shareable `tract` URL state.
Neighborhood matches at or above the approved 1% display threshold show the tract and area share
so a neighborhood name never silently chooses one tract. If the exact validated neighborhood
snapshot is unavailable, tract search remains available and no neighborhood result is invented.

The field says plainly that ZIP and address search are not available yet. ZIP/ZCTA and
municipality search require approved local boundary snapshots; address search additionally
requires the separately approved provider, privacy, rate-limit, and PostGIS-containment contract.

## 2. Tract Profile

Header:

- tract label
- Food Equity Priority
- population
- Food Access Need band
- Equity Baseline band

Sections:

1. What this means
2. Why this result (13 Equity Baseline inputs)
3. Food access evidence (4 Food Access Need inputs)
4. Community context
5. Data quality
6. Data and sources

The opening summary explains why the tract received its priority using deterministic rules. Each
scoring input shows its value or explicit data state, county percentile, score-point contribution,
uncertainty when available, and limitation. Community context is kept separate from scoring and
remains unavailable when its exact snapshot is not tied to the run.

Public copy uses “Census tract ID,” defines necessary technical terms, and explains that score
contributions are not raw percentages, changes over time, causes, or recommendations. **Compare
this tract** now hands the selected tract to Compare Areas; download remains later Plan 6 work.

The Equity Baseline band has a visible “How to read Equity Baseline” explanation beside the result.
It says that the baseline combines 13 measures covering income and housing costs, education and
jobs, health and disability, English-language access, and populations that have historically faced
unequal access to public resources. High means more combined barriers than in many other Milwaukee
County tracts, low means fewer, and moderate means near the county middle. The copy states that the
comparison describes conditions in a place and does not rate or judge residents.

The Food Equity Priority legend defines all five levels in plain language. Priority 1 is the
strongest overlap of Food Access Need and other measured barriers; Priority 5 is the weakest
overlap in that data version, with the middle levels described as progressively smaller or mixed
overlap. A planning note says Priority 1 and 2 tracts are places to learn more about first, then
directs the reader to inspect the evidence, compare nearby areas, and talk with residents and local
groups. It also says the number does not choose a project, prove a cause, or automatically decide
funding.

ACS measure cards separate source quality from sampling reliability. “Verified data” means the
source and pipeline checks passed; it does not claim that a survey estimate is exact. A second
text label shows “More stable estimate,” “Use with caution,” “High uncertainty,” or “Reliability
unclear” from the pipeline's stored reliability state. The card shows the estimate's Census 90%
range, explains that the county percentile inherits the same uncertainty, and tells planners to
compare nearby tracts and confirm with local data and residents before acting. Color is never the
only reliability signal. The Data quality section explains that more survey responses can reduce
uncertainty and that rounding or hiding the margin does not improve precision.

Location context may show municipality, Census ZCTA, and the approved City of Milwaukee
neighborhood reference as separate concepts. When the City reference covers at least half the
tract and one neighborhood is a majority of the covered area, use “Mostly in {name}” followed by
all other reportable overlaps. Otherwise use “Spans {names},” “Partly covered by the City
neighborhood reference,” or “No City of Milwaukee neighborhood reference for this tract.” Each
percentage is labeled as an area share of the covered portion, not a population share. An info
disclosure explains that the City-published reference is not an official or neighborhood-
association boundary and is not continuously updated.

## 3. Compare Areas

Route: `/analyze/compare`.

Repeated `tract` parameters store two to five unique Census tract IDs in selection order. Zero or
one selected tract shows setup guidance and keeps authoritative tract/neighborhood search usable.
Invalid, duplicate, unknown, and more-than-five values never create a partial comparison. Clearly
named remove controls update the URL without reordering the remaining selection.

The first evidence view contains population, Food Equity Priority, Equity Baseline and band, Food
Access Need and band, SNAP retailer access share, nearest full-service-grocery walking state,
households without a vehicle, and scheduled transit service intensity. Accordions reveal the same
13 Equity Baseline indicators, definitions, percentiles, contributions, uncertainty, limitations,
vintages, and sources used by the tract profile.

At 1024 and 1440 pixels, use a semantic comparison matrix with measures as rows and tracts as
column headings. At 375, 430, and 768 pixels, use consistently ordered stacked tract cards. The
summary, expanded evidence, selection controls, and Differences meaning remain equivalent without
horizontal table squeezing or swipe-only evidence.

Differences is deterministic and not LLM-generated. It considers Priority, Equity Baseline band,
Food Access Need band, and approved measure gaps of at least 20 county-percentile points. Category
items use fixed order; numeric items use descending gap with a stable presentation-order tie-break.
Show at most five neutral statements. Missing values never become zero or create a gap, and stored
uncertainty follows an included measure. When no rule is met, say no large differences were found
under these rules—not that the tracts are identical.

## 4. Opportunity Explorer

Route: `/analyze/opportunity`.

Use structured controls for Food Equity Priority, Equity Baseline band/percentile, Food Access
Need band/percentile, no-vehicle share, SNAP retailer access share, full-service-grocery walking
time/reachability, and scheduled transit service intensity. Food sites, public land, and public
investment are not filters. Do not show disabled or “Coming soon” controls for them.

The canonical URL parameter order is `priorities`, `equity-bands`,
`equity-percentile-minimum`, `food-need-bands`, `food-need-percentile-minimum`,
`no-vehicle-minimum-percent`, `snap-low-access-minimum-percent`,
`grocery-walk-minimum-minutes`, `include-unreachable-grocery`, and
`transit-maximum-trips-per-hour`. Categorical values repeat their parameter. Invalid values do
not produce partial results, and equivalent valid conditions normalize to one stable URL.

Choices within one category use OR. Separate categories use AND. Numeric minimum/maximum
thresholds are inclusive. Editing creates pending state; **Apply filters** alone commits the draft
to the normalized URL and refreshes the map, list, count, and population together. Applied chips
are individually removable, and **Clear all** returns to the complete canonical tract set.

Output includes matching tract count, known population living in matching tracts, a separate
missing-population count when needed, missing-filter-data exclusions when needed, a synchronized
map, and a complete non-map list. Missing filter data is counted only when every other evaluable
active condition matches. Observed zero remains zero; missing and unreachable remain distinct.

Results use canonical tract-name/Census-tract-ID order and are never ranked. Selecting a map shape
or list item opens the same tract evidence. At 375, 430, and 768 pixels, the map remains visible
while HeroUI Pro sheets contain filters and results with initial focus, containment, Escape close,
and focus return. At 1024 pixels, filters and map share the first row and results use the readable
area below. At 1440 pixels, filters, map, and results use three columns. Sheet changes preserve
pending/applied filters, selection, and map context.

Unavailable publication, invalid links, no matches, and missing-data states use plain-language
recovery copy. A validated development preview is visibly marked **Validated preview — not
published**. Public mode with no governed publication shows no validated evidence.

## 5. Methodology

Opening explanation:

1. Measure underlying equity conditions.
2. Measure food-access conditions.
3. Compare tracts across Milwaukee County.
4. Identify where high need and limited access overlap.

Allow deeper navigation into indicators, classifications, data quality, vintages, and version history.

## 6. Data Sources

Show dataset, publisher, vintage, status, definition, and links/methodology.

## Layer organization

### Conditions
- Food Equity Priority
- Equity Baseline
- Food Access Need
- Vehicle Access
- Health Conditions

### Food Resources
- Full-Service Grocery
- Other Food Retail
- Pantries — approved Data You Can Use/Milwaukee Food Council source-listed display layer; check before visiting
- Meal Programs — included in the same approved source-listed display layer; check before visiting
- Farmers Markets
- Community Resources

The Food Resources control explains before activation that the locations are for finding possible
help and do not affect tract scores. Selecting a place shows its source-listed type, address,
phone, provider website, and narrative source note when present. Every selected-place view says
that current hours and services were not independently confirmed, advises the reader to check
before visiting, credits Data You Can Use, Milwaukee Food Council, and UWM Institute for Systems
Change and Peacebuilding, and links to the original Milwaukee Food Environment Map. The URL may
store `context=food_sites` and a validated stable `site` identifier; unknown identifiers are
dropped rather than guessed.

### Access
- Walking Access
- Transit Access

### Planning
- Public Land
- Public Investment
- Municipal Boundaries
- Aldermanic Districts
- Supervisory Districts
