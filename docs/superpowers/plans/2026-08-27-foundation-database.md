# Plan 1 — Foundation + Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the MIT-licensed MKE Service Equity repository, monorepo, responsive Next.js application shell, HeroUI Pro design-system foundation, isolated MapLibre client boundary, Neon/PostGIS and Drizzle migration foundation, Python workspace, test infrastructure, CI, and Vercel preview path required by Linear issue MOO-750.

**Architecture:** npm workspaces coordinate a server-first Next.js application and three focused TypeScript packages: contracts, database, and design system. The browser owns only presentation and MapLibre lifecycle; Neon/PostGIS remains server-only, and the only Plan 1 database change is enabling PostGIS through a custom Drizzle migration. Python is packaged independently with uv so later ingestion and scoring plans can evolve without coupling analytical code to the web application.

**Tech Stack:** Node.js 24 LTS, npm 11, Next.js 16.3.3 App Router, React 19.2.8, TypeScript 6.0.3, Tailwind CSS 4.3.3, HeroUI 3.2.4, HeroUI Pro 1.0.0-beta.8, MapLibre GL JS 6.6.0, Neon serverless driver 1.1.0, Drizzle ORM 0.45.2, Drizzle Kit 0.31.10, Zod 4.4.3, Python 3.13, uv, pytest 9.0.2, Ruff 0.14.10, Vitest 4.1.11, Testing Library 16.3.2, Playwright 1.62.1, axe-core 4.13.0, GitHub Actions, and Vercel. Pandas and GeoPandas remain approved stack items but are installed in Plan 2 when ingestion begins, avoiding unused binary dependencies in Plan 1.

**Spec:** `docs/superpowers/specs/2026-08-27-mke-service-equity-design.md`

**Tracking:** Linear `MOO-750` — Plan 1 — Foundation + Database.

**Plan status:** Local implementation and final review completed on 2026-08-27. External verification awaits GitHub CLI authentication, the GitHub Actions HeroUI token, and Vercel Preview environment variables.

## Approved Execution Decisions

1. The exact MOO-750 issue contract was approved, applied, and moved to `In Progress` on 2026-08-27.
2. Create the public repository `tmoody1973/mke-service-equity`; GitHub CLI authentication for `tmoody1973` is verified with `repo` and `workflow` scopes.
3. Use the isolated `.worktrees/moo-750` workspace after the approved root `main` documentation/policy commit.
4. Use the already linked personal Neon `mke-service-equity` project with a new `moo-750-foundation` development branch and seven-day TTL. The local link currently targets `production`; use the Neon CLI checkout flow to create/select the approved non-default branch and repull `.env.local` before any query or migration. The loaded Neon connector remains authenticated to the unrelated `Radio Milwaukee` organization and must not be used for this project.
5. Create a new Vercel project named `mke-service-equity` under the verified existing `tmoody1973s-projects` account/team only at Task 10's approved link/deploy step.

## Global Constraints

- Implement Plan 1 only. Do not begin MOO-751 or Plans 2–6.
- Use Next.js App Router, TypeScript, Tailwind CSS, HeroUI + HeroUI Pro, MapLibre GL JS, Neon PostgreSQL + PostGIS, Drizzle + SQL, Python, Vercel, and GitHub Actions.
- Use Server Components by default. Add `"use client"` only to the smallest responsive HeroUI Pro `Sidebar` boundary and MapLibre lifecycle component that require browser state, responsive overlay state, or WebGL.
- Do not add authentication, AI, fake analytical data, scoring logic, Food Equity calculations, domain data ingestion, vector tiles, or additional product modules.
- Do not create the logical domain tables from `docs/data/schema.md` in Plan 1; their keys, nullability, constraints, geometry types, and publication semantics belong to later reviewed plans.
- Do not connect browser code directly to Neon. `DATABASE_URL` and `DATABASE_URL_UNPOOLED` are server-only and must never use a `NEXT_PUBLIC_` prefix.
- Do not mutate a production database. Apply migrations only to a Neon project/branch explicitly identified as isolated development infrastructure.
- Preserve missing and unconfigured states; never replace missing values with zero.
- Use HeroUI/Pro components before custom primitives. Import Tailwind, HeroUI, then HeroUI Pro CSS in that order.
- MapLibre owns rendering and interaction only. It contains no analytical GIS logic and no source data in Plan 1.
- Every primary shell flow must be tested at 375, 430, 768, 1024, and 1440 CSS pixels.
- Target WCAG 2.2 AA: keyboard navigation, visible focus, semantic structure, useful labels, sufficient contrast, reduced-motion support, practical touch targets, and an accessible non-map status.
- Commit after each independently reviewable task with `MOO-750` in the message.
- Do not mark MOO-750 Done until the real verification checklist and evidence record pass.

## Approved Plan 1 Decisions

| Decision | Choice | Reason |
|---|---|---|
| Workspace orchestration | npm workspaces, without Turborepo | The repository is small and has no demonstrated need for another orchestrator. |
| Runtime versions | Node 24 LTS and Python 3.13 | Stable deployment/CI targets that satisfy Next.js 16's Node 20.9+ floor and keep the future geospatial Python ecosystem on a conservative interpreter. |
| HeroUI | HeroUI v3 + HeroUI Pro beta package | Current HeroUI v3 requires Tailwind v4, uses CSS-first setup, and requires no root provider. Pro installation is licensed and requires local login plus `HEROUI_AUTH_TOKEN` in CI/Vercel. |
| Database runtime | `drizzle-orm/neon-http` with `@neondatabase/serverless` | Small serverless query surface for Next.js/Vercel; migrations remain a Drizzle Kit CLI concern. |
| Database breadth | PostGIS extension only | Proves connectivity and migration mechanics without prematurely inventing the domain schema. |
| Map style | Checked-in, data-free MapLibre style for deterministic shell tests; optional `NEXT_PUBLIC_MAP_STYLE_URL` override | Avoids fake geography, provider credentials, demo-tile production dependencies, and flaky CI while proving WebGL lifecycle. |
| UI visual world | HeroUI Pro's established Operate-mode design language with project semantic aliases | The approved component system is the visual authority; Plan 1 does not invent a separate brand system. |
| CI caching | No custom dependency cache in the baseline | Avoids unverified cache configuration; `npm ci` and `uv sync --locked` remain deterministic. |
| Vercel | One project rooted at `apps/web`; Next.js framework defaults | Matches current Vercel monorepo guidance and avoids unnecessary root build overrides. |
| Repository license | MIT for original project code/documentation; source datasets retain their own licenses | Supports the requested open-source repository without relicensing third-party data. |
| Python analytical libraries | Defer Pandas and GeoPandas installation to Plan 2 | Plan 1 proves the Python toolchain only; no ingestion or geospatial preprocessing runs yet. |

## Package and Runtime Interfaces

| Producer | Interface | Consumers |
|---|---|---|
| `@mke/contracts` | `DatabaseHealthResponse`, `databaseHealthResponseSchema` | `@mke/database`, `/api/health/database`, tests |
| `@mke/database/server` | `checkDatabaseHealth(): Promise<DatabaseHealthResponse>` | Server route handlers and integration tests only |
| `@mke/design-system` | `@mke/design-system/tokens.css` semantic CSS variables | `apps/web/app/globals.css` |
| `apps/web/components/application-shell` | Server `ApplicationShell({ children })`, serializable navigation model, and one responsive Sidebar client boundary | Server-rendered page content; HeroUI Pro desktop/mobile navigation |
| `apps/web/features/map` | `MapShell` server wrapper and `MapCanvas` client lifecycle | Atlas foundation page only |
| `pipelines.common` | `WORKSPACE_NAME`, importable Python package | Python smoke tests and later pipeline plans |

## File Map

The tasks below create or modify exactly these responsibility groups:

- Repository policy: `.gitignore`, `.editorconfig`, `.nvmrc`, `.python-version`, `LICENSE`, `README.md`, `data/README.md`, and tracked Neon CLI policy in `neon.ts`; local `.neon` linkage and `.env.local` remain ignored.
- Workspace configuration: `package.json`, `package-lock.json`, `tsconfig.json`, `packages/config/typescript/*.json`.
- Contracts: `packages/contracts/package.json`, `packages/contracts/src/*.ts`, `packages/contracts/tests/*.test.ts`.
- Database: `packages/database/package.json`, `packages/database/drizzle.config.ts`, `packages/database/drizzle/**`, `packages/database/src/*.ts`, `packages/database/tests/*.test.ts`.
- Design system: `packages/design-system/package.json`, `packages/design-system/src/tokens.css`, `packages/design-system/tests/tokens.test.ts`, `PRODUCT.md`.
- Web application: `apps/web/package.json`, Next/TypeScript/PostCSS/Vitest configs, `apps/web/app/**`, `apps/web/components/**`, `apps/web/features/map/**`, `apps/web/public/map-style.json`, and tests.
- Python: `pyproject.toml`, `uv.lock`, `pipelines/__init__.py`, `pipelines/common/**`, `tests/data/test_workspace.py`.
- End-to-end tests: `playwright.config.ts`, `tests/e2e/application-shell.spec.ts`, `tests/e2e/accessibility.spec.ts`.
- Delivery and evidence: `.github/workflows/ci.yml`, `apps/web/vercel.json`, `.env.example`, `docs/development/*.md`, `docs/deployment/vercel.md`, `docs/architecture/repository.md`, and `docs/verification/plan-1-foundation-database.md`.

---

### Task 0: Normalize and Start the Linear Contract

**Files:**
- Modify: Linear issue `MOO-750` only; no repository files.

**Interfaces:**
- Consumes: the user-approved Plan 1 scope and this reviewed implementation plan.
- Produces: a Linear issue with `Intent`, `Acceptance criteria`, `Verification checklist`, and `Out of scope`, in state `In Progress`.

- [x] **Step 1: Re-read MOO-750 and preserve its project/dependency metadata**

Use Linear `get_issue` for `MOO-750`. Confirm it belongs to project `MKE Service Equity`, is assigned to Tarik Moody, blocks `MOO-751`, and contains no requirements beyond Plan 1.

- [x] **Step 2: Obtain approval for the repaired issue contract**

Present this exact contract and wait for explicit approval before updating Linear:

```markdown
## Intent
Establish the production-ready technical foundation for MKE Service Equity so later reviewed plans can add verified data and Food Equity workflows without changing the platform boundary.

## Acceptance criteria
- [ ] MIT-licensed GitHub repository and npm monorepo are established.
- [ ] Next.js App Router, TypeScript, Tailwind CSS, HeroUI, and licensed HeroUI Pro run in a server-first responsive shell.
- [ ] The shell passes at 375, 430, 768, 1024, and 1440 CSS pixels with WCAG 2.2 AA-oriented checks.
- [ ] MapLibre renders an isolated, data-free base map shell with visible attribution and accessible non-map status.
- [ ] An isolated Neon development target has PostGIS enabled through a Drizzle migration and server-only connectivity is verified.
- [ ] The Python/uv workspace, unit/integration/E2E tests, GitHub Actions baseline, and Vercel preview path operate successfully.
- [ ] Documentation and verification evidence match the implemented foundation.

## Verification checklist (prove it against reality)
- [ ] Record local lint, typecheck, unit, Python, production-build, and E2E output.
- [ ] Record Drizzle migration output and an independent Neon query returning a PostGIS version on the isolated development target.
- [ ] Record responsive screenshots and Playwright results at all five required widths plus WCAG A/AA axe results.
- [ ] Record GitHub repository, commit range, passing Actions run, and Vercel preview URLs.
- [ ] Record HeroUI Pro authorization/install evidence without exposing the token.
- [ ] Confirm browser assets and responses contain no Neon credentials or server database modules.

## Out of scope
Plans 2–6; domain tables; source ingestion; scoring; analytical GIS; Food Equity calculations; fake analytical data; authentication; AI; vector tiles; and additional product modules.
```

- [x] **Step 3: Update and align**

After approval, replace the incomplete MOO-750 description with the contract, restate its intent and finish line in the task commentary, and move it to `In Progress`. Do not alter its project, assignee, labels, priority, or `blocks MOO-751` relation.

Expected: MOO-750 is the sole implementation issue in progress and its contract matches this plan.

---

### Task 1: Repository, MIT License, and Git Foundation

**Files:**
- Modify: `.gitignore`
- Modify: `neon.ts`
- Create: `.editorconfig`
- Create: `.nvmrc`
- Create: `.python-version`
- Create: `LICENSE`
- Create: `data/README.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: The approved documentation currently present in the directory.
- Produces: A local `main` history, an isolated `.worktrees/moo-750` workspace on branch `tarikjmoody/moo-750-plan-1-foundation-database`, repository policy files, and an MIT license boundary.

- [x] **Step 1: Initialize Git without adding implementation files**

Run:

```bash
git init -b main
git status --short --branch
```

Expected: Git reports `No commits yet on main`; no parent repository is used.

- [x] **Step 2: Add repository policy and license files**

Expand the existing `.gitignore` with `.DS_Store`, `.neon`, `.worktrees/`, `node_modules/`, `.next/`, `coverage/`, `playwright-report/`, `test-results/`, `artifacts/`, `.env*` with `!.env.example`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`, `.vercel/`, `.superpowers/`, and generated local data directories. Keep `neon.ts` tracked as project policy and preserve its seven-day TTL for newly created non-default branches; never commit the local `.neon` link or `.env.local`. Use the standard MIT license text with `Copyright (c) 2026 Tarik Moody`. In `data/README.md`, state that project MIT licensing does not override each source dataset's recorded license and that no raw data belongs in Plan 1.

- [x] **Step 3: Verify the license and ignore boundary**

Run:

```bash
test -f LICENSE
rg -n "MIT License|Copyright \(c\) 2026 Tarik Moody" LICENSE
git check-ignore .DS_Store .neon .env.local node_modules/example .worktrees/example
```

Expected: both license lines are found and all five generated/private paths are ignored.

- [x] **Step 4: Commit the documentation baseline on `main`**

Run:

```bash
git add README.md AGENTS.md docs .gitignore .editorconfig .nvmrc .python-version LICENSE data/README.md neon.ts
git commit -m "chore(repo): initialize MIT-licensed project (MOO-750)"
```

Expected: one root commit exists on `main`; it contains approved documentation, the reviewed Plan 1 plan, repository policy, and no implementation.

- [x] **Step 5: Create the GitHub repository after the external-visibility gate**

The approved command target is `tmoody1973/mke-service-equity`. Before running it, confirm the owner and whether the repository is public; MIT licensing alone does not publish the repository. Then authenticate and create/push using the confirmed visibility.

Run exactly one creation command after that confirmation.

Public repository:

```bash
gh auth status
gh repo create tmoody1973/mke-service-equity --public --source=. --remote=origin --push
git remote -v
```

Private repository:

```bash
gh auth status
gh repo create tmoody1973/mke-service-equity --private --source=. --remote=origin --push
git remote -v
```

Expected: the authenticated owner is `tmoody1973`, `origin` points to the new GitHub repository, and `main` is pushed. The MOO-750 branch is created in Step 6 and pushed after its first implementation commit. If authentication is invalid, stop and request `gh auth login -h github.com`; do not claim GitHub setup is complete.

- [x] **Step 6: Create the isolated MOO-750 worktree**

After obtaining the worktree consent required by the Superpowers `using-git-worktrees` workflow, run from the primary checkout:

```bash
git check-ignore .worktrees/example
git worktree add .worktrees/moo-750 -b tarikjmoody/moo-750-plan-1-foundation-database
git worktree list --porcelain
```

Expected: `.worktrees` is ignored, the linked workspace is on the MOO-750 branch, and every later task runs with `.worktrees/moo-750` as its working directory. If the user declines a linked worktree, create the feature branch in place and record that explicit choice in the evidence document.

- [x] **Step 7: Commit checkpoint**

No additional commit is needed if Step 4 is clean. Record the root commit SHA and GitHub URL in the verification evidence file during Task 10.

---

### Task 2: npm Workspace and Shared TypeScript Configuration

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `packages/config/package.json`
- Create: `packages/config/typescript/base.json`
- Create: `packages/config/typescript/nextjs.json`
- Create: `packages/config/README.md`
- Create: `packages/contracts/package.json`
- Create: `packages/database/package.json`
- Create: `packages/design-system/package.json`
- Create: `apps/web/package.json`

**Interfaces:**
- Consumes: Node 24, npm 11, repository structure in `docs/architecture/repository.md`.
- Produces: npm workspace names `@mke/web`, `@mke/contracts`, `@mke/database`, `@mke/design-system`, and `@mke/config` with root verification scripts.

- [x] **Step 1: Write the root workspace manifest**

Create the root manifest exactly as follows:

```json
{
  "name": "mke-service-equity",
  "version": "0.0.0",
  "private": true,
  "license": "MIT",
  "packageManager": "npm@11.12.1",
  "engines": {"node": ">=24 <27"},
  "workspaces": ["apps/*", "packages/*"],
  "overrides": {
    "tar": "$tar"
  },
  "scripts": {
    "build": "npm run build --workspace @mke/web",
    "dev": "npm run dev --workspace @mke/web",
    "lint": "eslint .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "test:e2e": "playwright test",
    "verify": "npm run lint && npm run typecheck && npm run test && npm run build"
  },
  "dependencies": {
    "@heroui/react": "3.2.4",
    "@heroui/styles": "3.2.4",
    "@react-aria/utils": "3.34.1",
    "motion": "13.1.1",
    "react": "19.2.8",
    "react-aria-components": "1.20.0",
    "react-dom": "19.2.8",
    "react-resizable-panels": "4.12.3",
    "tailwind-merge": "3.6.0",
    "tailwind-variants": "3.3.1",
    "tailwindcss": "4.3.3"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.13.0",
    "@playwright/test": "1.62.1",
    "drizzle-orm": "0.45.2",
    "eslint": "9.39.5",
    "eslint-config-next": "16.3.3",
    "heroui-pro": "1.0.0-beta.12",
    "jsdom": "30.0.1",
    "next": "16.3.3",
    "tar": "7.5.22",
    "typescript": "6.0.3"
  }
}
```

`next` is also declared at the repository root so the root-hoisted `eslint-config-next` can resolve its bundled parser consistently after a fresh npm install on Linux CI; the web workspace keeps the same exact runtime version. The root dependency boundary also pins the core peers reported by `heroui-pro install --dry-run --yes react`, preventing a hoisted Pro package from resolving peers outside the repository.

Create workspace manifests with version `0.0.0`, `private: true`, `type: "module"`, and these exact boundaries:

For `packages/contracts/package.json`:

```json
{
  "name": "@mke/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {".": "./src/index.ts"},
  "scripts": {"typecheck": "tsc --noEmit", "test": "vitest run"},
  "dependencies": {"zod": "4.4.3"},
  "devDependencies": {"@types/node": "26.4.0", "typescript": "6.0.3", "vitest": "4.1.11"}
}
```

For `packages/database/package.json`:

```json
{
  "name": "@mke/database",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {"./server": "./src/server.ts"},
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run --exclude **/*.integration.test.ts",
    "test:integration": "vitest run tests/health.integration.test.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@mke/contracts": "0.0.0",
    "@neondatabase/serverless": "1.1.0",
    "drizzle-orm": "0.45.2",
    "server-only": "0.0.1"
  },
  "devDependencies": {"@types/node": "26.4.0", "drizzle-kit": "0.31.10", "typescript": "6.0.3", "vitest": "4.1.11"}
}
```

For `packages/design-system/package.json`:

```json
{
  "name": "@mke/design-system",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {"./tokens.css": "./src/tokens.css"},
  "scripts": {"typecheck": "tsc --noEmit", "test": "vitest run"},
  "devDependencies": {"@types/node": "26.4.0", "typescript": "6.0.3", "vitest": "4.1.11"}
}
```

For `packages/config/package.json`:

```json
{
  "name": "@mke/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./typescript/base": "./typescript/base.json",
    "./typescript/nextjs": "./typescript/nextjs.json"
  }
}
```

For `apps/web/package.json`:

```json
{
  "name": "@mke/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build --webpack",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@heroui/react": "3.2.4",
    "@heroui/styles": "3.2.4",
    "@mke/config": "0.0.0",
    "@mke/contracts": "0.0.0",
    "@mke/database": "0.0.0",
    "@mke/design-system": "0.0.0",
    "maplibre-gl": "6.6.0",
    "next": "16.3.3",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.3",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.6",
    "@types/node": "26.4.0",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.5",
    "jsdom": "30.0.1",
    "tailwindcss": "4.3.3",
    "typescript": "6.0.3",
    "vitest": "4.1.11"
  }
}
```

Do not add `@heroui-pro/react` manually in this task. The licensed HeroUI Pro CLI adds the package and its required peers in Task 6 after authorization is verified, so the initial workspace install cannot trigger an unauthenticated Pro artifact download.

The root ESLint flat config is:

```js
import {defineConfig, globalIgnores} from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    settings: {
      next: {rootDir: "apps/web"},
    },
  },
  globalIgnores([
    "**/.next/**",
    "**/coverage/**",
    "playwright-report/**",
    "test-results/**",
    "artifacts/**",
    ".worktrees/**",
    "packages/database/drizzle/meta/**",
  ]),
]);
```

This single root command lints application and TypeScript package source; packages do not duplicate ESLint configs. The Next plugin root points at `apps/web` so monorepo linting resolves the App Router without emitting a false missing-pages warning.

The root repeats the exact `drizzle-orm` pin as a development-only CLI companion because npm hoists `drizzle-kit` from `@mke/database` while retaining the ORM under that workspace. Without the root companion, Drizzle Kit cannot resolve its version module and stops before migration SQL runs. Runtime database ownership remains in `@mke/database`.

- [x] **Step 2: Write shared TypeScript configuration**

Write `packages/config/typescript/base.json` as:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true
  }
}
```

Write `nextjs.json` as:

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "incremental": true,
    "plugins": [{"name": "next"}]
  }
}
```

The root `tsconfig.json` is `{"extends":"./packages/config/typescript/base.json","files":[]}`; each source package has its own include list and runs `tsc --noEmit`, avoiding invalid build references to no-emit projects.

- [x] **Step 3: Install and lock dependencies**

Run:

```bash
npm install
npm ls --workspaces --depth=0
```

Expected: npm creates one root `package-lock.json`, resolves every workspace, and reports no invalid or extraneous workspace dependency.

- [x] **Step 4: Verify the workspace graph**

Run:

```bash
npm pkg get name --workspaces
npm run typecheck --workspaces --if-present
```

Expected: all five package names are returned; packages with source files type-check and empty scaffolds exit cleanly.

Execution note (2026-08-27): the four non-web workspaces type-check cleanly. The web command remains intentionally RED until Task 5 creates `apps/web/app`; current Next.js `typegen` rejects a project with neither an `app` nor `pages` directory. Do not add premature route files merely to make this sequencing check green. Live package metadata and a lint-startup check also showed that `eslint-config-next@16.3.3`'s bundled `typescript-eslint@8.68.0` rejects the TypeScript 7 API and that its bundled React/import plugins cap ESLint support at 9. The executable pins were corrected to TypeScript 6.0.3 and ESLint 9.39.5, the newest mutually supported releases.

- [x] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json eslint.config.mjs apps/web/package.json packages/config packages/contracts/package.json packages/database/package.json packages/design-system/package.json
git commit -m "chore(workspace): establish npm monorepo (MOO-750)"
```

---

### Task 3: Shared Contracts and Environment Strategy

**Files:**
- Create: `.env.example`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/vitest.config.ts`
- Create: `packages/contracts/src/database-health.ts`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/tests/database-health.test.ts`
- Create: `docs/development/environment.md`

**Interfaces:**
- Consumes: Zod 4.4.3.
- Produces: a discriminated `DatabaseHealthResponse`: `ok` requires `database: "reachable"` and a non-empty PostGIS version; `unconfigured` requires `database: "unconfigured"` and `null`; `error` requires `database: "reachable" | "unreachable"` and `null`.

- [x] **Step 1: Write the failing contract tests**

```ts
import {describe, expect, it} from "vitest";
import {databaseHealthResponseSchema} from "../src/database-health";

describe("databaseHealthResponseSchema", () => {
  it("accepts a reachable PostGIS response", () => {
    expect(databaseHealthResponseSchema.parse({
      status: "ok",
      database: "reachable",
      postgisVersion: "3.5",
    })).toEqual({status: "ok", database: "reachable", postgisVersion: "3.5"});
  });

  it("preserves an unconfigured database instead of treating it as reachable", () => {
    expect(databaseHealthResponseSchema.parse({
      status: "unconfigured",
      database: "unconfigured",
      postgisVersion: null,
    }).database).toBe("unconfigured");
  });

  it("rejects contradictory health states", () => {
    expect(() => databaseHealthResponseSchema.parse({
      status: "ok",
      database: "unreachable",
      postgisVersion: null,
    })).toThrow();
  });
});
```

- [x] **Step 2: Run RED**

Run: `npm test --workspace @mke/contracts`

Expected: FAIL because `src/database-health.ts` does not exist.

- [x] **Step 3: Implement the contract and public export**

Use `z.discriminatedUnion("status", [...])` for the exact valid objects above, with `z.string().min(1)` for the successful PostGIS version, and infer the TypeScript type from the schema. Export only the schema and inferred type from `src/index.ts`.

- [x] **Step 4: Run GREEN**

Run:

```bash
npm test --workspace @mke/contracts
npm run typecheck --workspace @mke/contracts
```

Expected: both tests pass; TypeScript emits no errors.

- [x] **Step 5: Document environment variables**

`.env.example` contains names and non-secret descriptions for:

```dotenv
DATABASE_URL=
DATABASE_URL_UNPOOLED=
NEXT_PUBLIC_MAP_STYLE_URL=/map-style.json
HEROUI_AUTH_TOKEN=
```

Document that `DATABASE_URL` is pooled runtime access, `DATABASE_URL_UNPOOLED` is preferred for migrations, `NEXT_PUBLIC_MAP_STYLE_URL` is intentionally public, and `HEROUI_AUTH_TOKEN` is installation-only and belongs in local secure storage, GitHub Actions secrets, and Vercel encrypted environment variables. Explicitly forbid committing `.env.local` or logging values.

- [x] **Step 6: Commit**

```bash
git add .env.example packages/contracts docs/development/environment.md
git commit -m "feat(contracts): define foundation health contract (MOO-750)"
```

---

### Task 4: Neon, PostGIS, and Drizzle Migration Foundation

**Files:**
- Create: `packages/database/tsconfig.json`
- Create: `packages/database/vitest.config.ts`
- Create: `packages/database/drizzle.config.ts`
- Create: `packages/database/src/env.ts`
- Create: `packages/database/src/client.ts`
- Create: `packages/database/src/health.ts`
- Create: `packages/database/src/server.ts`
- Create: `packages/database/tests/env.test.ts`
- Create: `packages/database/tests/health.test.ts`
- Create: `packages/database/tests/migration-scope.test.ts`
- Create: `packages/database/tests/health.integration.test.ts`
- Create: `packages/database/tests/server-only-stub.ts`
- Create: `packages/database/drizzle/0000_enable_postgis.sql`
- Create: `packages/database/drizzle/meta/_journal.json`
- Create: `docs/development/database.md`

**Interfaces:**
- Consumes: pooled `DATABASE_URL`, preferred migration `DATABASE_URL_UNPOOLED`, and `DatabaseHealthResponse`.
- Produces: public subpath `@mke/database/server` with `checkDatabaseHealth(): Promise<DatabaseHealthResponse>`; URL readers and the Drizzle client remain private package internals.

- [x] **Step 1: Write the failing environment and migration-scope tests**

```ts
import {describe, expect, it} from "vitest";
import {readMigrationDatabaseUrl, readRuntimeDatabaseUrl} from "../src/env";

describe("database URL selection", () => {
  it("rejects a missing server database URL", () => {
    expect(() => readRuntimeDatabaseUrl({})).toThrow("DATABASE_URL is required");
  });

  it("uses the pooled URL for runtime queries", () => {
    expect(readRuntimeDatabaseUrl({DATABASE_URL: "postgresql://pooled.example/mke"}))
      .toBe("postgresql://pooled.example/mke");
  });

  it("prefers the unpooled URL for migrations", () => {
    expect(readMigrationDatabaseUrl({
      DATABASE_URL: "postgresql://pooled.example/mke",
      DATABASE_URL_UNPOOLED: "postgresql://direct.example/mke",
    })).toBe("postgresql://direct.example/mke");
  });
});
```

The health unit test injects a client factory and asserts that missing `DATABASE_URL` returns `unconfigured` without invoking the factory, client initialization or the first query failing returns `error`/`unreachable`, the PostGIS query failing after `current_database()` succeeds returns `error`/`reachable`, and a non-empty PostGIS version returns `ok`/`reachable`. The migration-scope test reads `drizzle/0000_enable_postgis.sql`, expects `CREATE EXTENSION IF NOT EXISTS postgis`, and rejects `CREATE TABLE`, `INSERT INTO`, and any score/resource/geography domain identifier.

- [x] **Step 2: Run RED**

Run: `npm test --workspace @mke/database`

Expected: FAIL because `src/env.ts` and the migration do not exist.

- [x] **Step 3: Implement the server-only database package**

`src/env.ts` exports the two readers exercised above; neither logs its input. `drizzle.config.ts` calls `readMigrationDatabaseUrl(process.env)`. `src/client.ts` exports a lazy factory that accepts a validated runtime URL, constructs `neon(url)`, and passes it to `drizzle({client})`; it must not read the environment or create a client at module evaluation time. `src/health.ts` first returns `{status: "unconfigured", database: "unconfigured", postgisVersion: null}` when `DATABASE_URL` is absent. Otherwise it validates the URL and creates the client inside the health-call boundary. It first runs a parameter-free `current_database()` reachability query: initialization or reachability failures return `{status: "error", database: "unreachable", postgisVersion: null}`. It then runs `postgis_lib_version()`: a failure after reachability succeeds returns `{status: "error", database: "reachable", postgisVersion: null}`. A non-empty PostGIS version returns `ok`. No branch logs the URL or raw server error.

`src/server.ts` contains the package poison boundary and public export:

```ts
import "server-only";

export {checkDatabaseHealth} from "./health";
```

`package.json` exposes only `"./server": "./src/server.ts"`; it does not expose `env.ts` or `client.ts`. Both database and web Vitest configs alias `server-only` to the empty `tests/server-only-stub.ts`, while Next's real build resolves the poison package normally. The integration test imports `@mke/database/server`; the post-build client-chunk scan in Task 10 proves the server package never enters the browser graph.

- [x] **Step 4: Generate and narrow the custom migration**

Run from `packages/database`:

```bash
npx drizzle-kit generate --custom --name=enable_postgis
```

Replace the generated SQL body with exactly:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Expected: Drizzle creates migration metadata and the only application SQL change enables PostGIS.

- [x] **Step 5: Run unit GREEN**

Run:

```bash
npm test --workspace @mke/database -- --exclude "**/*.integration.test.ts"
npm run typecheck --workspace @mke/database
```

Expected: environment, health-state, and scope tests pass; TypeScript emits no errors.

- [x] **Step 6: Provision or select the isolated Neon development target**

Use the Neon CLI link already stored locally for the personal `mke-service-equity` project; do not use the loaded Neon connector, which is authenticated to an unrelated organization. Before changing branch context, inspect only the non-secret `.neon` metadata and confirm the linked branch is `production`. After the user approves the branch name and lifetime, run the current Neon CLI flow for that explicit non-default name. If `checkout` does not create a missing branch, use `branches create --name <approved-name> --parent production --expires-at <resolved-seven-day-UTC-timestamp> --no-secrets`, then check it out. Checkout repulls branch-scoped variables automatically. Immediately verify that `.neon` resolves the approved branch name and that `NEON_BRANCH` matches its non-production branch ID without printing either database URL. Record the project ID, branch ID, database name, role name, approved expiration policy, and the phrase `development-only`; never record the connection string. If the CLI resolves a different project or organization, stop for direction.

Execution evidence (2026-08-27): `development-only`; project `wispy-glitter-41930798`; branch `moo-750-foundation` / `br-dark-dew-a5x4dxm6`; database `neondb`; role `neondb_owner`; explicit expiry `2026-09-03T20:01:31Z` (seven-day policy). No connection string is recorded.

- [x] **Step 7: Apply the migration to real development infrastructure**

Set local secret variables without echoing them, then run:

```bash
npm run db:migrate --workspace @mke/database
npm run test:integration --workspace @mke/database
```

Expected: Drizzle reports the migration applied; the integration test returns `database: "reachable"` and a non-empty PostGIS version from the isolated development database.

- [x] **Step 8: Verify real database state independently**

Load `.env.local` without shell tracing and run `psql` against `DATABASE_URL_UNPOOLED` on the same approved branch:

```bash
set -a
. ./.env.local
set +a
PGCONNECT_TIMEOUT=10 psql "$DATABASE_URL_UNPOOLED" --no-psqlrc --set ON_ERROR_STOP=1
```

In that session, run:

```sql
SELECT current_database() AS database_name,
       extversion AS postgis_version
FROM pg_extension
WHERE extname = 'postgis';
```

Expected: exactly one row is returned. Also inspect non-system relations through the same `psql` session and confirm no Plan 1 domain tables exist beyond Drizzle's migration journal. Do not pass `production`, print a connection string, enable shell tracing, or use the unrelated Neon connector.

- [x] **Step 9: Commit**

```bash
git add packages/database docs/development/database.md
git commit -m "feat(database): enable PostGIS on isolated Neon dev (MOO-750)"
```

---

### Task 5: Python Data Workspace

**Files:**
- Create: `pyproject.toml`
- Create: `uv.lock`
- Create: `pipelines/__init__.py`
- Create: `pipelines/common/__init__.py`
- Create: `pipelines/common/README.md`
- Create: `tests/data/test_workspace.py`

**Interfaces:**
- Consumes: Python 3.13 and uv.
- Produces: importable `pipelines.common.WORKSPACE_NAME` and a deterministic pytest command; no ingestion or scoring behavior.

- [x] **Step 1: Write the failing Python smoke test**

```python
from pipelines.common import WORKSPACE_NAME


def test_python_workspace_is_importable() -> None:
    assert WORKSPACE_NAME == "mke-service-equity-data"
```

- [x] **Step 2: Run RED**

Run: `uv run pytest tests/data/test_workspace.py -q`

Expected: FAIL because `pipelines.common` is not importable.

- [x] **Step 3: Implement the minimal package**

Write `pyproject.toml` exactly as:

```toml
[project]
name = "mke-service-equity-data"
version = "0.0.0"
requires-python = ">=3.13,<3.14"
dependencies = []

[dependency-groups]
dev = [
  "pytest==9.0.2",
  "ruff==0.14.10",
]

[tool.uv]
package = false

[tool.pytest.ini_options]
testpaths = ["tests/data"]
pythonpath = ["."]

[tool.ruff]
target-version = "py313"
line-length = 100
```

No build backend is added because Plan 1 runs the workspace from the repository and does not publish a Python distribution. Pytest explicitly adds the repository root to its import path because `uv` correctly does not install a `package = false` project and the pytest console entry point otherwise omits the workspace root. `pipelines/common/__init__.py` exports only `WORKSPACE_NAME = "mke-service-equity-data"`. The README explicitly states that Pandas, GeoPandas, ingestion, normalization, spatial preprocessing, and scoring begin in Plan 2 and are intentionally absent from Plan 1.

- [x] **Step 4: Lock and run GREEN**

Run:

```bash
uv lock
uv sync --locked
uv run pytest tests/data -q
uv run ruff check pipelines tests/data
```

Expected: one test passes and Ruff reports no violations.

- [x] **Step 5: Commit**

```bash
git add pyproject.toml uv.lock pipelines tests/data
git commit -m "chore(python): establish data workspace (MOO-750)"
```

---

### Task 6: HeroUI Pro and Project Design-System Foundation

**Files:**
- Create: `PRODUCT.md`
- Create: `packages/design-system/tsconfig.json`
- Create: `packages/design-system/src/tokens.css`
- Create: `packages/design-system/tests/tokens.test.ts`
- Modify: `packages/design-system/package.json`
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Approved product/UX documents, HeroUI v3 styles, licensed HeroUI Pro artifacts.
- Produces: stable semantic aliases `--mke-canvas`, `--mke-panel`, `--mke-text`, `--mke-muted`, `--mke-accent`, `--mke-focus`, `--mke-radius-panel`, and `--mke-touch-target`.

- [x] **Step 1: Capture confirmed product truth**

Create `PRODUCT.md` using the Impeccable schema comment and only confirmed facts: platform `web`; primary Milwaukee public-sector decision-makers; public/community secondary users; evidence-before-recommendation position; Food Equity Atlas MVP; responsive widths; WCAG 2.2 AA target; locked stack; no authentication/AI/fake data; and absence of approved brand imagery. Do not add aesthetic claims, metrics, testimonials, or unapproved product behavior.

- [x] **Step 2: Verify HeroUI Pro authorization before modifying UI**

Run `status` at repository root, then run `install` with `apps/web` as the command working directory:

```bash
npx heroui-pro@latest status
npx heroui-pro@latest install react --yes
npm rebuild @heroui-pro/react
npm ls @heroui-pro/react --workspace @mke/web
```

Expected: the CLI confirms an authorized React Pro entitlement, installs artifacts into the web workspace, and npm reports `@heroui-pro/react@1.0.0-beta.8` under `@mke/web`. If authorization is absent, stop and ask the user to run `npx heroui-pro@latest login`; do not substitute imitation Pro components.

Keep the licensed React package pinned exactly at `1.0.0-beta.8`. The explicit `react` product argument prevents the current CLI from attempting both React and Native. If an earlier bare install added `heroui-native-pro`, remove that unrelated native package. npm workspaces hoist the package away from the CLI's app-local detector, so run the official package postinstall through `npm rebuild @heroui-pro/react` and verify real `Sidebar`/`Sheet` exports plus `dist/css/index.css`. The hydrated root package imports runtime peers from its own resolution level, so pin the Sidebar/Sheet peer set in the root `dependencies` block as well as the web workspace; this keeps local, CI, and Vercel production builds deterministic. The same layout hoists Vitest, so root `jsdom` keeps its browser environment resolvable while the web workspace retains the direct test dependency. Pin the CLI itself at the root so npm 11 does not drop the transitive override across the web workspace link. The root `tar` development dependency and npm `$tar` override then keep the CLI's archive utility on patched `tar@7.5.22`; do not remove them until the licensed CLI itself depends on a non-vulnerable release.

Planning evidence captured on 2026-08-27: the live unified HeroUI MCP lists `sheet` and `sidebar` as root exports from `@heroui-pro/react`; `get_component_docs` confirms the compound APIs and built-in `Sidebar.Mobile` Sheet; `get_css` confirms the shipped `max-width: 768px` switch, 240px desktop width, 80vw/500px mobile width, and reduced-motion behavior; `get_theme_variables({theme: "default"})` confirms the semantic tokens used below; and the installation guide confirms React 19+, Tailwind v4, CLI-managed peer installation, no provider, and CSS import order. Direct Sheet anatomy is `Sheet.Trigger`, `Sheet.Backdrop`, `Sheet.Content`, `Sheet.Dialog`, optional `Sheet.CloseTrigger`, `Sheet.Header`/`Sheet.Heading`, and `Sheet.Body`, but Plan 1 navigation uses `Sidebar.Mobile` rather than composing those parts independently. After the licensed package install, repeat `list_components` and the focused `get_component_docs` calls as a drift check. Stop if live interfaces no longer match this finalized plan.

- [x] **Step 3: Write the failing token-contract test**

The Vitest test reads `src/tokens.css` and asserts that each semantic variable listed in Interfaces appears exactly once and that `--mke-touch-target` equals `44px`.

- [x] **Step 4: Run RED**

Run: `npm test --workspace @mke/design-system`

Expected: FAIL because `src/tokens.css` does not exist.

- [x] **Step 5: Implement semantic token aliases**

Map project variables to HeroUI semantic tokens rather than numbered colors:

```css
:root {
  --mke-canvas: var(--background);
  --mke-panel: var(--surface);
  --mke-text: var(--foreground);
  --mke-muted: var(--muted);
  --mke-accent: var(--accent);
  --mke-focus: var(--focus);
  --mke-radius-panel: 1rem;
  --mke-touch-target: 44px;
}
```

Do not add a universal motion override. The live Sidebar and Sheet CSS already honors `prefers-reduced-motion`; any future project-owned motion must opt into the same preference without rewriting third-party component behavior.

- [x] **Step 6: Run GREEN and design-system checks**

Run:

```bash
npm test --workspace @mke/design-system
npm run typecheck --workspace @mke/design-system
```

Expected: token-contract test passes; no TypeScript errors.

- [x] **Step 7: Commit**

```bash
git add PRODUCT.md packages/design-system apps/web/package.json package.json package-lock.json
git commit -m "feat(design-system): establish HeroUI Pro foundation (MOO-750)"
```

---

### Task 7: Next.js App Router and Responsive Application Shell

**Files:**
- Create: `apps/web/next.config.ts`
- Create: `apps/web/next-env.d.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/api/health/database/route.ts`
- Create: `apps/web/components/application-shell/navigation.ts`
- Create: `apps/web/components/application-shell/application-shell.tsx`
- Create: `apps/web/components/application-shell/responsive-sidebar.tsx`
- Create: `apps/web/components/application-shell/application-shell.test.tsx`
- Create: `apps/web/app/api/health/database/route.test.ts`

**Interfaces:**
- Consumes: HeroUI/Pro, design tokens, `checkDatabaseHealth()`, shared health contract.
- Produces: a Server Component page and `ApplicationShell`, one client-only responsive Pro `Sidebar` boundary that owns its built-in mobile Sheet, and `GET /api/health/database`.

- [x] **Step 1: Load the Impeccable craft floor before UI edits**

Read `/Users/tarikmoody/.agents/skills/impeccable/reference/craft-floor.md` completely. Use Operate mode and the approved HeroUI Pro visual authority. Do not run a new visual-world tournament because the project explicitly pins HeroUI/Pro as the primary component system.

- [x] **Step 2: Write failing shell tests**

Testing Library must assert:

```ts
expect(screen.getByRole("link", {name: "Skip to map workspace"})).toHaveAttribute("href", "#map-workspace");
expect(screen.getByRole("navigation", {name: "Primary"})).toBeInTheDocument();
expect(screen.getAllByText("MKE Service Equity").length).toBeGreaterThan(0);
expect(screen.getAllByRole("main")).toHaveLength(1);
expect(screen.getByRole("main")).toHaveAttribute("id", "map-workspace");
```

The shell test also verifies the documented Tree/Menu semantics and that the current Atlas item has `href="/"`. A focused responsive test mocks `matchMedia` at `768px` and `769px`: the mobile case opens navigation through the button named `Open navigation`, verifies the visible mobile `Primary` navigation, closes it through the button named `Close navigation`, and verifies focus returns to `Open navigation`; the desktop case verifies the persistent Sidebar state and the component breakpoint contract. CSS visibility and computed width remain browser assertions in Task 9 rather than jsdom assumptions.

The route test mocks `checkDatabaseHealth()` and expects `GET()` to return status 200 with the exact parsed health contract. A second case expects status 503 for `{status: "error", database: "unreachable", postgisVersion: null}`.

- [x] **Step 3: Run RED**

Run:

```bash
npm test --workspace @mke/web -- application-shell.test.tsx route.test.ts
```

Expected: FAIL because the shell and route do not exist.

- [x] **Step 4: Configure Next.js and CSS imports**

`next.config.ts` transpiles `@mke/contracts`, `@mke/database`, and `@mke/design-system`. `globals.css` imports in this exact order:

The web build script uses Next's supported `--webpack` builder so PostCSS compilation does not depend on Turbopack's local worker-port capability in restricted development and verification environments. CI and Vercel run the same deterministic script.

```css
@import "tailwindcss";
@import "@heroui/styles";
@import "@heroui-pro/react/css";
@import "@mke/design-system/tokens.css";
@import "maplibre-gl/dist/maplibre-gl.css";
```

Add global focus-visible styles, full-height layout, and no horizontal overflow. Do not hide focus outlines.

- [x] **Step 5: Implement server-first shell structure**

Run `npm run typecheck --workspace @mke/web` once after the App Router files exist; its `next typegen` prefix deterministically creates `next-env.d.ts` and `.next/types` before `tsc`. Commit the generated `next-env.d.ts` so a clean checkout has Next's reference file, while every typecheck refreshes route types. `layout.tsx`, `page.tsx`, and `ApplicationShell` remain Server Components. `responsive-sidebar.tsx` is the only shell client boundary and imports `{Sidebar}` from `@heroui-pro/react`; Server Component content crosses that boundary only as `children`.

Use this exact live compound structure:

- `Sidebar.Provider` wraps the desktop `Sidebar`, `Sidebar.Mobile`, and `Sidebar.Main` siblings. Set `collapsible="offcanvas"` because the installed Pro beta disables `Sidebar.Trigger` entirely when `collapsible="none"`; with no desktop trigger or rail and `toggleShortcut={false}`, the desktop navigation remains persistently expanded while the built-in mobile trigger can still open its Sheet.
- Pass Next App Router's `router.push` to the Provider's documented `navigate` callback so activating the current Atlas item closes the mobile Sheet without a full document reload or MapLibre remount.
- The desktop `Sidebar` keeps the shipped 240px width, then uses `Sidebar.Header`, `Sidebar.Content`, `Sidebar.Group`, and a semantic `<nav aria-label="Primary">` around `Sidebar.Menu`.
- The single menu item is `Sidebar.MenuItem` with `id="atlas"`, `href="/"`, `isCurrent`, and `textValue="Atlas"`, containing `Sidebar.MenuLabel`. Do not add links for future Plans 4–6.
- `Sidebar.Mobile` uses `backdrop="blur"` and reuses the same navigation model/menu renderer. Its header includes `Sidebar.Trigger` named `Close navigation`. The component's documented `closeMobileOnAction` default closes the Sheet when Atlas is pressed; its built-in React Aria Sheet owns Escape dismissal and focus return.
- `Sidebar.Main` is the only `<main>` landmark and receives `id="map-workspace"` and `tabIndex={-1}`. Its top bar contains `Sidebar.Trigger` named `Open navigation`, with a 44px minimum target and a `min-[769px]:hidden` class so it is visible only at the component's documented mobile range.

Do not compose a separate `Sheet`, duplicate Sidebar state, create independent desktop/mobile navigation components, add `Sidebar.Rail`, or expose any desktop collapse control.

Responsive layout contract:

- 375/430: 56px top bar; the built-in `Sidebar.Mobile` Sheet is 80vw (shipped maximum 500px); content fills the remaining viewport.
- 768: 64px top bar; the documented `max-width: 768px` mobile behavior still applies and content remains one column.
- 1024/1440: the desktop Sidebar is persistently 240px and `Sidebar.Main` is flexible; the mobile Sheet renders nothing and no second desktop brand/header is introduced.
- The skip link enters `#map-workspace` at every width.

- [x] **Step 6: Implement the health route**

The route runs on the Node.js runtime, imports the database package only in server code, validates the returned object with `databaseHealthResponseSchema`, and maps `ok` to HTTP 200, `unconfigured` to 503, and `error` to 503. It never returns a URL, role, host, stack trace, or raw SQL error.

- [x] **Step 7: Run GREEN**

Run:

```bash
npm test --workspace @mke/web -- application-shell.test.tsx route.test.ts
npm run lint --workspace @mke/web
npm run typecheck --workspace @mke/web
```

Expected: shell and route tests pass; lint and TypeScript report zero errors.

- [x] **Step 8: Commit**

```bash
git add apps/web package.json package-lock.json
git commit -m "feat(web): add responsive application shell (MOO-750)"
```

---

### Task 8: MapLibre Base Map Shell

**Files:**
- Create: `apps/web/features/map/map-config.ts`
- Create: `apps/web/features/map/map-canvas.tsx`
- Create: `apps/web/features/map/map-shell.tsx`
- Create: `apps/web/features/map/map-canvas.test.tsx`
- Create: `apps/web/public/map-style.json`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_MAP_STYLE_URL` with `/map-style.json` fallback.
- Produces: `MapShell` server wrapper; `MapCanvas` client component that constructs one MapLibre map, adds navigation/attribution controls, resizes, and removes it on unmount.

- [x] **Step 1: Write the failing lifecycle test**

Mock only MapLibre's browser boundary. Assert that rendering creates exactly one map with the resolved style and container, that the shell exposes `role="region"` with `aria-label="Map workspace"`, and that unmount calls `map.remove()` exactly once.

- [x] **Step 2: Run RED**

Run: `npm test --workspace @mke/web -- map-canvas.test.tsx`

Expected: FAIL because `MapCanvas` does not exist.

- [x] **Step 3: Create a deterministic data-free style**

`public/map-style.json` contains MapLibre style version 8, no sources, and one neutral background layer. It contains no tract geometry, resource points, coordinates, classifications, or analytical values. The environment override is the production base-style hook and must retain its provider attribution.

- [x] **Step 4: Implement the isolated client lifecycle**

`map-canvas.tsx` begins with `"use client"`, owns a `ref`, creates the map inside `useEffect`, adds `NavigationControl` and visible `AttributionControl`, and returns `map.remove`. It does not import database, contracts, or analytical modules. The map shell renders the public-facing status `No published Food Equity data is available yet.`

- [x] **Step 5: Run GREEN**

Run:

```bash
npm test --workspace @mke/web -- map-canvas.test.tsx
npm run typecheck --workspace @mke/web
```

Expected: lifecycle test passes; TypeScript reports zero errors.

- [x] **Step 6: Commit**

```bash
git add apps/web/features/map apps/web/public/map-style.json apps/web/app/page.tsx
git commit -m "feat(map): isolate MapLibre shell lifecycle (MOO-750)"
```

---

### Task 9: Responsive, Browser, and Accessibility Verification Infrastructure

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/application-shell.spec.ts`
- Create: `tests/e2e/accessibility.spec.ts`
- Create: `scripts/verify-responsive.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: production-built `@mke/web` served at `http://127.0.0.1:3000`.
- Produces: five named Playwright projects and screenshot/overflow/accessibility evidence.

- [x] **Step 1: Configure the production browser runner and width guard**

Configure Playwright `webServer` to run `npm run start --workspace @mke/web`, reuse a matching local server only outside CI, collect traces on first retry, and reject browser console errors. Define projects named `width-375`, `width-430`, `width-768`, `width-1024`, and `width-1440` with viewport heights 812, 932, 1024, 900, and 1000 respectively. `scripts/verify-responsive.mjs` reads `playwright.config.ts` and exits nonzero unless all five exact project names occur once.

- [x] **Step 2: Write browser acceptance tests for all five widths**

The application-shell test asserts:

- `document.documentElement.scrollWidth <= window.innerWidth`;
- the skip link can receive focus and moves focus to the map workspace;
- 375/430/768 show the built-in `Sidebar.Trigger`, hide the persistent desktop Sidebar, and open the `Sidebar.Mobile` Sheet;
- 375/430/768 expose the current Atlas `Sidebar.MenuItem`, traverse its Tree/Menu semantics with the keyboard, close with Escape and the mobile `Sidebar.Trigger`, return focus to the opening trigger, close when Atlas is activated through the documented `closeMobileOnAction` default, and retain the same MapLibre canvas;
- the mobile Sheet computes to 80vw without exceeding its shipped 500px maximum;
- 1024/1440 show the persistent 240px primary Sidebar and no visible mobile trigger;
- `.maplibregl-canvas`, zoom controls, attribution, and the non-map status are visible;
- one screenshot is captured per project under `artifacts/plan-1/`.

The accessibility test runs axe against `/` with `wcag2a`, `wcag2aa`, `wcag21aa`, and `wcag22aa` tags and fails on every returned A/AA violation. It separately asserts one main landmark, named Primary navigation, 44px mobile trigger dimensions, a visible nonzero focus outline/ring, and—after `page.emulateMedia({reducedMotion: "reduce"})`—that the Sidebar and mobile Sheet open/close without effective motion (`none`, `0ms`, or an equivalent negligible duration) rather than requiring a universal authored-duration override.

- [x] **Step 3: Run the first browser acceptance pass**

Run:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

Expected: the suite executes all five named projects. Any behavior failure is evidence of an unmet shell requirement; fix all observed failures in one batch, then rerun in Step 4. If the first pass is already green, record it as cross-layer verification rather than claiming a new TDD red-green cycle. Feature behavior already followed red-green cycles in Tasks 7 and 8.

- [x] **Step 4: Run GREEN at all widths**

Run:

```bash
node scripts/verify-responsive.mjs
npm run test:e2e
```

Expected: 5 responsive shell cases and 5 accessibility cases pass; five PNG screenshots exist; no horizontal overflow, WCAG A/AA axe violation, WebGL lifecycle error, or hidden essential status is reported.

- [x] **Step 5: Run the bounded Impeccable inspection**

Inspect the 375 and 1440 screenshots together, batch-fix material responsive/design issues once, then run one confirmation screenshot round. Run the detector exactly once:

```bash
node /Users/tarikmoody/.agents/skills/impeccable/scripts/detect.mjs --json apps/web/app apps/web/components apps/web/features/map packages/design-system/src
```

Expected: mechanical findings are fixed; remaining judgment findings are recorded for the final design reviewer rather than triggering unbounded polish.

- [x] **Step 6: Commit**

```bash
git add package.json package-lock.json playwright.config.ts tests/e2e scripts/verify-responsive.mjs apps/web packages/design-system
git commit -m "test(web): verify responsive accessible shell (MOO-750)"
```

---

### Task 10: GitHub Actions, Vercel Preview, Documentation, and Final Evidence

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `apps/web/vercel.json`
- Create: `docs/development/setup.md`
- Create: `docs/deployment/vercel.md`
- Create: `docs/verification/plan-1-pr.md`
- Create: `docs/verification/plan-1-foundation-database.md`
- Modify: `README.md`
- Modify: `docs/architecture/repository.md`

**Interfaces:**
- Consumes: all Plan 1 packages, `HEROUI_AUTH_TOKEN`, optional isolated-development database secrets, and Vercel project access.
- Produces: deterministic CI, a Vercel preview URL, and the permanent verification record used to close MOO-750.

- [x] **Step 1: Write delivery configuration and operational documentation**

Create `.github/workflows/ci.yml` with the current action versions confirmed from official Context7 sources:

```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main
      - "tarikjmoody/**"

permissions:
  contents: read

jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - name: Install Node dependencies
        run: npm ci
        env:
          HEROUI_AUTH_TOKEN: ${{ secrets.HEROUI_AUTH_TOKEN }}
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e

  python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-python@v7
        with:
          python-version-file: .python-version
      - uses: astral-sh/setup-uv@20cfd1bf945f4377ade1205e4dbc17946fc9a30d # v10.0.1
      - run: uv sync --locked
      - run: uv run ruff check pipelines tests/data
      - run: uv run pytest tests/data -q
```

Do not add a database URL or run migrations in CI. `apps/web/vercel.json` contains only `{"$schema":"https://openapi.vercel.sh/vercel.json","framework":"nextjs"}`. The setup/deployment docs record exact local commands, Project Root Directory `apps/web`, Node 24, secret/public variable boundaries, isolated preview database rules, and that code deployment never publishes a score run. Update the repository tree document to match files that actually exist.

- [x] **Step 2: Commit delivery configuration before asking CI to run**

```bash
git add .github/workflows/ci.yml apps/web/vercel.json README.md docs/development docs/deployment docs/architecture/repository.md docs/verification/plan-1-pr.md
git commit -m "ci(plan-1): add foundation delivery gates (MOO-750)"
```

Expected: the workflow and Vercel/setup documentation are present in the commit that will be pushed and verified.

- [x] **Step 3: Run the full fresh local verification gate**

Run in this order:

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
if rg -n "DATABASE_URL|DATABASE_URL_UNPOOLED|postgresql://|@neondatabase/serverless|@mke/database" apps/web/.next/static; then exit 1; fi
git status --short
```

Expected: every command exits 0; all five widths pass; the production build completes; real isolated Neon/PostGIS integration passes; and client chunks contain no database environment names, PostgreSQL URLs, Neon driver, or database workspace import.

- [x] **Step 4: Run final code and design review before external verification**

Use the Superpowers final reviewer on the full branch and the Impeccable finish reviewer with the 375 and 1440 screenshots, original request, HeroUI Pro direction contract, detector findings, and craft-floor path. Address material findings in one bounded batch. Rerun every affected command from Step 3 and commit all source/test/documentation fixes:

```bash
git add apps packages pipelines tests scripts package.json package-lock.json pyproject.toml uv.lock docs
git commit -m "fix(plan-1): address final foundation review (MOO-750)"
```

If no files changed, do not create an empty commit. The reviewed SHA is the SHA pushed in Step 5.

- [ ] **Step 5: Push, open the review branch, and verify GitHub Actions**

```bash
git push -u origin tarikjmoody/moo-750-plan-1-foundation-database
gh pr create --base main --head tarikjmoody/moo-750-plan-1-foundation-database --title "Plan 1: Foundation + Database (MOO-750)" --body-file docs/verification/plan-1-pr.md
gh pr checks --watch
```

Expected: a PR exists; the pushed workflow runs on the branch/PR; both `web` and `python` jobs pass on the reviewed implementation SHA. `docs/verification/plan-1-pr.md` contains the issue intent, Plan 1 scope, exact verification commands, isolated-database safety statement, and explicit Plan 2 exclusion.

- [ ] **Step 6: Approve, link, and verify the Vercel preview target**

Run the read-only identity check first:

```bash
vercel whoami
```

Confirm the returned account/team and whether `mke-service-equity` is an existing approved project or a new project to create. Only after that explicit approval, run the local-link command and inspect encrypted variable names:

```bash
vercel link --cwd apps/web --project mke-service-equity --yes
vercel env ls --cwd apps/web
```

Expected: the authenticated account/team and linked `mke-service-equity` project are explicitly approved; Preview scope lists `HEROUI_AUTH_TOKEN`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `NEXT_PUBLIC_MAP_STYLE_URL` without printing values. If the account/team is ambiguous or a variable is absent, stop and configure it through Vercel's encrypted environment UI before deployment.

Create the preview:

```bash
vercel --cwd apps/web
```

Open the returned preview at 375 and 1440 widths and confirm shell/map rendering, keyboard focus, and no secret values in browser source/network responses. Record the commit SHA, CI run URL, preview URL, responsive screenshots, and Neon project/branch identifiers without credentials.

- [ ] **Step 7: Complete the verification evidence document**

Record dated command output summaries with pass/fail counts for:

- npm install/lint/typecheck/unit/build;
- Python lock/lint/tests;
- Drizzle migration and independent Neon PostGIS query;
- Playwright project names and screenshot paths for all five widths;
- axe WCAG A/AA violation count;
- GitHub Actions URLs;
- Vercel preview URL;
- Impeccable detector and final reviewer disposition;
- repository/license URL and commit list;
- unresolved issues, each with owner and impact.

Do not mark an item passed without fresh output or a real URL/query result.

- [ ] **Step 8: Self-review scope and documentation**

Run:

```bash
rg -n "Supabase|Convex|auth|OpenAI|Anthropic|score|food_priority|CREATE TABLE|INSERT INTO" apps packages pipelines .github --glob '!**/*.test.*'
git diff --check
git diff --stat main...HEAD
git log --oneline main..HEAD
```

Expected: no prohibited dependency/feature or domain migration is present; allowed prose references are inspected rather than blindly accepted; diff check is clean; commits are independently understandable.

- [ ] **Step 9: Commit evidence, push, and verify the final documentation SHA**

```bash
git add docs/verification/plan-1-foundation-database.md
git commit -m "docs(plan-1): record foundation verification (MOO-750)"
git push
gh pr checks --watch
```

Expected: the evidence file records the verified implementation SHA and external URLs; the final evidence commit also receives passing GitHub Actions checks. Record that final run URL in Linear because writing it back into the same file would create an endless evidence-commit cycle.

- [ ] **Step 10: Close Linear with proof and stop**

Post a MOO-750 comment containing the final commit range, CI URL, Vercel preview URL, Neon development branch identifier, migration/PostGIS evidence, test counts, five responsive widths, accessibility result, reviewer disposition, and unresolved issues. Move MOO-750 to Done only if every acceptance and verification item passes. Do not start MOO-751 or Plan 2.

---

## Final Verification Checklist

- [ ] Local Git repository and GitHub remote exist; MIT license boundary is explicit.
- [ ] MOO-750 is the only implementation issue in progress.
- [ ] npm workspace graph resolves without an additional orchestrator.
- [ ] Next.js App Router application runs and production build exits 0.
- [ ] HeroUI v3 and licensed HeroUI Pro artifacts install locally and in CI/Vercel.
- [ ] Project semantic design tokens and reduced-motion behavior are active.
- [ ] Responsive shell passes at 375, 430, 768, 1024, and 1440.
- [ ] MapLibre creates a canvas, controls, attribution, accessible status, and removes its WebGL lifecycle cleanly.
- [ ] Browser/client bundles contain no Neon credentials or database package imports.
- [ ] Isolated Neon development target is identified and distinct from production.
- [ ] Drizzle applies the PostGIS-only migration and independent SQL returns a PostGIS version.
- [ ] No domain tables, source data, analytical GIS, scoring, or fake values were added.
- [ ] Python 3.13 uv workspace imports, lints, and tests successfully.
- [ ] Unit, integration, end-to-end, responsive, accessibility, lint, typecheck, and build gates pass.
- [ ] GitHub Actions web and Python jobs pass on the branch.
- [ ] Vercel preview renders the shell at mobile and desktop widths.
- [ ] README, setup, environment, database, deployment, repository, and verification documentation match reality.
- [ ] Linear evidence comment is posted and MOO-750 is Done only after proof.
- [ ] Work stops before MOO-751 / Plan 2.

## Plan Self-Review Record

- **Spec coverage:** All MOO-750 scope items map to Tasks 1–10; Plans 2–6 are explicitly excluded.
- **Database scope:** Only PostGIS and migration metadata are created. Domain schema decisions remain governed by `docs/data/schema.md` and later plans.
- **Responsive coverage:** The exact five required widths appear in shell behavior, Playwright projects, screenshots, CI, and the final evidence checklist.
- **Interface consistency:** Contracts, database health, shell, MapLibre, and Python names are identical in producing and consuming tasks.
- **HeroUI live-interface review:** Root imports, compound Sidebar structure, built-in mobile Sheet, exact `768px` breakpoint, shipped widths, Tree/Menu navigation semantics, focus/close behavior, semantic tokens, reduced-motion CSS, installation flow, and the single client boundary were confirmed through the live MCP and incorporated into Tasks 6–9.
- **No-placeholder scan:** Credential, development-branch, visibility, deployment-account, and licensed-asset decisions are explicit execution gates. No unresolved HeroUI component name, import, compound API, breakpoint, or client-boundary placeholder remains.
- **Commit cadence:** Ten reviewable checkpoints separate repository, workspace, contracts, database, Python, design system, shell, map, browser QA, and delivery evidence.
