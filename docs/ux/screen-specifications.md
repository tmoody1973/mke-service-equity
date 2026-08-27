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
- municipality/context
- population
- Compare
- Download

Sections:

1. Overview
2. People & Conditions
3. Food Access
4. Food Resources
5. Mobility
6. Nearby Opportunities
7. Data & Sources

The opening summary explains why the tract is prioritized using deterministic rules.

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
