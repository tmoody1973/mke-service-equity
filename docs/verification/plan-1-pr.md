# Plan 1: Foundation + Database (MOO-750)

## Intent

Establish the public MIT-licensed MKE Service Equity foundation: a responsive server-first application shell, licensed HeroUI Pro design boundary, isolated MapLibre lifecycle, typed health contract, server-only Neon/PostGIS boundary, deterministic migration, Python workspace, and delivery gates.

## Included

- npm monorepo with pinned Node, TypeScript, lint, unit, build, and browser tooling
- Next.js App Router shell using the HeroUI Pro responsive Sidebar
- data-free MapLibre style with visible controls, attribution, and non-map status
- Zod database-health contract and non-secret Node health route
- Drizzle migration that enables PostGIS and creates no domain tables
- isolated `moo-750-foundation` Neon development branch with a seven-day TTL
- Python 3.13/uv smoke-tested pipeline boundary
- CI, five-width Playwright coverage, axe WCAG A/AA checks, and Vercel preview documentation

## Verification

```bash
npm ci
npm run lint
npm run typecheck
npm run test
uv sync --locked
uv run ruff check pipelines tests/data
uv run pytest tests/data -q
npm run build
npm run test:e2e
npm run test:integration --workspace @mke/database
```

The client-bundle scan rejects database environment names, PostgreSQL URLs, the Neon driver, and `@mke/database` imports under `apps/web/.next/static`.

## Safety and exclusions

No production data is mutated. The only live migration target is the expiring development-only Neon branch. Connection values remain ignored and are never recorded. The migration enables PostGIS but creates no geography, resource, score, or ingestion tables. Deployment does not publish a score run.

Plan 2 ingestion, normalization, source data, equity calculations, scoring, and analytical layers are explicitly excluded.
