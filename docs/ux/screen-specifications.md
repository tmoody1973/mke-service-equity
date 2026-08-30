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
- Pantries
- Meal Programs
- Farmers Markets
- Community Resources

### Access
- Walking Access
- Transit Access

### Planning
- Public Land
- Public Investment
- Municipal Boundaries
- Aldermanic Districts
- Supervisory Districts
