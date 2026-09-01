# Database development

Plan 1 establishes a server-only Neon/PostgreSQL boundary and enables PostGIS. Plan 2 adds the
provenance, tract, indicator, and Equity Baseline score tables. Neither plan publishes a score
run.

## Connection boundaries

- `DATABASE_URL` is the pooled runtime connection used by server code.
- `DATABASE_URL_UNPOOLED` is the preferred direct connection for Drizzle migrations. Migration tooling falls back to `DATABASE_URL` when the direct connection is unavailable.
- Neither variable may use a `NEXT_PUBLIC_` prefix, enter browser code, be logged, or be committed.
- `@mke/database/server` is the package's only public subpath. It is protected by the `server-only` poison import. Environment readers and client construction remain private internals.
- Client construction is lazy: importing the package does not read an environment variable, open a connection, or issue a query.

`checkDatabaseHealth()` distinguishes four outcomes without exposing connection strings or raw database errors:

- Missing runtime configuration returns `unconfigured`.
- Client initialization or `current_database()` failure returns `error` with an `unreachable` database.
- A `postgis_lib_version()` failure after reachability succeeds returns `error` with a `reachable` database.
- A non-empty PostGIS version returns `ok` with a `reachable` database.

## Migration scope

The only Plan 1 application migration is `packages/database/drizzle/0000_enable_postgis.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Drizzle may create its migration journal. Plan 2 migration
`packages/database/drizzle/0001_equity_baseline.sql` adds the eight approved Equity Baseline
tables, spatial and relational constraints, and the lifecycle trigger described in the
[logical schema](../data/schema.md). Plan 3 migration `0002_food_equity.sql` and forward-only
amendment `0003_food_equity_contract_amendment.sql` add the reviewed Food resource, access,
provenance, score, and development lifecycle contract. They deliberately exclude publication and
application read models.

Migration `0004_atlas_neighborhood_context.sql` adds the reviewed tract/neighborhood crosswalk.
Migration `0005_governed_publication.sql` adds the forward-only governed publication tables,
closed run transitions, immutable member/audit protections, one-current index, and controlled
publish/withdraw database functions. Public execution is revoked. Production role grants are
provisioned separately so the application reader, pipeline writer, publication operator, and
migration owner remain distinct.

## Local checks

These checks do not require a database connection:

```bash
npm test --workspace @mke/database -- --exclude "**/*.integration.test.ts"
npm run typecheck --workspace @mke/database
```

## Isolated development workflow

Live database work must use the personal `mke-service-equity` Neon project and the approved `moo-750-foundation` development branch with a seven-day TTL. The branch must be explicitly confirmed as non-production before a migration or query. Do not use the loaded Neon connector, which is linked to an unrelated organization.

The local Neon link and connection variables are ignored files. Inspect only non-secret `.neon` metadata before checkout. After the Neon CLI checkout flow creates or selects the branch and repulls variables, confirm that `.neon` resolves the approved `moo-750-foundation` branch and that `NEON_BRANCH` matches that branch's ID without printing either database URL. If the CLI resolves a different organization or project, stop.

Record the project ID, branch ID, database name, role name, seven-day expiration policy, and the phrase `development-only` as verification evidence. Never record a connection string.

Once the branch identity is verified, apply and test the migration:

```bash
npm run db:migrate --workspace @mke/database
npm run test:integration --workspace @mke/database
```

For an independent Plan 1 foundation check before applying migration `0001`, load `.env.local`
without shell tracing and connect `psql` to `DATABASE_URL_UNPOOLED` with `ON_ERROR_STOP=1`.
Verify exactly one `postgis` extension row and inspect non-system relations to confirm no domain
tables exist beyond Drizzle's migration journal. Never pass the production branch, echo a URL,
or enable shell tracing.

## Plan 2 isolated run

Authoritative Equity Baseline work uses a child branch named
`moo-751-equity-baseline`, parented from `moo-750-foundation`, with a seven-day TTL. Confirm the
project, parent, non-default status, expiry, database, role, and `development-only` label before
running a migration. Repull `.env.local` through the Neon checkout workflow and verify
`NEON_BRANCH` matches the selected branch ID without printing either URL.

Database-writing pipeline stages require:

```text
MKE_PIPELINE_ENV=development
DATABASE_URL_UNPOOLED=<local secret>
```

Apply and test the schema before source loading:

```bash
npm run db:migrate --workspace @mke/database
npm run test:integration --workspace @mke/database
uv run pytest tests/data/equity_baseline/test_database_integration.py -q -m integration
```

The Python integration suite skips unless its explicit integration prerequisites are present.
It must run only against the confirmed disposable branch. Independently verify PostGIS, the
eight domain tables, named constraints/indexes, the lifecycle trigger, and zero published runs
using `psql` with `ON_ERROR_STOP=1`.

Pipeline persistence uses parameterized statements. The explicit `load` stage writes idempotent
base records; validated-run persistence safely replays those statements with draft creation,
analytical components/scores, and validation in one transaction. Any exception rolls back that
validated-run unit. A separate redacted failure update may change an existing draft to `failed`;
there is no command or repository operation that publishes.

A code deployment does not publish a score run. The public application continues to read only explicitly published analytical runs once later plans add them.

## Plan 3 isolated run

Authoritative Food Equity work uses a child branch named `moo-753-food-equity`, parented from the
approved Plan 2 branch that contains baseline run
`502e2a04-b013-53cd-8b09-c9144862701a`, with a seven-day TTL. Before any write, record sanitized
project/branch/parent IDs, expiry, database, role, non-default status, and `development-only` in
the Plan 3 verification record. Never record a connection string.

After checkout and secret-safe environment loading, apply and verify all migrations:

```bash
npm run db:migrate --workspace @mke/database
npm run test:integration --workspace @mke/database
uv run pytest tests/data/food_equity/test_database_integration.py -q -m integration
```

Independently confirm PostGIS, migrations `0000` through `0003`, all Plan 2/3 tables and named
constraints, the exact validated pinned baseline, zero Food foreign-key orphans, and zero
published Food runs. Database pipeline commands additionally require
`MKE_PIPELINE_ENV=development`. The Food `load` stage writes reusable source/resource/metric
facts; `validate-run` replays them and writes the analytical run in one transaction. Repeating
`run --through validated --verify-existing` must return the same run ID and output hash without
increasing natural-key or analytical counts.

## Plan 6A isolated publication verification

Publication verification uses an explicitly approved disposable child of the Plan 3 branch. It
may publish and withdraw controlled fixtures only. Never publish the authoritative Plan 2/3 runs
or use production credentials without the separate Gate 3 approval.

Apply the migration and run both database stacks:

```bash
npm run db:migrate --workspace @mke/database
npm run test:integration --workspace @mke/database
uv run pytest tests/data -q -m integration
```

Use the [publication runbook](../operations/publication-runbook.md) for dry-run, publish,
reconcile, safe retry, replacement, and withdrawal. The branch owner is allowed only for isolated
development proof. Production must grant a dedicated operator the controlled function boundary
without general table DML and must keep application-reader credentials read-only.
