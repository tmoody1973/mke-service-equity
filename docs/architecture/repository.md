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
├── pipelines/
│   ├── common/               # Shared Python workspace foundation
│   └── equity_baseline/      # Registry, source adapters, normalization, scoring, orchestration
├── tests/
│   ├── data/equity_baseline/ # Fixture, deterministic, CLI, and opt-in database tests
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
- PostGIS owns analytical spatial relationships; Python owns ingestion, validation,
  normalization, deterministic Equity Baseline scoring, and guarded score-run orchestration.
- MapLibre is limited to browser visualization and interaction. It does not calculate analytical geography.
- `packages/database` exposes only `@mke/database/server`; client and environment modules remain private and poisoned with `server-only`.
- `packages/contracts` contains schemas crossing package or HTTP boundaries.
- `packages/design-system` maps project semantics to HeroUI variables instead of creating a competing component system.

Plan 2 adds the provenance and Equity Baseline domain tables through the database package. Raw
downloads, normalized extracts, and generated quality reports remain ignored local artifacts;
only sanitized manifests may enter `data/manifests/`. The public application still has no
analytical read path because Plan 2 creates validated data but never publishes it.

The Python boundary is intentionally deterministic and testable without a network or database.
Live database tests are marked `integration`, require an isolated migrated development branch,
and are excluded from the default offline suite.
