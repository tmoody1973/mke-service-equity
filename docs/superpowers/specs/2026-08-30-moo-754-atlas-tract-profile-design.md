# MOO-754 Food Equity Atlas and Tract Profile Design

**Status:** Approved by Tarik on 2026-08-30

**Issue:** MOO-754 — Plan 4 — Food Equity Atlas + Tract Profile

**Prepared:** 2026-08-30

**Implementation gate:** Satisfied by Tarik's explicit `approve MOO-754 design and plan`
response on 2026-08-30. Later tasks must implement this contract without silent deviation.

## Decision summary

MOO-754 turns the approved Equity Baseline and Food Equity results into a public, responsive
evidence workspace. The map is the primary way to explore geography, but it is not the only way:
every tract can also be found and selected through an accessible list and search interface.

The server owns run selection, analytical joins, geometry preparation, explanations, and
provenance. The browser receives a bounded presentation contract and uses MapLibre only to draw,
navigate, and select geography. The public application reads only a governed `published` bundle.
Until MOO-768 provides the Food publication lifecycle, public mode fails closed. Local development
may request one exact `validated` Food run by server-only environment variable; that mode is
visibly labeled **Validated preview — not published** and cannot be enabled in production.

The first visible slice proves this end-to-end boundary with real data: tract polygons, Food
Equity Priority, a legend, map and non-map selection, a shareable tract URL, and a compact tract
summary. It does not fake unfinished search, resource, or profile data.

## 1. Product experience

### 1.1 Information architecture

The Atlas uses four coordinated regions:

1. **Application navigation** — the existing responsive product sidebar.
2. **Explore panel** — layer choice, legend, filters, search, data state, and tract list.
3. **Map** — Milwaukee County tract geometry, pan/zoom/reset, hover/focus feedback, and selection.
4. **Tract profile** — the selected tract's summary, drivers, access evidence, context,
   provenance, and data-quality explanation.

On wide screens these read as a civic evidence workspace, not a marketing dashboard: quiet,
persistent surfaces around a dominant map, compact typography, visible labels, and restrained
semantic color. On narrow screens the map remains primary and the tract profile opens in a bottom
sheet. The desktop and mobile profile render the same content model rather than separate copies.

### 1.2 Desktop and responsive behavior

| Viewport | Layout |
|---|---|
| 1440 px and wider | Application nav, 288 px Explore panel, flexible map, 360 px profile panel. |
| 1024–1439 px | Compact application nav, 272 px Explore panel, flexible map; profile overlays or replaces the Explore panel when selected so the map remains usable. |
| 768–1023 px | Map-first tablet layout; controls use compact overlays and selection opens a sheet. |
| 375–767 px | Full map canvas below the app header; search/filter controls remain reachable; selection opens a draggable bottom sheet with collapsed and expanded stops. |

The implementation is verified at 375, 430, 768, 1024, and 1440 px. No essential action depends
on hover. Map controls and sheet handles meet a 44 px minimum target. A map resize is issued after
panel or sheet transitions so geometry does not render under stale bounds.

### 1.3 Default and selected states

- The default layer is **Food Equity Priority**.
- All canonical Milwaukee County tracts are rendered, including `insufficient_data` and
  `ineligible_zero_population`; missing values are never converted to zero.
- Priority 1–5 uses a labeled, ordered palette. Insufficient data uses a neutral hatched or
  dashed treatment; zero-population tracts use a distinct muted treatment.
- Hover or pointer movement may preview a tract name and priority, but only activation changes
  the selected tract and URL.
- Selection is expressed with more than color: a heavier outline, profile heading, and selected
  state in the tract list.
- Reset extent returns to the approved Milwaukee County bounds without clearing an intentional
  tract selection.

### 1.4 Progressive profile disclosure

The profile is ordered for residents first and auditability second:

1. **What this means** — tract label, municipality/ZIP context when authoritative, Food Equity
   Priority, Food Access Need band, Equity Baseline band, and a plain-language explanation.
2. **Why this result** — scored Food Access Need components and Equity Baseline drivers, with
   value, unit, direction, quality state, and contribution. A contribution describes how the
   approved formula produced the result; it is not causal language.
3. **Food access evidence** — approved access measures and nearest-source-backed resource facts.
4. **Community context** — non-scoring context clearly separated from score inputs.
5. **Data quality and provenance** — run/methodology versions, vintages, source names, retrieval
   or validity dates, limitations, and missing/suppressed/conflicting states.

The explanation generator is deterministic TypeScript over approved contract fields. It does not
use an LLM, invent causes, recommend policy, or infer demographic facts that are not present.
Limited English proficiency is described as English-language access, not literacy.

## 2. Data authority and lifecycle

### 2.1 Public mode

Public mode may return Atlas data only from one governed, internally consistent published bundle:

- published Food run;
- the exact Equity Baseline run pinned by that Food run;
- the exact score/component/access records used by those runs;
- source and methodology lineage approved for public display.

MOO-768 owns the Food publication state machine and current-bundle pointer. MOO-754 does not add a
publish button, change run status, infer "latest", or authorize a production publication. Before
MOO-768 is complete, the selector returns `no_published_run` without attempting to treat a
validated run as public.

### 2.2 Validated local preview

Local preview is allowed only when all of the following are true:

- `MKE_ATLAS_DATA_MODE=validated_preview`;
- `MKE_ATLAS_PREVIEW_RUN_ID` is an explicit UUID in the server environment;
- `MKE_PIPELINE_ENV=development`;
- the runtime is not a Vercel production deployment and `NODE_ENV` is not `production`;
- the selected Food run is exactly `validated`;
- its pinned Equity Baseline run exists, matches the stored ID, and is `validated` or
  `published` according to the approved lifecycle;
- required output hashes and validation metadata are present.

Failure of any condition returns an unavailable state and a server-side diagnostic without
falling back to another run. Neither variable is `NEXT_PUBLIC_*`; run selection and database
credentials never enter the client bundle. Every preview surface displays **Validated preview —
not published**.

### 2.3 No ambiguous latest-data joins

All scored facts join through the selected Food run. Contextual resource layers are not selected
by `MAX(created_at)`, latest snapshot, or proximity alone. They remain unavailable until the
implementation can prove the exact run/source snapshot relationship and public redistribution
terms. The first visible slice contains no public resource points. A disabled control may explain
why a layer is unavailable; it may not imply coverage that has not been approved.

## 3. Server presentation contracts

`@mke/contracts` defines and tests Zod schemas for the data crossing the server/client boundary.
The primary response is a discriminated union:

```ts
type AtlasResponse =
  | {
      state: "available";
      mode: "published" | "validated_preview";
      run: AtlasRunSummary;
      tracts: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, AtlasTractProperties>;
    }
  | {
      state: "unavailable";
      reason: "no_published_run" | "preview_not_allowed" | "run_not_found" | "run_not_validated" | "data_incomplete";
    };
```

Each feature uses the tract GEOID as its stable GeoJSON `id`. Presentation properties include:

- GEOID, tract name, population, and geography vintage;
- Food Equity Priority 1–5 or `null`;
- Food Access Need band, Equity Baseline band, and score quality state;
- explicit exclusion reasons;
- enough concise text for accessible map/list labels.

Detailed profile data is a second contract keyed by selected run and tract GEOID. It contains
typed sections for score summary, Food components, Equity drivers, contextual facts, data quality,
and provenance. Missing values use explicit state/value unions; the string `0`, numeric `0`,
`null`, suppressed, conflicting, and not-applicable remain distinguishable.

Internal UUIDs, database connection details, raw validation payloads, storage URIs, and source
artifacts are excluded unless a reviewed presentation need requires them. Public run summaries
may expose stable methodology and data-version labels, not operational secrets.

## 4. Query and geometry boundary

The server-only database repository performs these exact relationships:

- selected `food_score_runs` → `food_scores`;
- `food_scores.geography_id` → canonical `geographies`;
- selected Food run's `equity_baseline_run_id` and each score's
  `equity_baseline_score_id` → the exact approved `score_runs`/`scores` rows;
- Food component → exact access metric value → exact snapshot/source lineage;
- Equity component → exact indicator value/definition → exact snapshot/source lineage.

The Atlas query starts from canonical tracts and left-joins scores so unscored, insufficient, and
zero-population geography remains visible. Every join validates expected one-to-one or
one-to-many cardinality; duplicates or missing pinned rows make the response unavailable rather
than silently dropping tracts.

PostGIS returns EPSG:4326 GeoJSON. Before introducing simplification, the implementation measures
the raw payload. If bounded simplification is required, it uses `ST_SimplifyPreserveTopology` on
the server with a documented tolerance, preserves valid tract topology, and is tested against
canonical feature count and identifiers. Analytical geometry and containment never use the
simplified presentation geometry. The browser does no GIS calculation.

## 5. Web architecture

### 5.1 Server and client responsibilities

- The route or server component resolves mode and selected run, validates the response, and can
  cache immutable published data by bundle identity.
- Validated preview is dynamic/server-only and must not be shared through a public cache.
- A small `AtlasWorkspace` client component owns map viewport, open panels, hover, and selected
  tract UI state.
- The URL owns durable state: selected GEOID, active layer, and supported filters. Invalid or
  unavailable values are removed or normalized without throwing.
- The MapLibre component owns one map instance, sources/layers, feature-state selection,
  pointer/touch handlers, resize, and cleanup.
- Profile content is componentized independently of its desktop panel or mobile sheet container.

### 5.2 MapLibre and HeroUI boundary

MapLibre GL JS remains the rendering engine for tract sources, fill/line layers, hit testing,
feature state, camera, and controls. The existing direct lifecycle is retained because arbitrary
tract GeoJSON sources and polygon layers require MapLibre primitives; the HeroUI Pro Map wrapper
is not used merely to hide that necessary boundary.

HeroUI/HeroUI Pro owns application chrome and interaction primitives: SearchField, Button, Card,
Chip, Accordion, Sheet, EmptyState, and Resizable panels where appropriate. Compound APIs,
documented imports, `onPress`, semantic HTML, and existing design tokens are required. Custom UI
primitives are introduced only when neither HeroUI package has the needed behavior.

### 5.3 Search authority

Tract GEOID, tract label, ZIP, and municipality search use authoritative local/server-side data.
Address search is implemented only after a structured geocoder/provider and its terms,
attribution, privacy behavior, rate limits, and production use are documented. The returned point
is resolved to a tract with PostGIS containment, not browser point-in-polygon logic.

Neighborhood search is enabled only if an approved, reliable neighborhood boundary/name source
exists. A colloquial neighborhood is never inferred from a tract name or ZIP code. If address or
neighborhood authority is unresolved, the UI says what can be searched instead of shipping a
fake result.

## 6. States, accessibility, and safety

The design explicitly handles:

- loading/skeleton without fabricated values;
- no published run;
- validated preview;
- database or contract error;
- invalid URL selection;
- no search result;
- tract with complete scores;
- insufficient data;
- zero population/ineligible;
- missing, suppressed, conflicting, provisional, and stale measures;
- unavailable resource layer due to lineage or terms;
- reduced motion and forced-colors/high-contrast use.

The map has an accessible name and concise instructions. A tract list exposes the same selection
without requiring map operation. Selected state, priority, and data quality use text in addition
to color. Focus is visible; sheet focus is managed; Escape closes transient surfaces without
losing a selected URL; headings and landmarks remain logical. Automated axe checks supplement,
but do not replace, keyboard and screen-reader-oriented review.

## 7. Performance, caching, and observability

- The initial Atlas payload is bounded and measured in verification evidence.
- Published data may use server caching keyed by immutable publication identity.
- Preview responses use no shared public cache and carry a visible preview mode.
- Detailed tract profiles load by GEOID as needed rather than duplicating all component and
  provenance records into every map feature.
- Map sources/layers update in place; the map instance is not recreated on every selection.
- Client logs never include credentials, storage URIs, or raw source payloads.
- Server diagnostics distinguish unavailable publication, invalid preview configuration,
  cardinality failure, validation failure, and database failure while the user sees safe copy.

## 8. First visible slice

The first implementation checkpoint includes:

1. tested Atlas contracts and fail-closed mode selection;
2. server-only query for the exact validated preview run;
3. real canonical tract GeoJSON with Food Equity Priority and quality states;
4. priority legend and visible preview banner;
5. MapLibre tract rendering, navigation, reset, and pointer/touch selection;
6. accessible non-map tract list;
7. `?tract=<GEOID>` selection and a compact tract summary;
8. loading, unavailable, error, insufficient-data, and zero-population states.

It deliberately excludes deep profile sections, address search, contextual resource points, and
production publication. Those follow as separately verified tasks in the implementation plan.

## 9. Verification and evidence

Completion requires:

- unit tests for contracts, mode selection, URL normalization, explanation formatting, and map
  presentation helpers;
- database integration tests for exact-run joins, canonical tract completeness, pinned baseline,
  cardinality, missing states, and PostGIS output;
- component tests for all data states and map/list/profile coordination;
- Playwright flows at the five required viewport widths, including keyboard-only selection,
  shareable URL reload, bottom sheet, and axe checks;
- local verification against isolated Neon run
  `97bd1cdf-bf96-573f-8fcf-92e8676925d4` without committing credentials or making it a default;
- proof that production/public mode never returns a validated/draft/failed run;
- geometry feature count, GEOID trace, payload size, and selected-tract provenance traces;
- production build and complete repository verification;
- a documented design and accessibility review before MOO-754 is called complete.

## 10. Explicitly out of scope

- Publishing or superseding a run (MOO-768 / Gate 3).
- Changing Equity Baseline or Food Equity methodology.
- Browser-side scoring, spatial analysis, or policy recommendations.
- Compare mode, Opportunity Explorer, exports, authentication, saved workspaces, AI chat, or
  predictive modeling.
- Scraped or unlicensed resource data.
- Neighborhood guesses, inferred operating hours, or unapproved geocoder use.
- A public resource layer without deterministic snapshot/run lineage and redistribution approval.
