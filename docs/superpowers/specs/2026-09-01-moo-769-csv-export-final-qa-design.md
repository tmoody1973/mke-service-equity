# MOO-769 CSV Export and Final Product QA Design

**Status:** Approved by Tarik on 2026-09-01

**Issue:** MOO-769 — Plan 6B — CSV export + final product QA

**Parent:** MOO-757 — Plan 6 — Methodology + Export + Production QA

**Prepared:** 2026-09-01

**Design approval:** Satisfied. Tarik approved the download flow and data authority, the column
and data-dictionary contract, and the UX/failure/final-QA contract on 2026-09-01.

**Implementation gate:** Pending approval of the companion implementation plan. This design does
not authorize production publication, production data mutation, or Gate 3 release.

## Decision summary

MOO-769 adds one public, deterministic CSV export of the tract-level evidence behind the MKE Food
Equity Atlas and completes the remaining public-MVP transparency and final product QA work. The
first export contains all 302 canonical Milwaukee County 2020 Census tracts in one wide CSV with
one row per tract. It is not a filtered-map export and does not create separate analyst and public
formats.

The export is a server-owned view of the exact governed publication selected by Atlas, Compare,
and Opportunity. It never infers the newest run, falls back to a validated preview, joins official
evidence in the browser, recalculates a score, or publishes data. With zero current publication,
the data page explains that no public download is available and the export endpoint returns no
CSV. A partial or inconsistent release never produces a partial file.

The primary navigation exposes **Download data** on every desktop and mobile route. It leads to a
plain-language `/data` page with publication identity, file scope, limitations, source and
methodology links, a complete column dictionary, and the download action. The approved City of
Milwaukee neighborhood reference is included with its deterministic overlap context and explicit
limitations. ZIP or ZCTA context is omitted until a separate authoritative source and overlap
contract is approved.

## 1. Product experience

### 1.1 Navigation and route

Add **Download data** to the main navigation so it is available from Atlas, Tract Profile,
Compare, and Opportunity on desktop and mobile. The item opens `/data`; it does not start a file
download without first giving the user context.

The `/data` page begins with a short explanation that the file contains the complete public
Milwaukee County tract dataset behind the Atlas. When one governed publication is available, it
shows:

- publication date;
- 302-tract scope;
- Food Equity and Equity Baseline methodology versions;
- a prominent **Download all tract data (CSV)** action;
- an explanation of missing values, margins of error, confidence ranges, and reliability;
- the City neighborhood-reference limitation;
- methodology and source links;
- the exact publication and score-run identity; and
- a complete searchable or grouped plain-language column dictionary.

The data page does not imply that a download is current merely because code was deployed. It
describes the exact selected publication. It calls GEOID a **Census tract ID** in explanatory copy
while preserving the stable `geoid` machine column.

### 1.2 Unavailable states

The page handles these states without leaking private data:

- `no_published_run` — no public file exists yet;
- `preview_not_allowed` — a private validated preview cannot be exported publicly;
- `data_incomplete` — published evidence is inconsistent, so no partial file is offered;
- database/server failure — the download is temporarily unavailable; and
- contract/serialization failure — the file is withheld and the failure remains redacted.

The page uses plain language and an appropriate retry or return-to-Atlas action. It never shows a
validated run ID, preview score, database host, SQL, stack trace, credential, or partial CSV.

## 2. Export data contract

### 2.1 Availability and identity

The export is available only when `selectAtlasRun` returns `mode: "published"` with one immutable
publication identity and an internally consistent Food run plus its exact pinned Equity Baseline.
The export query must additionally prove that every returned score, component, value, snapshot,
resource pin, and geography belongs to that publication. It does not accept a caller-selected run
or publication ID.

Every row repeats the immutable publication and run identity so the CSV remains interpretable
after it is detached from the website:

- `publication_id` and `published_at`;
- `food_score_run_id`, Food methodology version, and Food output hash;
- `equity_score_run_id`, Equity methodology version, and Equity output hash;
- canonical geography vintage; and
- deterministic data vintages.

The file has exactly 302 rows, ordered by `geoid` ascending. Duplicate, missing, unknown, or
out-of-order canonical tracts fail the whole export.

### 2.2 Stable wide columns

Column names use lowercase `snake_case`, remain in one documented fixed order, and are controlled
by a versioned column registry. The initial schema includes these families:

1. **Tract identity** — `geoid`, tract name, geography vintage, population, and population state.
2. **City neighborhood reference** — availability/label kind, plain-language overlap summary,
   City-reference coverage, ordered overlaps with their area shares, other boundary slivers,
   source version, and limitation.
3. **Thirteen Equity Baseline indicators** — observed value or null, unit, data year, county
   percentile, effective weight, contribution, quality state, margin of error, 90% confidence
   bounds where applicable, reliability, higher-is-worse direction, and approved limitation.
4. **Equity results** — demographic, socioeconomic, and health subindices; composite score;
   Equity Baseline percentile and band; quality state; and exclusion reasons.
5. **Four Food Access scoring measures** — observed value or explicit unavailable state, unit,
   county percentile, effective weight, contribution, quality state, uncertainty when present,
   higher-is-worse direction, and approved limitation.
6. **Food results** — Retail Access, Transportation Constraint, raw and percentile Food Access
   Need, Food Access Need band, Food Equity Priority, quality state, and exclusion reasons.
7. **Release and provenance summary** — exact publication/run identity, methodologies, hashes,
   data vintages, and approved source-version references.

The 13 fixed Equity indicator prefixes are:

- `people_of_color`;
- `limited_english_proficiency`;
- `foreign_born`;
- `below_200_percent_fpl`;
- `unemployment`;
- `less_than_high_school`;
- `housing_cost_burden`;
- `diagnosed_diabetes`;
- `obesity`;
- `current_asthma`;
- `any_disability`;
- `frequent_mental_distress`; and
- `no_leisure_time_physical_activity`.

The four fixed Food measure prefixes are:

- `sram_snap_low_access_share_1mi`;
- `full_service_grocery_walk_access`;
- `households_no_vehicle`; and
- `scheduled_transit_service_intensity`.

Context-only walking counts, emergency-food records, food-site rows, public investment, polygon
geometry, and raw coordinates are not part of this tract-evidence CSV.

### 2.3 Neighborhood representation

Neighborhood context uses only the approved City-published reference and the existing PostGIS
overlap calculation. It never uses centroid assignment, ZIP inference, or a forced single label.

Each row includes a human-readable summary plus a deterministic machine-readable JSON cell for
ordered overlaps. Each overlap contains the City source ID, name, and exact covered-area share.
Coverage and overlap shares remain exact numeric values in the machine fields; explanatory copy
and the data dictionary say that overlap percentages describe the share of the tract area covered
by the City reference, not population. `no_reference`, `partly_covered`, `spans`, and `mostly_in`
remain distinct.

ZIP and ZCTA fields are absent in v1. Their absence is documented; no tract-to-ZIP guess or postal
label is introduced as a convenience.

### 2.4 Missing data, uncertainty, and precision

Missing is never zero. An unavailable measurement has an empty value field and a required state
such as `missing`, `suppressed`, `conflicting`, or `unreachable`. Observed zero remains numeric
zero. A tract with `insufficient_data` or `ineligible_zero_population` retains its explicit score
quality state and exclusion reasons while unsupported score fields remain empty.

ACS estimates retain margin of error, 90% confidence bounds, confidence level, and reliability.
The CSV exports stored analytical precision, not presentation-rounded strings. The data dictionary
explains units, direction, county-percentile meaning, quality states, and that contribution values
describe deterministic score construction rather than causes or recommendations.

### 2.5 CSV serialization

The server serializes one RFC 4180-compatible UTF-8 CSV with CRLF row endings, a single header row,
and consistent empty fields. Quotes, commas, CR/LF, and Unicode are escaped deterministically.
Text cells beginning with spreadsheet formula markers (`=`, `+`, `-`, `@`, tab, or carriage
return) are neutralized without changing the authoritative database value used by analysis. The
serializer is a focused, tested module rather than an ad hoc string join in the route.

The response uses:

- `Content-Type: text/csv; charset=utf-8`;
- `Content-Disposition: attachment` with a safe deterministic filename;
- `X-Content-Type-Options: nosniff`; and
- a no-store cache policy because the stable endpoint URL may represent a later publication.

The filename includes `mke-service-equity`, `tract-evidence`, and a publication date plus a safe
publication identifier. Request parameters cannot control the filename, columns, SQL, or run.

## 3. Architecture and data flow

```text
PRIMARY NAVIGATION
        ↓
/data SERVER PAGE
        ↓
EXACT GOVERNED RUN SELECTOR
        ↓
PUBLISHED EXPORT REPOSITORY
        ↓
STRICT 302-ROW CONTRACT + COLUMN REGISTRY
        ↓
SERVER CSV SERIALIZER
        ↓
/api/exports/tract-evidence.csv
```

The `/data` page and export route share one server-only availability loader, but the export route
reselects and revalidates the publication at request time. It does not trust page state or a
browser-provided ID. The repository performs bounded parameterized SQL against the exact selected
Food and Equity runs and publication member tables. PostgreSQL owns joins and ordering. TypeScript
owns strict response validation, column mapping, serialization, headers, and presentation.

The route buffers the bounded 302-row result only after complete validation, then emits one file.
It does not stream rows before integrity is known. The browser only follows the download link.

## 4. Error, security, and cache behavior

The CSV endpoint returns CSV only on success. Safe structured errors use a non-CSV content type:

- no public release or preview-only state: not found/unavailable response;
- inconsistent publication or failed integrity check: service unavailable;
- unexpected server failure: redacted service unavailable response.

No response contains a database URL, host, SQL, stack trace, environment value, private run ID, or
raw exception. Queries remain parameterized. The export module stays under the server-only package
boundary and is included in the production client-bundle scan. Browser code receives no database,
publication, or source credentials and no publication mutation function.

The endpoint does not mutate data, write audit records, publish a run, or alter a cache pointer.
A Vercel deployment cannot make a validated run downloadable.

## 5. Responsive and accessible experience

Use HeroUI Pro components where they fit the existing application shell. The data page uses a
readable single-column content hierarchy rather than a map workspace. It provides:

- a unique page heading and skip target;
- a clearly named download action with practical touch size;
- publication and file facts in semantic text or definition lists;
- grouped column definitions that remain usable without hover;
- visible keyboard focus;
- screen-reader labels that name the file and scope;
- sufficient contrast and forced-colors support;
- reduced-motion compliance; and
- no horizontal overflow at 375, 430, 768, 1024, or 1440 pixels.

The main navigation exposes the same destination on every width. Essential file scope,
publication, limitation, and unavailable-state information is not hidden in a tooltip, map, or
desktop-only panel.

## 6. Final product QA scope

MOO-769 performs one final regression review across Atlas, Tract Profile, Compare, Opportunity,
navigation, loading, empty, partial-data, and error states. It verifies:

- public-mode fail-closed behavior and zero preview leakage;
- exact published-run consistency across every route and export;
- shareable Atlas, tract, Compare, and Opportunity URLs;
- plain-language score, uncertainty, priority, neighborhood, source, and limitation copy;
- keyboard, focus, screen-reader semantics, touch targets, contrast, reduced motion, forced
  colors, and non-map equivalence;
- responsive behavior at 375, 430, 768, 1024, and 1440 pixels;
- browser-console and page-error cleanliness;
- bounded payload/file size and practical response time;
- Next.js production build and client-bundle boundaries;
- full Python, contract, database, web, integration, and browser suites; and
- documentation and sanitized verification evidence.

Production-like QA uses only approved development or disposable infrastructure. Any live database
branch, migration, fixture publication, or external deployment requires its own exact approval.
No QA step targets or mutates production.

## 7. Verification strategy

Tests are written before analytical export implementation and cover:

- strict response and column-registry contracts;
- exact 302-row membership and canonical GEOID order;
- exact publication/run/hash binding;
- duplicate, missing, wrong-run, unpinned, and inconsistent evidence rejection;
- all fixed Equity/Food fields and score-result fields;
- neighborhood available, partly covered, spans, mostly-in, no-reference, invalid-snapshot, and
  unpinned-publication states;
- observed zero versus missing/suppressed/conflicting/unreachable values;
- ACS uncertainty and reliability;
- quotes, commas, CR/LF, Unicode, formula markers, empty values, and deterministic bytes;
- safe filename and response headers;
- public no-release, preview-only, data-incomplete, and redacted server-error responses;
- route/page navigation and plain-language states;
- five-width accessibility and responsive behavior; and
- public build/bundle proof with no server-only export implementation or secrets in client code.

Live verification, if separately approved, uses a controlled governed fixture or disposable child
branch. It does not publish the authoritative validated development runs and does not alter
production.

## 8. Out of scope

- filtered or current-map CSV exports;
- separate long-format or ZIP exports;
- shapefile, GeoJSON, Excel, PDF, or API products beyond the one CSV route;
- ZIP or ZCTA context before source approval;
- polygon geometry, coordinates, resource-level rows, public investment, or emergency-food rows;
- new source acquisition or methodology/scoring changes;
- browser-side joins, scoring, analytical GIS, ranking, or recommendations;
- authentication, saved downloads, email delivery, or scheduled exports;
- production publication, supersession, withdrawal, migration, or release; and
- Gate 3 approval.

## 9. Approval evidence

Tarik approved these decisions in sequence on 2026-09-01:

1. export all 302 canonical tracts rather than the current filter/view;
2. use one wide row per tract;
3. expose **Download data** from the primary navigation;
4. include the approved City neighborhood reference and omit unapproved ZIP context;
5. approve the server-owned download architecture;
6. approve the column and data-dictionary contract; and
7. approve the UX, safe failure, accessibility, responsive, and final-QA contract.

Implementation remains blocked until Tarik approves the companion implementation plan.
