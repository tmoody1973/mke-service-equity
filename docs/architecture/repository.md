# Repository structure

```text
mke-service-equity/
├── .github/workflows/ci.yml
├── apps/web/
│   ├── app/                  # App Router shell and server health route
│   ├── components/           # HeroUI Pro application shell
│   ├── features/atlas/       # Atlas state, exact tract profile, and plain-language presentation
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
│   ├── equity_baseline/      # Registry, source adapters, normalization, scoring, orchestration
│   └── food_equity/          # Food sources, routing, scoring, persistence, and closed CLI
├── tests/
│   ├── data/equity_baseline/ # Fixture, deterministic, CLI, and opt-in database tests
│   ├── data/food_equity/     # Food source, graph, score, runner, and opt-in database tests
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

Plan 3 keeps acquisition, validation, normalization, retail classification, graph routing,
scoring, and persistence adapters in `pipelines/food_equity/`. PostGIS remains the database
authority for persisted geometry and relational integrity; Python derives database-free stage
predicates from the exact Plan 2 TIGER snapshot and routes on the pinned local PBF. The browser
does not perform analytical GIS. `live.py` is the official-source orchestration boundary, and
`persistence.py` is the lossless adapter into parameterized write plans. Context metrics are
persisted with provenance but never enter score components.

The Python boundary is intentionally deterministic and testable without a network or database.
Live database tests are marked `integration`, require an isolated migrated development branch,
and are excluded from the default offline suite.

Plan 4 adds browser-safe Atlas contracts plus server-only exact-run repositories. The initial map
payload contains bounded tract presentation data; the detailed profile is fetched only after a
selection. `packages/database/src/atlas/profile-repository.ts` verifies Food and Equity component,
snapshot, source, run, and geography lineage before `apps/web/app/api/atlas/tracts/[geoid]` returns
the profile. Browser code renders those results but does not calculate scores or spatial facts.
