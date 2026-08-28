# Database development

Plan 1 establishes a server-only Neon/PostgreSQL boundary and enables PostGIS. It does not create application tables, ingest source data, or publish a score run.

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

Drizzle may create its migration journal. No resource, geography, score, ingestion, or other domain table belongs in this plan.

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

For an independent check, load `.env.local` without shell tracing and connect `psql` to `DATABASE_URL_UNPOOLED` with `ON_ERROR_STOP=1`. Verify exactly one `postgis` extension row and inspect non-system relations to confirm no Plan 1 domain tables exist beyond Drizzle's migration journal. Never pass the production branch, echo a URL, or enable shell tracing.

A code deployment does not publish a score run. The public application continues to read only explicitly published analytical runs once later plans add them.
