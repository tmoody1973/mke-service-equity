# Plan 5 Compare Areas and Opportunity Explorer verification

## Status

- Linear issue: `MOO-756`
- Branch: `codex/moo-756-analysis-boundaries`
- Verification date: 2026-08-31
- Current checkpoint: Task 13 payload and cache boundaries
- Publication state: no Food Equity run is published; governed publication remains tracked by
  `MOO-768`

This checkpoint verifies the uncompressed response budgets, geometry separation, production
client-bundle boundary, public fail-closed responses, validated-preview exposure rules, and cache
seams for Compare Areas and Opportunity Explorer. It does not publish a run and does not implement
the immutable published cache planned for MOO-768.

## Payload budgets

Always-running web tests construct a contract-valid five-tract comparison with all four Food
Access measures, all thirteen Equity Baseline indicators, and required provenance per tract. They
also construct the largest contract-valid no-filter Opportunity response with 302 matching tract
summaries. Both tests measure `Buffer.byteLength(JSON.stringify(value), "utf8")`, not JavaScript
character count.

Read-only reconciliation against validated Food Equity run
`97bd1cdf-bf96-573f-8fcf-92e8676925d4` on the disposable Neon branch produced:

| Payload | Measured UTF-8 bytes | Enforced maximum | Result |
|---|---:|---:|---|
| Complete five-tract Compare response | 55,311 | 500,000 | passed |
| No-filter 302-tract Opportunity response, without geometry | 144,569 | 150,000 | passed |
| Shared 302-feature Atlas GeoJSON | 1,052,366 | 1,100,000 | passed |

The Opportunity response contains tract properties, score summaries, filters, run metadata, and
summary counts. It contains neither a `geometry` nor a `coordinates` key. The page continues to
load the separately bounded Atlas feature collection and gives that same collection to MapLibre;
Opportunity does not return a second polygon copy.

The live integration tests retain all three caps. The no-filter Opportunity integration now also
asserts the geometry keys are absent. These opt-in checks passed 9 tests across the Compare,
Opportunity, and Atlas repositories. The always-running fixture checks protect the Compare and
Opportunity budgets when a live preview database is unavailable in CI.

## Production client-bundle boundary

Every Webpack production build now runs `verify-analysis-client-bundle.mjs`. The fresh Task 13
build recursively scanned 32 JavaScript assets under `.next/static`. It fails when an asset contains:

- `DATABASE_URL` or `DATABASE_URL_UNPOOLED`;
- a preview environment-variable name;
- the validated preview run UUID;
- a PostgreSQL connection URI;
- `@mke/database`, `drizzle-orm`, or `server-only` import markers; or
- SQL-shaped SELECT, INSERT, UPDATE, or DELETE text.

The scan passed with no findings. The generic `validated_preview` contract enum remains in client
code because the visible preview badge must distinguish preview data from published data. It is a
mode label, not a run identity, credential, or environment value. The exact preview UUID and all
preview environment-variable names remain absent from static client assets.

## Public fail-closed response inspection

The production server was started with database and preview environment variables explicitly
removed. The following responses contained no UUID, database variable, PostgreSQL URI, internal
filesystem path, or preview identity:

| Response | Bytes | Cache boundary |
|---|---:|---|
| Compare rendered HTML | 18,663 | `private, no-cache, no-store, max-age=0, must-revalidate` |
| Opportunity rendered HTML | 53,142 | `private, no-cache, no-store, max-age=0, must-revalidate` |
| Compare RSC navigation | 989 | dynamic; no forbidden value |
| Opportunity RSC navigation | 6,117 | dynamic; no forbidden value |
| Atlas search no-data JSON | 51 | `private, no-store, max-age=0` |
| Atlas profile no-data JSON | 51 | `private, no-store, max-age=0` |

Both related JSON routes returned only
`{"state":"unavailable","reason":"no_published_run"}`. Analyze results have no separate public
JSON endpoint; their browser payload is the inspected server-rendered HTML/RSC response. Public
mode never fell back to the validated run.

## Validated-preview response inspection

Validated preview is deliberately rejected by `NODE_ENV=production`. The browser-safe preview was
therefore inspected through the guarded development server with `MKE_PIPELINE_ENV=development`,
the exact run UUID, and the disposable database connection supplied only to the server process.

- Five-tract Compare HTML, filtered Opportunity HTML, filtered Opportunity RSC, and the exact-run
  tract-profile JSON contained no database variable, connection URI, credential, or internal path.
- The immutable run UUID appeared in browser-safe result data so a selected tract profile could be
  bound to the same run. The profile route remained `private, no-store, max-age=0`.
- Share URLs contained only ordered tract IDs or normalized filters. They contained neither a
  `run` parameter nor a UUID.
- The filtered Opportunity RSC was `text/x-component`, `no-cache, must-revalidate`, and carried the
  Atlas geometry separately from the non-geometry Opportunity result.
- Database URLs were never printed, written to a verification artifact, or committed.

## Cache-seam proof

Both analysis routes are `force-dynamic` and call Next's request-time `connection()` boundary
before selecting data. Loader tests now make two successive validated-preview requests and prove
that run selection and the validated-preview repository loader are each called twice. No shared
memoized result is used. The published branch remains a separate `loadImmutablePublished` seam,
but it intentionally performs no caching until MOO-768 supplies a governed immutable publication
identity.

Public production HTML and related APIs returned private/no-store headers. The guarded development
preview returned no-cache/must-revalidate HTML/RSC, while selected-profile JSON remained
private/no-store. No preview response enters a shared public cache.

## Automated checkpoint

| Check | Result |
|---|---:|
| Task 13 payload/loader tests | 22 passed |
| Web unit/component tests | 179 passed |
| Contracts tests | 84 passed |
| Database unit tests | 125 passed |
| Design-system tests | 1 passed |
| Live Compare/Opportunity/Atlas repository tests | 9 passed |
| Workspace lint and typechecks | passed |
| Next.js production build | passed |
| Production client assets scanned | 32, no findings |
| Public HTML/RSC/API exposure scan | passed |
| Guarded-preview HTML/RSC/API exposure scan | passed |
| `git diff --check` | passed |

The 389 offline tests passed. The web suite was run with four workers and a 15-second per-test
ceiling after an initial unconstrained run caused unrelated five-second UI-test timeouts under
local process contention; the four affected files also passed independently with one worker.

## Commands exercised at this checkpoint

```text
npm test --workspace @mke/web -- analyze-payload load-comparison load-opportunity
npm run lint --workspace @mke/web
npm run typecheck --workspace @mke/web
npm run build --workspace @mke/web
npm run verify:analysis-bundle --workspace @mke/web
npx vitest run tests/compare-repository.integration.test.ts \
  tests/opportunity-repository.integration.test.ts \
  tests/atlas-repository.integration.test.ts
git diff --check
```

The live integration command requires the documented development-preview guards and read-only
connection to the disposable Neon branch. Task 14 still owns the complete five-width Compare and
Opportunity interaction, keyboard, axe, forced-colors, reduced-motion, screenshot, and browser
error matrix.
