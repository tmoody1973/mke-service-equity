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

## Analyze request flow

```text
SHAREABLE URL
        ↓
STRICT REQUEST PARSER
        ↓
EXACT ATLAS RUN SELECTOR
        ↓
PARAMETERIZED COMPARE / OPPORTUNITY SQL
        ↓
STRICT BROWSER-SAFE RESPONSE CONTRACT
        ↓
SERVER COMPONENT + RESPONSIVE CLIENT INTERACTIONS
        ↓
MAPLIBRE VISUAL MIRROR + COMPLETE NON-MAP EVIDENCE
```

`/analyze/compare` accepts two to five unique repeated `tract` parameters and preserves their
selection order for presentation. `/analyze/opportunity` accepts only the supported normalized
applied-filter parameters. PostgreSQL applies OR within a filter category, AND across categories,
inclusive numeric thresholds, the missing-filter tri-state rule, and canonical tract ordering.

The Compare repository joins canonical geography to the exact Food run, its pinned Equity run,
score components, indicator evidence, uncertainty, and source lineage. The separate authoritative
search boundary supplies tract and neighborhood matches. The repository fails the whole response
when a requested tract or required join is invalid; it never constructs a partial comparison.
Opportunity returns concise tract summaries without geometry. The already bounded Atlas GeoJSON
supplies shapes, and MapLibre highlights only the server-returned GEOIDs.

Complete five-tract Compare responses are capped at 500 KB uncompressed. Geometry-free
Opportunity responses are capped at 150 KB, while shared Atlas GeoJSON remains capped at 1.1 MB.

## Server-first rule

Use Server Components by default.
Use Client Components only where browser interaction requires them.

## Browser rule

The browser visualizes evidence. It does not reproduce the analytical engine.

The Atlas sends a bounded tract map payload first. When a person selects a tract, a server route
loads the exact Food and Equity inputs, uncertainty, limitations, and source lineage for that same
run and geography. If those joins cannot be proven, the route returns an explicit unavailable
state instead of partial or inferred evidence.

Compare's deterministic Differences helper consumes only the validated response and uses fixed
rules; it does not query new data or use an LLM. Opportunity filtering and missing-data counts are
computed by parameterized server SQL. Pending form edits, sheet state, accordions, and hover remain
browser presentation state and do not become analytical authority.

Contextual food sites, public land, and public investment do not participate in Opportunity
filtering. No Analyze route recalculates a score, performs browser GIS, ranks tracts, recommends an
intervention, or changes a score run.

## Run selection and caching

Public mode may select only the zero-or-one internally consistent governed Food Equity
publication and its pinned Equity Baseline run. If no current publication exists, Analyze returns
`no_published_run` and shows no validated data. Local validated preview is allowed only with the
explicit development-only server configuration, remains visibly marked, and cannot run in
production.

Validated-preview responses are dynamic and excluded from shared public caches. A published
cache may key only on immutable publication identity plus normalized request identity.
A deployment never publishes, supersedes, or mutates analytical data.

## Deployment

Code:
GitHub → PR → Vercel Preview → main → Production

Data:
GitHub Actions/manual run → Python ETL → validation → staging → QA → publish score run

These are separate release processes.
