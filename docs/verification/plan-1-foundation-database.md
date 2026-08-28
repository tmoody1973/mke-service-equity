# Plan 1 foundation and database verification

Verified on 2026-08-27 in America/Chicago for Linear issue [MOO-750](https://linear.app/moodyco/issue/MOO-750/plan-1-foundation-database).

## Result

Plan 1 passes its local, CI, database, responsive, accessibility, client-boundary, design-review, and Vercel Preview gates. No production data was mutated, no score run was published, and no Plan 2 domain schema or ingestion work was added.

## Repository and revision

- Public repository: <https://github.com/tmoody1973/mke-service-equity>
- MIT license: <https://github.com/tmoody1973/mke-service-equity/blob/main/LICENSE>
- Pull request: <https://github.com/tmoody1973/mke-service-equity/pull/1>
- Branch: `tarikjmoody/moo-750-plan-1-foundation-database`
- Base: `1ab52ff1b986101f8a9972a132ed5fee6cc535ec`
- Verified implementation: `a6e529737db4d1ea3c30f309bf5d59b4772882ca`

The independently understandable commits from base through the verified implementation are:

```text
c954022 chore(workspace): establish npm monorepo (MOO-750)
4ef9027 fix(workspace): align Next lint toolchain (MOO-750)
7adb72f feat(contracts): define foundation health contract (MOO-750)
5cff4f5 feat(database): enable PostGIS on isolated Neon dev (MOO-750)
9a6b227 chore(python): establish data workspace (MOO-750)
ab8f283 feat(design-system): establish HeroUI Pro foundation (MOO-750)
0330768 feat(web): add responsive application shell (MOO-750)
3401f86 feat(map): isolate MapLibre shell lifecycle (MOO-750)
056f2ec test(web): verify responsive accessible shell (MOO-750)
8820e30 ci(plan-1): add foundation delivery gates (MOO-750)
90d82af fix(plan-1): address final foundation review (MOO-750)
727c9c8 fix(ci): hoist Next lint runtime (MOO-750)
9217538 docs(plan-1): align empty-state verification (MOO-750)
701d5cf fix(workspace): pin HeroUI Pro peers (MOO-750)
ab96e07 fix(deploy): preserve workspace peers on Vercel (MOO-750)
a6e5297 fix(plan-1): address automated review findings (MOO-750)
```

## Local verification

The repository was verified with npm 11.12.1, uv 0.12.1, and Python 3.13.7. GitHub Actions independently verifies the pinned Node 24 and Python 3.13 environments from a fresh checkout.

| Gate | Evidence | Result |
| --- | --- | --- |
| Install | clean isolated `npm ci`; CI `npm ci`; `uv sync --locked` | pass |
| Licensed UI | `@heroui-pro/react@1.0.0-beta.8`, `@heroui/react@3.2.4`, and `heroui-pro@1.0.0-beta.12` resolve through `npm ls` | pass |
| Lint | `npm run lint`; `uv run ruff check pipelines tests/data` | pass |
| Type checking | `npm run typecheck` across web, contracts, database, and design-system workspaces | pass |
| Unit tests | 6 web + 3 contract + 12 database + 1 design-system = 22 tests | pass |
| Python test | `uv run pytest tests/data -q`: 1 test | pass |
| Production build | `npm run build`: `/`, `/_not-found`, and database-health route built | pass |
| Browser tests | `npm run test:e2e`: 10 tests across 5 viewport projects | pass |
| Database integration | `npm run test:integration --workspace @mke/database`: 1 live test | pass |
| Responsive contract | `node scripts/verify-responsive.mjs` checks each required name and exact width | pass |
| Diff hygiene | `git diff --check` | pass |

The final local browser run passed two tests at each of `375`, `430`, `768`, `1024`, and `1440` CSS pixels. The tests cover shell behavior, mobile navigation, MapLibre canvas lifecycle, controls, attribution, non-map status, keyboard focus, reduced motion, overflow, and WCAG A/AA axe scans. Axe reported zero violations and browser error capture reported zero errors at every width.

Responsive captures are generated into the ignored verification directory:

```text
artifacts/plan-1/width-375.png
artifacts/plan-1/width-430.png
artifacts/plan-1/width-768.png
artifacts/plan-1/width-1024.png
artifacts/plan-1/width-1440.png
```

## Neon and PostGIS

- Safety classification: development-only, distinct from production
- Neon project: `wispy-glitter-41930798`
- Branch: `moo-750-foundation`
- Branch ID: `br-dark-dew-a5x4dxm6`
- Database / role: `neondb` / `neondb_owner`
- Automatic expiry: `2026-09-03T20:01:31Z` under the approved seven-day TTL
- Migration: `0000_enable_postgis.sql` contains only `CREATE EXTENSION IF NOT EXISTS postgis;`

`npm run db:migrate --workspace @mke/database` reported `migrations applied successfully`; the existing Drizzle metadata notices were idempotent skips. A separate read-only `SELECT postgis_lib_version();` returned `3.6.0`. The live integration test also returned `status: ok`, `database: reachable`, and a non-empty PostGIS version. No connection string or credential is recorded here.

## GitHub Actions and external review

The reviewed implementation SHA passed both workflow triggers:

- Pull-request CI: <https://github.com/tmoody1973/mke-service-equity/actions/runs/33129873431> — `web` and `python` passed
- Branch-push CI: <https://github.com/tmoody1973/mke-service-equity/actions/runs/33129871057> — `web` and `python` passed
- GitGuardian Security Checks: passed on pull request 1

CodeRabbit reported four actionable findings on the earlier review. Commit `a6e5297` addresses all four: the desktop-only header gap, secret-file wording, repository-pinned HeroUI CLI commands, and exact responsive-width validation. The affected lint, typecheck, unit, build, and five-width browser gates were rerun successfully.

## Vercel Preview

- Preview: <https://mke-service-equity-h9agyl7qp-tmoody1973s-projects.vercel.app>
- Deployment inspector: <https://vercel.com/tmoody1973s-projects/mke-service-equity/Z3Qk4BC8PBJjWVsAXsvkwZFvsZxr>
- Deployment ID: `dpl_Z3Qk4BC8PBJjWVsAXsvkwZFvsZxr`
- State: `READY`
- Expected access boundary: Vercel SSO protection with an automation-bypass path for verification

Preview-scoped encrypted variable names were confirmed without printing values: `HEROUI_AUTH_TOKEN`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEXT_PUBLIC_MAP_STYLE_URL`.

The protected deployment was tested through Chromium at 375 and 1440 CSS pixels. Both widths rendered the shell and MapLibre controls, exposed visible attribution and the empty-data status, focused the skip link from the keyboard, reported zero axe violations and zero browser errors, and returned HTTP 200 with a reachable database and PostGIS version from `/api/health/database`.

The browser-visible HTML, health response, and same-origin JavaScript, CSS, JSON, and text resources were scanned for `HEROUI_AUTH_TOKEN`, database environment names, PostgreSQL URLs, `@neondatabase/serverless`, and `@mke/database`; no marker was present. The production client chunks passed the same server-boundary scan locally.

Deployed captures are generated at:

```text
artifacts/plan-1/vercel-width-375.png
artifacts/plan-1/vercel-width-1440.png
```

## Design review

- Impeccable detector findings: `[]`
- Impeccable finish-review disposition: `ship`
- Remaining design findings: `clear`
- Durable visual direction and responsive rules: `DESIGN.md`

## Remaining issues

No blocking issue remains for MOO-750.

- `npm audit` reports four moderate, zero high, and zero critical findings in the development-only Drizzle/esbuild toolchain (`drizzle-kit`, `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, and `esbuild`). Owner: repository maintainers and upstream package maintainers. Impact: development tooling; monitor and update when Drizzle ships a compatible patched chain.
- CodeRabbit rate-limited its newest automated re-review after the four findings were fixed. Owner: pull-request reviewer. Impact: review automation only; each finding was manually verified against the current diff, and the affected local and CI gates pass.

## Scope confirmation

The final scope scan found no Supabase, authentication, AI provider, Food Equity scoring implementation, domain `CREATE TABLE`, or `INSERT INTO` addition under application, package, pipeline, or CI code. The only database DDL is the approved PostGIS extension. Work stops before MOO-751 / Plan 2.
