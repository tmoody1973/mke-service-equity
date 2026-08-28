# Repository structure

```text
mke-service-equity/
├── .github/workflows/ci.yml
├── apps/web/
│   ├── app/                  # App Router shell and server health route
│   ├── components/           # HeroUI Pro application shell
│   ├── features/map/         # Isolated MapLibre client lifecycle
│   ├── public/map-style.json # Deterministic data-free style
│   └── test/                 # Web-only test adapters
├── packages/
│   ├── config/               # Shared TypeScript configuration
│   ├── contracts/            # Cross-boundary Zod contracts
│   ├── database/             # Server-only Neon, Drizzle, and PostGIS boundary
│   └── design-system/        # Project semantic token aliases
├── pipelines/common/         # Python ingestion/scoring foundation only
├── tests/
│   ├── data/                 # Python workspace smoke test
│   └── e2e/                  # Five-width Playwright and axe checks
├── data/README.md            # Data handling boundary; no source data in Plan 1
├── docs/                     # Product, architecture, method, UX, and operations
├── scripts/verify-responsive.mjs
├── playwright.config.ts
├── pyproject.toml
└── package.json
```

## Ownership boundaries

- TypeScript owns the application, API, presentation, contracts, and database access layer.
- PostGIS owns analytical spatial relationships; Python owns ingestion, validation, normalization, and future deterministic scoring.
- MapLibre is limited to browser visualization and interaction. It does not calculate analytical geography.
- `packages/database` exposes only `@mke/database/server`; client and environment modules remain private and poisoned with `server-only`.
- `packages/contracts` contains schemas crossing package or HTTP boundaries.
- `packages/design-system` maps project semantics to HeroUI variables instead of creating a competing component system.

Plan 1 deliberately contains no domain tables, source data, analytical layers, authentication, AI scoring, or saved workspaces. Later feature directories are added only when their approved implementation plans begin.
