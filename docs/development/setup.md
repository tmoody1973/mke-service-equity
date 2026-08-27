# Local development setup

Plan 1 uses Node.js 24 with npm 11 and Python 3.13 with uv. Install `psql` and the Neon CLI only when running the isolated database checks.

## Install the workspaces

From the repository root:

```bash
npm ci
uv sync --locked
cp .env.example .env.local
```

Populate only the variables needed for the command you are running. Never commit or print `.env.local`. See [environment.md](environment.md) for the public/server-only boundary.

The licensed React package is pinned at `@heroui-pro/react@1.0.0-beta.8`. A clean install requires `HEROUI_AUTH_TOKEN` in secure local process storage. To diagnose a missing hydrated package without exposing the token:

```bash
npx heroui-pro@latest status
npx heroui-pro@latest install react --yes
npm rebuild @heroui-pro/react
```

The final rebuild is required by the current CLI in this npm workspace layout. Confirm `Sidebar` and `Sheet` exports rather than copying or imitating licensed components.

## Run the application

```bash
npm run dev
```

Open `http://127.0.0.1:3000`. The Plan 1 map intentionally contains no analytical layers or source data.

## Verify the foundation

```bash
npm run lint
npm run typecheck
npm run test
uv run ruff check pipelines tests/data
uv run pytest tests/data -q
npm run build
npm run test:e2e
```

Playwright covers 375, 430, 768, 1024, and 1440 px. Run `npx playwright install chromium` once if the pinned browser is absent. Database migration and integration commands are documented separately in [database.md](database.md) and must target only the approved expiring Neon development branch.
