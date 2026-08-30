# Plan 4 Food Equity Atlas and tract-profile verification

## Status

- Linear issue: `MOO-754`
- Branch: `codex/moo-754-atlas-tract-profile`
- Verification date: 2026-08-30
- Current result: the map, selected-tract profile, exact evidence, provenance, responsive layouts,
  and plain-language content pass verification; search and approved contextual layers remain
- Publication state: no Food Equity run is published; governed publication remains tracked by
  `MOO-768`

This record verifies the public-presentation boundary, map, URL state, priority legend, accessible
tract list, selected-tract summary, exact score evidence, provenance, and responsive profile. It
does not claim that validated preview data has been published.

## Data and run boundary

The read-only local preview selected exact validated Food Equity run
`97bd1cdf-bf96-573f-8fcf-92e8676925d4` on disposable Neon branch
`moo-753-food-equity`. The server also verified the pinned Equity Baseline run and hashes before
returning Atlas data. Preview selection requires an exact UUID plus development-only guards;
production and default public mode cannot fall back to a validated run.

Live repository reconciliation passed:

| Check | Result |
|---|---:|
| Canonical 2020 TIGER/Line Milwaukee County tracts | 302 |
| Complete Food Equity scores | 299 |
| Insufficient-data scores | 1 |
| Zero-population, not-scored tracts | 2 |
| Priority 1 / 2 / 3 / 4 / 5 | 18 / 96 / 136 / 40 / 9 |
| Valid EPSG:4326 MultiPolygon geometries | 302 |
| Stable, unique GEOID feature IDs | 302 |
| Serialized Atlas GeoJSON | 1,052,366 bytes |
| Enforced payload budget | at most 1,100,000 bytes |

The geography-first repository rejects missing score joins, run mismatches, baseline mismatches,
invalid geometry, duplicate or missing canonical tracts, and contract-invalid values. Missing,
insufficient, and zero-population states remain explicit; none are converted to zero.

## Exact selected-tract profile

The profile route loads only after a tract is selected. The repository requires the selected Food
Equity run, its pinned Equity Baseline run, the same tract, and exact component-to-snapshot-to-source
lineage before returning an available profile.

For complete Census Tract 1.01 (`55079000101`), live reconciliation returned exactly 4 Food Access
Need components and 13 Equity Baseline components. Separate live checks covered insufficient-data
tract `55079187200` and zero-population tract `55079990000`; neither received inferred components
or fake zero values. Context resources remain explicitly unavailable until their exact snapshot is
tied to the run.

The profile explains contribution values as composite-score points relative to the Milwaukee
County midpoint. It explicitly says these values are not raw percentages, changes over time,
causes, or recommendations. The Census language measure is labeled “Speaks English less than
‘very well,’ age 5+” and described as English-language access, not reading or writing literacy.

## Public fail-closed behavior

- Default public mode returns `no_published_run` because no Food Equity run is published.
- The selector never queries a validated fallback in public mode.
- Validated preview requires `MKE_ATLAS_DATA_MODE=validated_preview`, the exact preview run UUID,
  `MKE_PIPELINE_ENV=development`, non-production `NODE_ENV`, and non-production `VERCEL_ENV`.
- Preview responses are dynamic and are not placed in a shared public cache.
- The production client bundle scan found no database variable, preview-mode variable, or
  validated run identifier.
- Database URLs and other credentials were supplied only to local server processes and were not
  printed or committed.

## Browser and responsive verification

The same 302-feature response was exercised in Chrome with the local validated preview. MapLibre
6 loaded its same-origin worker and shared worker module generated from the pinned dependency.
The map rendered the complete county extent, priority fills, distinct insufficient/zero-population
treatments, selected outline, reset control, and text legend.

| Viewport | Evidence |
|---|---|
| 1440 × 1000 | application nav, Explore panel, usable map, and persistent selected profile |
| 1024 × 900 | map-first compact workspace and sheet trigger; map retained usable width |
| 768 × 900 | tablet header, full map, reset control, and sheet trigger |
| 430 × 900 | full-height HeroUI Pro explorer; tract selection and priority filter succeeded |
| 375 × 812 | rendered map and controls with `scrollWidth === clientWidth` |

At 430 px, selecting Census Tract 1.02 and filtering to Priority 5 produced the shareable URL
`?tract=55079000102&priority=5`, retained the full-height explorer, set the filter's pressed state,
and reduced the semantic tract list to 12 matching or explicitly incomplete tracts. The Sheet has
180 px, 65%, and full-height stops; the browse trigger opens full-height so all controls remain
reachable, while a direct map selection may open the 65% summary stop.

The 1024 px review found and corrected an over-constrained four-column layout. The final compact
layout keeps the map primary until 1200 px, uses an overlay profile at 1200–1279 px, and uses the
persistent right profile at 1280 px and wider.

## Accessibility, readability, and error-state review

- Axe reported zero WCAG A/AA violations for the complete selected-tract profile at 375, 430, 768,
  1024, and 1440 px.
- The production public-mode suite also reported zero axe violations at all five widths.
- A desktop muted-text contrast failure was corrected in the shared design token, then rescanned.
- Priority and quality states are labeled in text and do not rely on color.
- Map selection is mirrored by a semantic button list, so the map is not the only selection path.
- Map controls and application controls use at least 44 px targets.
- URL selection supports back/forward state; invalid values normalize without deleting unrelated
  parameters.
- MapLibre setup and runtime errors produce a safe alert and leave the tract list available.
- The loading message remains visible until the GeoJSON source reaches MapLibre idle/ready state.
- Reduced-motion preference changes map reset duration to zero.
- Public-facing map, legend, list, summary, loading, error, missing-data, profile, and source copy
  received a plain-language edit. Technical identifiers are introduced as “Census tract ID,” and
  technical terms that remain necessary are defined where they appear.
- The legend now matches the approved method: Priority 1 is Highest and Priority 5 is Lowest.

## Automated verification

The final local gate passed:

| Check | Result |
|---|---|
| Web unit/component tests | 47 passed |
| Contracts tests | 22 passed |
| Database unit tests | 71 passed |
| Design-system tests | 1 passed |
| Live profile integration test | passed for complete, insufficient, and zero-population states |
| Live profile Playwright + axe | 5 passed at the required widths |
| Public production Playwright + axe | 10 passed, 5 preview-only checks skipped |
| Workspace typechecks | passed |
| ESLint | passed with generated MapLibre worker modules excluded |
| Next.js production build | passed |
| Root `npm run verify` | passed |
| Client bundle preview/secret scan | passed |
| `git diff --check` | passed |

The validated profile check runs only under the guarded Next development server because the
application intentionally rejects validated-preview mode when `NODE_ENV=production`. The HeroUI
Pro Sidebar currently emits a development-renderer-only React Aria ID hydration warning; the
profile-specific check filters that one known warning. The production suite filters nothing and
passes with zero browser console errors.

## Remaining MOO-754 work

The City of Milwaukee DCD neighborhood reference and deterministic tract-overlap rule were
explicitly approved on 2026-08-30. Neighborhood search, authoritative tract/ZCTA/municipality
search, address authority, approved contextual resource layers, final performance hardening, and
the load-bearing completion review remain. The implementation does not make the mutable live
service a runtime dependency and does not imply deployment or publication.

## Neighborhood reference implementation

The approved City DCD response was preserved as an immutable snapshot with SHA-256
`4a3bf2c32182b508204dcdfad9904eba3f987f2e2b0720087642c40fbf9862e5` and loaded into the
disposable validated-preview database as snapshot
`f3da2bdf-27db-5f41-9338-f95264be0301`. PostGIS reconciliation passed before the snapshot moved
from `pending` to `valid`:

| Check | Result |
|---|---:|
| Source features / persisted versions | 190 / 190 |
| Canonical tract contexts | 302 |
| Positive-area audit overlaps | 1,020 |
| Invalid source geometry | 1 documented exact repair (`NBHD_ID 30`, `LAND BANK`) |

For Census tract `55079000101`, City-reference coverage is 99.9%. No neighborhood has a majority,
so the deterministic label is **Spans**: Northridge 42.8%, Northridge Lakes 33.4%, Ridgeview 15.6%,
and Hilltop Parish 7.4% of the covered tract area. Seven sub-1% overlaps remain in audit data and
are grouped for public display. The profile labels these as area shares, carries the City's
non-official/staleness limitation, and never changes a score.
