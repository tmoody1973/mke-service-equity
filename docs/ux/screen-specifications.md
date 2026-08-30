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
contributions are not raw percentages, changes over time, causes, or recommendations. Compare and
download controls are later-plan features, not part of the current profile.

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

Support 2–5 tracts.

Desktop:
comparison table/matrix.

Mobile:
swipeable or stacked cards plus Differences view.

Differences summary is deterministic, not LLM-generated.

## 4. Opportunity Explorer

Use structured filters rather than a generic GIS query builder.

Example fields:

- Priority
- no-vehicle threshold
- grocery access
- walking access
- resource availability
- public land nearby

Output:

- matching count
- estimated population
- synchronized map
- result list

No undocumented ranking.

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
