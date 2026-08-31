# Product Requirements Document — MKE Service Equity / Food Equity MVP

## 1. Objective

Build a responsive public civic decision-support application that allows a user to:

1. See Food Equity Priority across Milwaukee County.
2. Search for and select an area.
3. Understand why a census tract is prioritized.
4. Inspect underlying Equity Baseline and Food Access Need measures.
5. View existing food resources and accessibility constraints.
6. Compare 2–5 census tracts.
7. Identify areas matching predefined planning conditions.
8. Trace important metrics to source, vintage, definition, and methodology.
9. Download tract-level evidence.

## 2. Central question

> Where in Milwaukee County do underlying equity conditions and food-access challenges overlap, what resources currently exist, and which areas warrant additional investigation?

The system does not make funding decisions and does not automatically recommend interventions.

## 3. Jobs to be done

### JTBD 1
When evaluating food access, I want to quickly see where high-need conditions are geographically concentrated so I know where deeper investigation should begin.

### JTBD 2
When I select a priority area, I want to understand which factors contribute to its classification so I can explain the evidence.

### JTBD 3
When considering multiple areas, I want to compare them using consistent measures.

### JTBD 4
When evaluating a possible service gap, I want to see existing resources and mobility constraints alongside need.

### JTBD 5
When I use a metric in a planning discussion, I want its source, date, definition, and methodology.

## 4. Functional requirements

### FR-1 Atlas Map
The MapLibre map must:

- render Milwaukee County census tracts
- default to Food Equity Priority
- support pan/zoom/reset
- support pointer hover and touch selection
- show a clear legend
- toggle analytical and resource layers
- filter priority classes
- maintain selected tract state when responsive panels open/close
- support browser geolocation only with user permission

### FR-2 Search
Support:

- street address
- census tract
- ZIP code
- municipality

Support neighborhood and known-place search only when reliable.

A resolved coordinate must be spatially joined to the canonical tract.

### FR-3 Tract Profile
Required sections:

- Overview
- People & Conditions
- Food Access
- Food Resources
- Mobility
- Nearby Opportunities when reliable
- Data & Sources

A user must reach the explanation of a selected priority tract within two interactions from the Atlas.

### FR-4 Equity Baseline
Calculate three versioned subindices:

- Demographic / Structural
- Socioeconomic
- Health

Produce subindex percentiles, overall percentile, and classification.

### FR-5 Food Access Need
Measure independently from the Equity Baseline:

- Retail Access: SNAP retailer low-access share and full-service-grocery walking access
- Transportation Constraint: household vehicle access and reverse-ranked scheduled transit
  service intensity

Emergency food is contextual and does not reduce need. Economic conditions already represented
in the Equity Baseline are not duplicated in Food Access Need.

### FR-6 Food Equity Priority
Combine Equity Baseline and Food Access Need using the documented priority matrix.

Use:

- Priority 1 · Highest
- Priority 2 · High
- Priority 3 · Moderate
- Priority 4 · Lower
- Priority 5 · Lowest

Exact matrix boundaries are controlled by the methodology document and tests.

### FR-7 Food Resources
Support:

- full-service grocery
- other grocery
- SNAP retailer
- pantry
- meal program
- farmers market
- other verified community food resource

Every resource must carry source and verification metadata.

### FR-8 Compare Areas
Allow 2–5 unique tracts in stable selection order.

Desktop: comparison matrix.
Mobile and tablet: stacked comparison cards with the same evidence.

Provide summary-first Food Equity evidence, expandable Equity Baseline indicators, and a
deterministic rule-based Differences summary. Differences may describe Priority or band changes
and approved measure gaps of at least 20 county-percentile points, show no more than five items,
and never rank tracts or recommend a choice.

### FR-9 Opportunity Explorer
Support structured filters such as:

- Food Equity Priority
- Equity Baseline band and percentile
- Food Access Need band and percentile
- household vehicle access
- SNAP retailer access
- full-service grocery walking access and reachability
- scheduled transit service intensity

Output:

- matching tract count
- known population living in matching tracts
- matching tracts with unavailable population, when present
- tracts excluded because required filter data is missing, when present
- synchronized map
- complete non-map tract result list

Choices within one category use OR; separate categories use AND; numeric thresholds are inclusive.
Edits remain pending until applied, and only applied canonical URL state drives server results.
Use the term **matching areas**, not recommendations. Food-site availability, public land, and
public investment are context only and are not Opportunity filters in the first release.

### FR-10 Methodology and provenance
For every substantive metric, the user must be able to determine:

- definition
- publisher
- source
- vintage
- geography
- calculation
- retrieval/update information
- quality state

### FR-11 Export
MVP must support CSV export of published tract-level evidence including:

- GEOID
- population
- indicator values
- component percentiles
- Equity Baseline
- Food Access Need
- Food Priority
- methodology version
- score run

### FR-12 Shareable state
Meaningful Atlas, tract, comparison, and opportunity states should use shareable URLs where technically practical.

Compare uses repeated ordered `tract` parameters. Opportunity uses only the supported normalized
applied-filter parameters. Run IDs, pending form edits, open sheets, hover, and other transient UI
state do not belong in share URLs.

### FR-13 Analyze data authority

Both Analyze routes use the same exact-run selector as the Atlas. Public mode reads only a
governed published Food Equity bundle and its pinned Equity Baseline run. A guarded local
development preview may read only one explicitly configured validated run and must remain visibly
marked as unpublished. There is no public fallback to a draft or validated run, and loading a web
deployment does not publish data.

The server owns run selection, joins, filtering, canonical ordering, missing-data classification,
population summaries, and contract validation. The browser owns pending controls and presentation.
MapLibre does not calculate matches, scores, percentiles, or spatial relationships.

## 5. Responsive requirements

Every primary workflow must function at:

- 375 px
- 430 px
- 768 px
- 1024 px
- 1440 px

Requirements:

- no critical hover-only interaction
- minimum practical touch targets
- mobile drawers/bottom sheets for filters/layers/profiles
- selected map state survives panel state changes
- comparison remains usable without squeezing a desktop table
- essential evidence never disappears on mobile
- no desktop fallback requirement

## 6. Accessibility

Target WCAG 2.2 AA where reasonably achievable.

Required:

- keyboard navigation
- visible focus
- semantic markup
- screen-reader labels
- sufficient contrast
- reduced-motion support
- priority not communicated by color alone
- meaningful touch targets
- non-map access to critical analytical content

## 7. Data quality

Allowed states:

- verified
- provisional
- stale
- missing
- suppressed
- conflicting

Hard rule: **missing is not zero**.

If a score cannot be supported, show **Insufficient data**.

## 8. Privacy

The MVP uses public/aggregated geography-level data.

Do not store or expose individual-level:

- health records
- SNAP participation
- benefits records
- identifiable household data

## 9. Security

- server-side secrets only
- no browser database credentials
- parameterized queries
- Zod validation at system boundaries
- rate-limit abuse-prone endpoints
- no direct production mutations from local development

## 10. Success measures

A small moderated pilot should aim for 80%+ of users being able to:

1. find a specified area
2. identify Food Equity Priority
3. identify at least two contributing conditions
4. compare it with another tract

without facilitator instruction.

## 11. Explicit MVP exclusions

Do not build:

- authentication/accounts
- saved dashboards
- collaborative workspaces
- AI chat
- AI scoring
- AI policy recommendations
- predictive models
- scenario simulations
- automatic funding allocations
- real-time grocery prices
- crowdsourced editing
- native mobile apps
- multilingual UI
- CMS
- statewide coverage
- Housing/Health/Transit/Parks modules

## 12. MVP release definition

MVP is complete when a public user can open MKE Service Equity on desktop or smartphone, view Food Equity Priority across Milwaukee County, search for a location, inspect and understand a tract classification, view food resources, compare tracts, identify areas matching structured conditions, understand provenance, and download tract-level evidence.
