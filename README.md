# MKE Service Equity

MKE Service Equity is a responsive civic decision-support platform for understanding where public-service needs intersect with underlying equity conditions across Milwaukee County. The City of Milwaukee is the initial analytical focus.

The first production module is the **MKE Food Equity Atlas**.

## Start here

Read these documents in order before implementation:

1. `docs/product/vision.md`
2. `docs/product/prd.md`
3. `docs/architecture/system.md`
4. `docs/methodology/equity-baseline.md`
5. `docs/methodology/food-equity.md`
6. `docs/data/source-registry.md`
7. `docs/ux/screen-specifications.md`
8. `AGENTS.md`
9. The current file in `docs/superpowers/plans/`

## Product principle

**Build narrow. Architect broad.**

The MVP fully delivers the Food Equity Atlas, while the platform architecture supports future Housing, Health, Transit, Parks, Infrastructure, and Investment modules.

## Locked stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- HeroUI + HeroUI Pro
- MapLibre GL JS
- Neon PostgreSQL
- PostGIS
- Drizzle ORM + SQL
- Python
- Pandas + GeoPandas
- Vercel
- GitHub Actions
- No authentication for MVP
- No AI in scoring or policy decisions

## Responsive requirement

Every primary workflow must work at:

- 375 px
- 430 px
- 768 px
- 1024 px
- 1440 px

Mobile behavior is part of acceptance criteria, not a later optimization.

## Development foundation

Plan 1 establishes the repository, application, database, Python, testing, and
delivery foundations. Node.js 24 and Python 3.13 are the pinned local runtimes.
Use the [local setup guide](docs/development/setup.md) for installation and
verification commands, the [database guide](docs/development/database.md) for
isolated Neon work, and the [Vercel guide](docs/deployment/vercel.md) for preview
deployment.

Local environment files, Neon CLI linkage, generated data, build output, and
test artifacts are excluded from version control. Secrets must remain in local
or deployment environment configuration and must never be exposed to browser
code.

## Equity Baseline pipeline

Plan 2 adds a deterministic Python pipeline for the 2020 Milwaukee County tract
geography, 2024 ACS 5-Year indicators, and the December 2025 CDC PLACES release.
The methodology registry is
[`pipelines/equity_baseline/registry.toml`](pipelines/equity_baseline/registry.toml),
and the operational contract is documented in
[`docs/data/ingestion.md`](docs/data/ingestion.md).

The command boundary is intentionally closed to these stages:

```bash
uv run python -m pipelines.equity_baseline fetch
uv run python -m pipelines.equity_baseline validate
uv run python -m pipelines.equity_baseline normalize
uv run python -m pipelines.equity_baseline load
uv run python -m pipelines.equity_baseline score
uv run python -m pipelines.equity_baseline validate-run
uv run python -m pipelines.equity_baseline run --through validated --verify-existing
```

Database stages require `MKE_PIPELINE_ENV=development` and the server-only
`DATABASE_URL_UNPOOLED`. Census requests require `CENSUS_API_KEY`. Values must be
provided through the local environment without printing or committing them.
Plan 2 can create only `draft`, `validated`, or `failed` runs; it cannot publish.
The authoritative live run and its sanitized manifests are recorded separately
from the [offline verification](docs/verification/plan-2-data-pipeline-equity-baseline.md).

## License

Original project code and documentation are licensed under the [MIT License](LICENSE).
Source datasets are not relicensed by this repository; each source retains its
recorded license and provenance requirements. No raw source data is included in
Plan 1.

## Linear

Execution is tracked in the **MKE Service Equity** Linear project under the Moodyco team.

Top-level delivery sequence:

1. Plan 1 — Foundation + Database
2. Plan 2 — Data Pipeline + Equity Baseline
3. Gate 1 — Verify Data + Methodology
4. Plan 3 — Food Data + Accessibility + Priority
5. Plan 4 — Atlas + Tract Profile
6. Gate 2 — Verify Product Experience
7. Plan 5 — Compare + Opportunity Explorer
8. Plan 6 — Methodology + Export + Production QA
9. Gate 3 — Release Readiness
