# Plan 6B — CSV export and final product QA

- Work branch: `codex/moo-769-csv-export-final-qa`
- Scope: public CSV contract, guarded Data page, and offline product QA
- Production publication, production mutation, external deployment, and live fixture: **not performed**
- Live reconciliation: pending a separately approved disposable Neon branch and controlled fixture

## What the public download does

`/data` describes the complete public tract file before offering a download. The CSV endpoint
reads only the current governed publication. The fixed export contract requires 302 ascending
canonical GEOIDs, 13 Equity indicators, four Food metrics, score quality/exclusions, uncertainty,
source versions, and publication/run hashes. The release's City neighborhood snapshot is used only
when it is explicitly pinned and publicly permitted; otherwise the context stays unavailable.

The serializer uses a fixed column registry, UTF-8, CRLF records, stable JSON cells, and
spreadsheet-formula neutralization. Missing values remain explicit through their state and quality
columns. No response exposes a database URL, a private preview, SQL, a stack trace, geometry,
coordinates, resource-level records, public investment, or partial rows.

## Offline verification completed

| Check | Result |
|---|---|
| Contract tests | 98 passed |
| Database tests | 198 passed |
| Web tests | 194 passed |
| Project lint and workspace typechecks | passed |
| Production web build and client-bundle scan | passed; 37 client assets scanned with no analysis secret or server-only code |
| Data-page responsive check | 5 passed at 375, 430, 768, 1024, and 1440 px |
| Final public-route/browser and accessibility checks | 15 passed at those five widths |

The final browser checks cover Atlas, selected-tract URL handling, Compare Areas, Opportunity
Explorer, and Download data. They verify a visible main region and page title, horizontal-overflow
protection, browser-error absence, and safe behavior when no public release is configured. The
Data page additionally passes an axe scan without relying on map content.

## Known limits and next proof

The offline suite proves contracts, server boundaries, serialization, and presentation using
controlled test doubles. It does not prove a live CSV byte hash, response timing, or publication
membership against production-shaped PostgreSQL data. Task 8 remains a stop gate: before that
proof, an explicit approval must name the disposable Neon branch, its parent and expiry, controlled
fixture, exact commands, expected reconciliation counts, and cleanup. This work did not publish,
supersede, or otherwise mutate authoritative data.
