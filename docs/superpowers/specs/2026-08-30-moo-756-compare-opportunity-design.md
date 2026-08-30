# MOO-756 Compare Areas and Opportunity Explorer Design

**Status:** Approved by Tarik on 2026-08-30

**Issue:** MOO-756 — Plan 5 — Compare + Opportunity Explorer

**Prepared:** 2026-08-30

**Design approval:** Satisfied. Tarik approved all four reviewed design sections—user experience,
architecture and data flow, components and responsive behavior, and verification and scope
limits—on 2026-08-30.

**Implementation gate:** Satisfied by Tarik's explicit “Approve MOO-756 design and plan.” on
2026-08-30. Implementation must follow the contract without silent deviation.

## Decision summary

MOO-756 adds two focused analytical workflows after the core Atlas experience: **Compare Areas**
and **Opportunity Explorer**. They are separate routes under an **Analyze** navigation group rather
than modes inside the Atlas or one combined GIS workspace. Compare Areas helps a reader understand
consistent evidence for two to five census tracts. Opportunity Explorer helps a reader find all
tracts matching explicit planning conditions. Neither workflow ranks tracts, chooses a winner,
recommends an intervention, or changes any approved analytical value.

Both workflows reuse the MOO-754 Atlas run selector and exact-run evidence boundaries. Public mode
may read only an internally consistent published Food Equity bundle. A guarded local development
preview may read only the one explicitly configured validated run and must retain the visible
preview warning. Strict Zod contracts and parameterized server queries validate every boundary.
The browser presents and filters UI state; it does not calculate scores or perform analytical GIS.

The first release uses only verified score evidence already tied to the selected run. Contextual
food sites, other resource availability, public land, and public investment are excluded from
Opportunity filtering until a separately approved analytical contract ties them safely to the
same version. Results are called **matching areas**, and the population summary is **population
living in matching tracts**. Those phrases avoid implying that the product has identified affected
people or recommended places.

## 1. Product experience

### 1.1 Information architecture and routes

The application navigation gains an **Analyze** group with two destinations:

- `/analyze/compare` — **Compare Areas**;
- `/analyze/opportunity` — **Opportunity Explorer**.

The Atlas remains the primary Explore route. Its selected-tract profile gains **Compare this
tract**, which opens Compare Areas with that tract already selected. People may also start on the
Compare page and use the existing authoritative tract/neighborhood search pattern to add areas.
Navigation marks the current page from the pathname; Atlas is no longer hard-coded as the current
destination.

The routes have separate headings, introductory copy, URL contracts, and recovery states. They may
share contracts, evidence components, search behavior, selected-tract content, run banners, and
data-quality explanations. They must not be collapsed into one large workspace or presented as
Atlas modes without a future approved amendment.

### 1.2 Compare Areas selection and durable state

Compare Areas supports exactly two through five unique 2020 Census tract GEOIDs. Public labels use
**Census tract ID** rather than unexplained GEOID terminology. The comparison URL stores the
selected tract IDs in their stable selection order, allowing reload,
copy/share, and browser back/forward behavior to reproduce the same comparison.

The page handles these states explicitly:

- no selected tract, with guidance to add areas;
- one selected tract, with guidance that one more is required;
- two through five valid unique tracts, with the complete comparison;
- an attempt to add a sixth tract, with a plain-language five-area limit;
- duplicate, unknown, invalid, unavailable-run, and server/contract failure states.

Invalid and duplicate URL values are not guessed. A partially valid request does not produce a
partial evidence comparison. A user may remove a tract with a clearly labeled control that does
not depend on an icon alone. Removing a tract updates the URL and leaves the remaining tracts in
their established order.

### 1.3 Summary-first comparison

The first view presents the evidence most useful for orientation:

- population;
- Food Equity Priority;
- Equity Baseline and band;
- Food Access Need and band;
- share of the population more than one driving-network mile from a SNAP-authorized retailer;
- walking-network time or explicit reachability state for the nearest approved full-service
  grocery;
- share of households with no vehicle available;
- reverse-ranked scheduled transit service intensity.

The exact public labels and definitions must remain consistent with the approved Equity Baseline,
Food Equity, and Atlas copy. SNAP authorization must not be described as full-service grocery
evidence. Scheduled transit must not be described as reliability, grocery travel time, or real-time
service. A valid observed zero remains zero; missing, unreachable, suppressed, conflicting, and
not-applicable states remain distinct.

The 13 underlying Equity Baseline indicators are available through progressive disclosure rather
than filling the first screen. HeroUI accordions organize them in their approved groups:

1. demographic / structural;
2. socioeconomic;
3. health.

Each detailed measure preserves the Atlas evidence model: observed value or explicit data state,
unit, Milwaukee County percentile, contribution when relevant, reliability/uncertainty, limitation,
source, vintage, and definition. Expanding details changes presentation only and never triggers a
different run or formula.

### 1.4 Deterministic Differences summary

The Differences view is a deterministic explanation of substantial contrasts, not a ranking and
not an LLM-generated summary. It builds candidates only from:

1. different Food Equity Priority levels among the selected tracts;
2. different Equity Baseline bands;
3. different Food Access Need bands;
4. an approved displayed measure whose highest and lowest valid Milwaukee County percentiles are
   at least 20 percentile points apart.

Categorical candidates appear in the fixed order above. Numeric candidates follow in descending
percentile-point gap, with the approved presentation order as the stable tie-breaker. The view
shows at most five candidates. Every statement names the applicable tracts and evidence, uses
neutral comparison language, and never says that one tract is better, worse, deserving, or the
recommended choice.

If no candidate meets the rule, the page says that no large differences were found under these
rules; it does not say the tracts are the same. A numeric candidate requires at least two valid
values. Missing values are disclosed and never treated as zero or used to create a gap. When an
included ACS estimate has a stored caution, high-uncertainty, or unclear-reliability state, the
statement carries an uncertainty warning and points the reader to the estimate range. The warning
explains that the percentile inherits uncertainty; it does not silently alter the approved value
or score.

### 1.5 Opportunity Explorer filters

Opportunity Explorer opens with no applied filters. Its first release includes only verified
score evidence from the exact selected Food and Equity runs:

- Food Equity Priority;
- Equity Baseline band/percentile;
- Food Access Need band/percentile;
- no-vehicle household share;
- SNAP retailer access share;
- full-service grocery walking time, threshold, or explicit reachability state;
- scheduled transit service intensity.

Categorical choices within one category use OR semantics. For example, selecting Priority 1 and
Priority 2 matches either level. Separate categories use AND semantics. For example, Priority 1
or 2 combined with a high no-vehicle barrier must satisfy both category conditions. Numeric
minimum/maximum thresholds are inclusive. The UI explains these rules without requiring GIS or
database terminology.

Editing the controls creates a pending filter state. **Apply filters** commits that state to a
normalized shareable URL and updates the map, list, count, and population summary together.
Applied filters remain visible as removable chips. Removing a chip and applying or clearing all
filters updates every result surface consistently. URL parameter names, category order, repeated
values, and numeric formatting are canonicalized so equivalent conditions produce one stable URL.

### 1.6 Matching-area results and population semantics

Results are headed **Matching areas** and use no undocumented relevance score. Tracts appear in
canonical tract-name/Census-tract-ID order, never an implied need ranking. The summary reports:

- number of matching tracts;
- known population living in matching tracts;
- number of matching tracts with unavailable population, when nonzero;
- number excluded because a required filter value is missing, when nonzero.

Population is summed only from valid population values attached to the selected run's canonical
geography. A matching tract with missing population remains in the matching-area count but is not
silently added as zero; the known total and missing-tract count are shown separately. An observed
zero-population tract contributes zero and remains distinguishable from missing population. The
copy does not say **affected population**, **people served**, or **people recommended**.

Selecting a matching tract uses the shared selected-tract profile content so the person can inspect
the same evidence and quality limits as in the Atlas. The synchronized map highlights returned
GEOIDs only. Every essential matching result is also available in the non-map list.

## 2. Data authority, contracts, and query boundary

### 2.1 Exact-run authority

Both Analyze routes reuse the existing guarded Atlas selector:

- public mode reads only one governed published Food bundle and its exact pinned Equity Baseline
  run;
- local validated preview requires the existing explicit server-only development configuration,
  is never allowed in production, remains private/uncached, and visibly says **Validated preview
  — not published**;
- selection never uses a latest-row query, browser-provided run ID, mixed runs, or a fallback to a
  draft/validated run in public mode.

A comparison or filter response is unavailable unless the server proves that every score,
component, indicator, geography, method version, and source lineage belongs to the same selected
bundle. A web deployment does not publish or modify a score run.

### 2.2 Strict presentation contracts

`@mke/contracts` owns strict Zod schemas for Compare and Opportunity request/response boundaries.
At minimum they represent:

- available/unavailable discriminated unions and safe recovery reasons;
- browser-safe immutable run/methodology labels;
- 2–5 unique comparison GEOIDs and complete tract evidence;
- explicit value/data-state unions, quality, uncertainty, and provenance;
- normalized Opportunity filter categories and inclusive threshold operators;
- matching GEOIDs, tract summaries, counts, known-population totals, missing-population counts,
  and missing-filter exclusions.

Schemas reject unknown keys at system boundaries. Database details, credentials, storage paths,
raw source artifacts, and operational validation payloads do not cross into the browser. An
immutable score-run ID may appear only in a validated browser-safe data response when it is needed
to bind a follow-up request to the same selected bundle. It is not a credential, never appears in
the share URL or a static client bundle, and public no-data responses expose no validated-run
identity. Server output is validated before delivery; client input is parsed before it reaches a
query.

### 2.3 Compare repository

One bounded parameterized server operation loads all requested tracts against the selected bundle.
It must:

- validate the two-to-five limit and uniqueness before querying;
- join every tract to the exact Food run, pinned Equity run, approved score/component values,
  canonical geography, uncertainty, and source lineage;
- preserve requested presentation order without using it as analytical rank;
- verify expected cardinality and evidence completeness for every requested tract;
- reject unknown geography, duplicate evidence, mixed-run evidence, or a mismatched pinned baseline
  as a complete unavailable response rather than constructing a partial comparison.

The deterministic Differences helper consumes only this validated presentation contract. It does
not query additional data, use an LLM, infer missing values, or change score calculations.

### 2.4 Opportunity repository

The server validates and normalizes applied filters before constructing parameterized SQL. The
repository applies OR within a category and AND across categories against the exact selected run.
PostgreSQL owns set filtering and canonical ordering. PostGIS continues to own analytical spatial
relationships, although the approved first-release filters require no new browser or client GIS.

The response includes matching GEOIDs and concise tract summaries, not duplicate tract geometry.
The existing bounded Atlas feature collection supplies shapes. MapLibre highlights only the
server-returned IDs; it does not decide which tracts match.

If an active filter requires a value a tract does not have, that filter is unevaluable for that
tract. The missing-data exclusion count includes the tract only when every other active filter
that can be evaluated matches. A tract that fails any evaluable active filter is an ordinary
non-match even if another active field is missing. This tri-state rule prevents the missing-data
count from being inflated by tracts that could not have matched anyway. No missing value is
coerced to zero, to the lowest band, or to an unreachable state. With no applied filters, the
deterministic result is the complete canonical tract set available to the selected bundle,
including explicit quality/eligibility states.

### 2.5 URL, cache, and failure behavior

Compare URLs store selected GEOIDs only. Opportunity URLs store only supported applied filter
state in normalized order. Transient UI state—open accordion, hover, sheet position, and pending
unapplied filters—does not need to be durable.

Published responses may be cached only by immutable publication identity plus normalized request
identity. Validated preview responses remain dynamic, private, and outside shared/public caches.
Invalid URLs, fewer than two comparison tracts, unavailable publication, invalid preview
configuration, unknown geography, no matches, database errors, and contract failures each receive
plain-language recovery states. Safe user copy is separate from detailed server diagnostics, and
neither leaks credentials or internal data paths.

## 3. Web components and responsive behavior

### 3.1 Shared component boundaries

The implementation uses focused feature folders and shared presentation contracts. Expected
responsibilities include:

- `CompareWorkspace` for validated URL selection, add/remove actions, and responsive
  presentation;
- `CompareSummary`, `DifferencesView`, `ComparisonMatrix`, and `ComparisonCards` over one shared
  evidence model;
- `OpportunityWorkspace` for pending/applied filter state and synchronized results;
- `OpportunityFilters`, `AppliedFilterChips`, `MatchingAreasSummary`, and `MatchingAreasList`;
- a focused MapLibre result-highlight layer that consumes matching GEOIDs and existing Atlas
  geometry;
- shared run-state, search, tract-profile, provenance, quality, and measure-display components
  where their contracts are genuinely identical.

Business rules are not duplicated across desktop/mobile components. Server Components load and
validate initial evidence by default; Client Components are limited to interactions that require
browser state.

### 3.2 Compare responsive presentation

Compare Areas is a focused, map-free reading experience.

- At 1024 and 1440 px, a semantic comparison table uses evidence as rows and tract names as
  column headings. Headers remain understandable to assistive technology, and numeric values use
  aligned figures.
- At 375, 430, and 768 px, the same contract becomes consistently ordered stacked tract cards plus
  a separate Differences view. Essential comparison evidence cannot require horizontal swiping.
- The summary appears first at every width. Accordions reveal the 13 detailed Equity Baseline
  indicators without changing their meaning.
- Add and remove controls are keyboard operable, clearly named, and provide practical
  44-pixel targets.

The mobile design is not a shrunken desktop matrix, and the desktop design does not hide evidence
that is available on mobile.

### 3.3 Opportunity responsive presentation

- At 1024 and 1440 px, filters, MapLibre, and the Matching areas summary/list appear together in a
  coordinated planning workspace.
- At 375, 430, and 768 px, the map remains visible while HeroUI Pro sheets present filters and
  results. Opening or closing a sheet preserves applied filters, selected tract, and map context.
- Apply, clear, and chip removal update URL, map, summary, and list as one state transition.
- Selecting a result opens the shared tract profile content in the existing responsive container.

The map is an enhancement, not the only route to evidence. Matching-area count, population,
quality states, tract labels, selection, and detailed evidence remain available without operating
the map.

### 3.4 HeroUI, MapLibre, and visual language

HeroUI and HeroUI Pro own navigation, SearchField, Button, Card, Chip, Accordion, Sheet,
EmptyState, and related interaction primitives where their verified APIs meet the need. Current
documentation must be checked before implementation. Custom primitives require a documented gap.
MapLibre remains responsible only for geographic rendering, navigation, selection, and result
highlighting.

The visual language remains a restrained civic evidence workspace: neutral surfaces, clear type,
limited decoration, consistent spacing, and semantic colors that never carry meaning alone.
Priority, band, reliability, missing-data, selected, and matching states always include text.

### 3.5 Accessibility and plain language

Both routes target WCAG 2.2 AA where reasonably achievable and require:

- semantic headings, landmarks, table relationships, lists, buttons, and form labels;
- complete keyboard operation and visible focus;
- useful screen-reader names and instructions without repeated noise;
- predictable focus entry and return when sheets open and close;
- polite announcement of applied result-count changes without rereading the full list;
- reduced-motion behavior, forced-colors support, sufficient contrast, and practical 44-pixel
  touch targets;
- no critical hover-only or color-only interaction.

Public copy uses short sentences and familiar words. Approved method names remain exact and are
defined nearby. **Census tract ID**, **matching areas**, and **population living in matching
tracts** are preferred reader-facing terms. English-language access is not described as literacy.
Differences and filters describe evidence and conditions, not causes, resident quality, or policy
recommendations.

## 4. Verification, performance, and completion

### 4.1 Test-first analytical and contract verification

Implementation begins with failing tests for:

- strict available/unavailable Compare and Opportunity contracts;
- two-to-five unique comparison IDs and stable URL normalization;
- exact-run, pinned-baseline, cardinality, and no-partial-response database behavior;
- all approved summary and detailed evidence fields;
- deterministic Differences candidate rules, 20-point inclusive threshold, fixed ordering,
  five-item cap, missing values, uncertainty warnings, and no winner language;
- Opportunity URL normalization, OR-within/AND-across semantics, inclusive thresholds, clearing,
  and no-filter behavior;
- explicit missing-filter exclusions, zero versus missing population, and known-population sums;
- canonical tract-name/Census-tract-ID result ordering;
- synchronized URL, map, list, count, population summary, and selected-profile state.

Golden cases include complete high-, middle-, and low-priority tracts, known high-uncertainty ACS
evidence, tract `55079187200` with insufficient Food evidence, and both approved zero-population
tracts. Tests use exact expected data states; fixtures do not invent public evidence or masquerade
as a published run.

### 4.2 Responsive and accessibility verification

Component and Playwright/axe coverage runs at 375, 430, 768, 1024, and 1440 px. It verifies:

- keyboard-only tract selection, comparison editing, filters, chips, accordions, results, and
  selected-profile use;
- table/card semantic equivalence and no swipe-only essential evidence;
- sheet focus movement and return, Escape behavior, and state preservation;
- back/forward navigation, reload, and copied normalized URLs;
- map/list synchronization and complete non-map access;
- result-count live announcements without noisy full-list announcements;
- reduced motion, forced colors, visible focus, contrast, and practical touch targets;
- public fail-closed behavior and the exact guarded local validated preview.

Automated axe checks supplement manual keyboard and screen-reader-oriented review. Completion also
requires a HeroUI/MapLibre design review and a plain-language review of every new public string.

### 4.3 Payload and caching budgets

- A complete five-tract Compare response, including all approved detailed measures and
  provenance, must be no more than **500 KB uncompressed**.
- An Opportunity response excluding already-loaded Atlas geometry must be no more than **150 KB
  uncompressed**.
- Both budgets are measured with worst-case approved fixtures and enforced in tests.
- Opportunity reuses existing Atlas geometry rather than returning duplicate polygons.
- Published cache keys include immutable bundle and normalized request identity; preview responses
  demonstrate private, uncached behavior.

If a budget fails, implementation reduces redundant presentation data or loads reviewed detail on
demand. It must not omit essential mobile evidence, drop provenance, weaken exact-run validation,
or move analytical calculation to the browser.

### 4.4 Documentation and completion gate

Completion requires updated product, architecture, UX, data, environment, and verification
documentation wherever implementation changes current behavior. Verification records the exact
run/methodology identity, request traces, payload sizes, result counts, missing-data cases, public
fail-closed proof, five-width screenshots, accessibility review, and complete repository/CI
results.

MOO-756 is not complete until the real local preview has received Tarik's load-bearing product
review, responsive/accessibility evidence is recorded, CI passes, the branch diff shows no
methodology/publication/out-of-scope change, and the approved pull request is merged. A deployment
or validated preview does not publish data.

## 5. Alternatives considered and rejected

### Atlas modes

Switching one screen among Atlas, Compare, and Opportunity would retain map context, but it would
mix three different user tasks and make URL, responsive, and focus behavior harder to understand.
The approved choice is separate Analyze routes with easy links from the Atlas.

### One combined Analyze page

Combining comparisons and filters would reduce navigation but create a large, cognitively heavy
workspace. The approved choice gives each analytical job a focused page.

### Show all 17 measures immediately

This maximizes immediate density but makes both desktop and mobile comparison difficult to scan.
The approved choice is summary first, with the 13 Equity Baseline indicators expandable.

### Make users choose measures before comparing

This is flexible but adds configuration before a reader can understand any area. The approved
first release uses a consistent evidence summary and progressive detail.

### Always show the five largest differences

This would turn small numerical noise into apparently important findings. The approved rule shows
only band/priority changes and percentile gaps of at least 20 points, capped at five.

### No automatic Differences summary

A table alone is transparent but places the full interpretation burden on readers. The approved
deterministic summary improves orientation without an LLM, a winner, or a recommendation.

### Filter display-only food sites or show unavailable future filters

Food-site availability is useful context, but the approved 89-site layer is display-only and not
verified as a run-tied analytical input. Disabled future controls also add complexity without
valid results. The first release therefore exposes only verified score evidence.

## 6. Explicitly out of scope

- Any change to Equity Baseline, Food Access Need, Food Equity Priority, bands, weights,
  thresholds, sources, eligibility, or missing-data rules.
- Publishing, superseding, or mutating a score run; MOO-768 owns governed Food publication.
- AI/LLM summaries, AI scoring, hidden relevance rankings, winner labels, intervention or funding
  recommendations, and causal claims.
- Browser-side score calculation, percentile calculation, analytical filtering, containment, or
  spatial analysis.
- Food-site/resource availability filters, public-land filters, public-investment filters, or
  unavailable **Coming soon** controls.
- Address search, new ZIP/municipality authority, or any inferred neighborhood boundary.
- CSV/export work, which belongs to Plan 6.
- Authentication, saved comparisons, saved workspaces, collaboration, alerts, predictive models,
  and scenario simulation.
- Treating a comparison, filter match, map highlight, or population total as a recommendation or
  evidence of causation.
