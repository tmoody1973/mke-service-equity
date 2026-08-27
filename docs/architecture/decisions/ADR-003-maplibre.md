# ADR-003 — MapLibre GL JS

## Decision
Use MapLibre GL JS for interactive mapping.

## Why
Open, TypeScript-friendly, vector-map capable, and separable from the analytical engine.

## Consequence
Design the source contract so GeoJSON can later be replaced with vector tiles without redesigning the application.
