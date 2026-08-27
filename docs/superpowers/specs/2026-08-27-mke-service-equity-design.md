# MKE Service Equity — Approved Design Specification

## Status
Approved for implementation planning.

## Summary

MKE Service Equity is a responsive civic decision-support platform. The architecture is broad enough for multiple service-equity modules, but the first production MVP is the complete MKE Food Equity Atlas.

## Approved decisions

- Primary users: Milwaukee public-sector decision-makers; public/community secondary.
- Geography: Milwaukee County coverage, City of Milwaukee analytical focus.
- Canonical unit: 2020 Census tract.
- Scoring: percentile-based, transparent subindex model.
- Baseline: Demographic/Structural + Socioeconomic + Health.
- Food: separate Food Access Need plus Equity Baseline → Food Equity Priority.
- Database: Neon PostgreSQL + PostGIS.
- ORM/data access: Drizzle + SQL.
- ETL/scoring: Python + Pandas + GeoPandas.
- Frontend: Next.js App Router + TypeScript.
- UI: HeroUI Pro + project design system.
- Map: MapLibre GL JS.
- Responsive: mandatory at 375/430/768/1024/1440.
- Accessibility: WCAG 2.2 AA target.
- Design: Impeccable Design review for substantial user-facing work when available.
- Authentication: none in MVP.
- AI: prohibited from official scoring and recommendations.
- Deployment: Vercel; data workflows separated from code deployment.
- Tracking: Linear project with six implementation tracks and three protected human gates.

## Core workflows

1. Explore Food Equity Priority.
2. Select/search a tract.
3. Understand drivers and provenance.
4. Compare 2–5 areas.
5. Investigate matching conditions in Opportunity Explorer.
6. Export/share evidence.

## Governance

Every published score is tied to source vintages, methodology version, score-run ID, and quality status.

The browser does not calculate official scores.

## Verification gates

### Gate 1 — Data + Methodology
Approve the Equity Baseline before Food Priority scoring proceeds.

### Gate 2 — Product Experience
Approve Atlas + Tract Profile on desktop/mobile before advanced analysis proceeds.

### Gate 3 — Release Readiness
Approve data, functionality, responsive, accessibility, design, and technical QA before release.
