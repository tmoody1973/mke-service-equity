# System Architecture

## Architecture

```text
PUBLIC DATA SOURCES
        ↓
PYTHON DATA PIPELINE
Extract → Validate → Normalize
        ↓
RAW SNAPSHOTS
        ↓
NEON POSTGRES + POSTGIS
        ↓
Spatial Engine / Score Engine / Provenance
        ↓
DRIZZLE + SQL
        ↓
NEXT.JS SERVER LAYER
        ↓
RESPONSIVE WEB APP
HeroUI Pro + MapLibre
```

## Responsibility boundaries

### Python
Owns:

- data acquisition
- cleaning
- normalization
- data validation
- geospatial preprocessing
- percentile calculations
- score runs
- accessibility preprocessing

### PostgreSQL/PostGIS
Owns:

- persistent storage
- geometry
- containment
- intersection
- nearest-neighbor queries
- spatial aggregation
- analytical SQL
- publication state

### TypeScript / Next.js
Owns:

- application
- route handlers
- server components
- data-access layer
- UI contracts
- presentation
- interactive state

### MapLibre
Owns:

- tract rendering
- resource rendering
- layer visualization
- selection/highlighting
- map interactions

MapLibre does not own official GIS analysis or scoring.

## Server-first rule

Use Server Components by default.
Use Client Components only where browser interaction requires them.

## Browser rule

The browser visualizes evidence. It does not reproduce the analytical engine.

## Deployment

Code:
GitHub → PR → Vercel Preview → main → Production

Data:
GitHub Actions/manual run → Python ETL → validation → staging → QA → publish score run

These are separate release processes.
