# Plan 4 Food Equity Atlas first-slice verification

## Status

- Linear issue: `MOO-754`
- Branch: `codex/moo-754-atlas-tract-profile`
- Verification date: 2026-08-30
- Current result: the first visible Atlas slice is review-ready; Phase B profile evidence and
  provenance work remains
- Publication state: no Food Equity run is published; governed publication remains tracked by
  `MOO-768`

This record verifies the first public-presentation boundary, map, URL state, priority legend,
accessible tract list, summary, and responsive workspace. It does not claim that the complete
MOO-754 tract profile is finished or that validated preview data has been published.

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

## Accessibility and error-state review

- Axe reported zero violations at 1440 px and at the open 430 px mobile explorer.
- Axe also reported zero violations at 430 px with forced colors and reduced motion enabled.
- A desktop muted-text contrast failure was corrected in the shared design token, then rescanned.
- Priority and quality states are labeled in text and do not rely on color.
- Map selection is mirrored by a semantic button list, so the map is not the only selection path.
- Map controls and application controls use at least 44 px targets.
- URL selection supports back/forward state; invalid values normalize without deleting unrelated
  parameters.
- MapLibre setup and runtime errors produce a safe alert and leave the tract list available.
- The loading message remains visible until the GeoJSON source reaches MapLibre idle/ready state.
- Reduced-motion preference changes map reset duration to zero.

## Automated verification

The final local gate passed:

| Check | Result |
|---|---|
| Web unit/component tests | 41 passed |
| Contracts tests | 17 passed |
| Database unit tests | 63 passed |
| Design-system tests | 1 passed |
| Live database integration tests | 3 passed |
| Workspace typechecks | passed |
| ESLint | passed with generated MapLibre worker modules excluded |
| Next.js production build | passed |
| Root `npm run verify` | passed |
| Client bundle preview/secret scan | passed |
| `git diff --check` | passed |

## Remaining MOO-754 work

The first-slice review gate is ready for Tarik. Phase B still needs the complete tract evidence
query and profile sections, search, additional contextual layers, full provenance/data-quality
detail, remaining end-to-end coverage, final design review, and governed published-run validation.
No deployment or publication is implied by this verification record.
