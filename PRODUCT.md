# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS, HeroUI, licensed HeroUI Pro, MapLibre GL JS, Neon Postgres with PostGIS, Drizzle ORM, and Python with uv. Analytical GIS belongs in PostGIS and Python; the browser owns visualization and interaction.

## Users

Primary users are Milwaukee public-sector decision-makers, planners, analysts, and policy staff deciding where public resources and services should be examined or improved. Secondary users include community organizations, advocates, journalists, researchers, and residents who need to inspect the public evidence behind those decisions.

## Product Purpose

MKE Service Equity is a public evidence platform for understanding whether essential services are distributed equitably across Milwaukee. The MVP is a Food Equity Atlas that helps users compare service availability with documented community need while preserving the provenance, uncertainty, and publication state of every metric.

## Positioning

The product is evidence before recommendation. It exposes deterministic source data, methods, and uncertainty so people can inspect an equity condition without receiving an automated policy prescription, opaque ranking, or AI-generated conclusion.

## Operating Context

Users examine a responsive public map and supporting context during planning, budgeting, policy analysis, public meetings, reporting, research, and community advocacy. The same core evidence must remain usable on mobile, tablet, and desktop displays.

## Capabilities and Constraints

- Plan 1 establishes the technical foundation and a data-free application shell; later reviewed plans add source ingestion, geography, and Food Equity calculations.
- The public application reads only explicitly `published` score runs. A code deployment never publishes analytical results.
- Every published metric must preserve source provenance and surface uncertainty or data-quality states.
- Calculations are deterministic. No LLM participates in analysis, scoring, priority classification, or policy recommendations.
- MapLibre is limited to geographic visualization and interaction. PostGIS and Python own analytical spatial work.
- The MVP does not include authentication, AI chat, saved workspaces, predictive models, or fabricated placeholder data.

## Evidence on Hand

Approved product, methodology, architecture, data, accessibility, and responsive specifications are maintained under `docs/`. No source dataset, analytical result, testimonial, performance claim, logo, photography, illustration, or other brand imagery is approved for Plan 1; future work must not fabricate them.

## Product Principles

- Publish traceable evidence, never unexplained conclusions.
- Keep analysis deterministic and separate from presentation.
- Make uncertainty and missing data visible rather than treating absence as zero.
- Serve public-sector and community scrutiny with the same accessible interface.
- Add domain behavior only through reviewed plans with tests and documentation.

## Accessibility & Inclusion

The target is WCAG 2.2 AA. User-facing work is reviewed at 375, 430, 768, 1024, and 1440 pixels, supports keyboard and assistive-technology use, preserves visible focus, meets a 44-pixel touch target, and avoids desktop-only behavior.
