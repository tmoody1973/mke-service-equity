# AGENTS.md — MKE Service Equity

These rules are authoritative for agentic development.

## Read before coding

Before implementing a task, read:

1. `README.md`
2. `docs/product/prd.md`
3. `docs/architecture/system.md`
4. Relevant methodology/data/UX specification
5. Current implementation plan
6. The corresponding Linear issue

## Hard guardrails

### Do not

- Alter scoring methodology without updating methodology documentation and tests.
- Introduce an LLM into analytical calculations, equity scoring, priority classification, or policy recommendations.
- Silently replace missing data with zero.
- Invent source data, operating hours, coordinates, classifications, or provenance.
- Scrape a source when an approved structured API/feed/export exists.
- Create undocumented ranking formulas.
- Treat public investment as an input that changes Food Equity Priority.
- Perform analytical GIS calculations in the browser when PostGIS/Python owns the calculation.
- Add desktop-only features.
- Add authentication, AI chat, saved workspaces, predictive models, or other out-of-scope MVP features.
- Mutate production data during development.
- Bypass HeroUI with unnecessary custom primitives.
- Mark a user-facing feature complete without responsive and accessibility review.

### Do

- Preserve provenance for every published metric.
- Use deterministic calculations.
- Use PostGIS for spatial relationships and analytical geography.
- Use Python for ingestion, validation, normalization, and scoring.
- Use TypeScript for the application, API, presentation, and database access layer.
- Use HeroUI Pro components where appropriate.
- Use MapLibre strictly for geographic visualization and interaction.
- Use the Impeccable Design skill for substantial user-facing work when available.
- Test at 375, 430, 768, 1024, and 1440 px.
- Surface uncertainty and data-quality states.
- Keep files small and focused.
- Update documentation when behavior, methodology, or data contracts change.
- Write tests first for analytical and spatial logic.
- Commit frequently in independently understandable changes.

## Published-data rule

A web deployment does not publish a new score run.

Score runs use:

- `draft`
- `validated`
- `published`
- `superseded`
- `failed`

The public application reads only a `published` run.

## Definition of done

A feature is complete only when:

- functionality passes
- data states are handled
- errors are handled
- tests pass
- mobile passes
- desktop passes
- accessibility has been checked
- design has been reviewed
- documentation is updated
