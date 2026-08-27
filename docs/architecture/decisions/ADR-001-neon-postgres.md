# ADR-001 — Neon PostgreSQL

## Decision
Use Neon PostgreSQL as the primary application and analytical database.

## Why
The product is GIS-heavy and requires PostGIS, spatial SQL, analytical joins, Python/GeoPandas compatibility, and database branching.

## Alternative
Convex was considered but is not the preferred fit for native PostGIS/spatial SQL workloads.

## Consequence
PostgreSQL is the analytical authority; application code should not reproduce spatial logic unnecessarily.
