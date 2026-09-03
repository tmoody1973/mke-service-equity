# Plan 6B — CSV export and final product QA

- Work branch: `codex/moo-769-csv-export-final-qa`
- Scope: public CSV contract, guarded Data page, and offline product QA
- Production publication, production mutation, and external deployment: **not performed**
- Disposable live reconciliation: completed on a synthetic fixture only; the Neon branch expires automatically
  on 2026-09-10T08:57:50Z.

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
| Python data tests | 590 passed; 12 integration tests deselected by the repository default |
| Project lint and workspace typechecks | passed |
| Production web build and client-bundle scan | passed; 37 client assets scanned with no analysis secret or server-only code |
| Data-page responsive check | 5 passed at 375, 430, 768, 1024, and 1440 px |
| Final public-route/browser and accessibility checks | 15 passed at those five widths |
| Complete browser suite | 30 passed and 30 intentionally skipped because no private preview or live fixture was configured |

The final browser checks cover Atlas, selected-tract URL handling, Compare Areas, Opportunity
Explorer, and Download data. They verify a visible main region and page title, horizontal-overflow
protection, browser-error absence, and safe behavior when no public release is configured. The
Data page additionally passes an axe scan without relying on map content.

## Approved disposable live proof — completed 2026-09-03

The user approved a disposable Neon verification branch named `moo-769-csv-export-qa`, created
from the `production` parent without changing that parent. Its branch ID is
`br-fragrant-brook-a567toq0`; it will expire after seven days. Existing repository migrations
were applied to the empty disposable child only.

The fixture was explicitly synthetic: 302 canonical tract-shaped records, one synthetic source
snapshot, one synthetic resource version, 13 synthetic Equity indicators per tract, four synthetic
Food metrics per tract, and one synthetic neighborhood context per tract. It contains no real
people, addresses, resources, neighborhood boundaries, source records, or analytical results.
The application lifecycle guards required each test run to be created as `draft` and then moved to
`validated`; no guard was bypassed. The controlled publication command then completed a dry run
and published that fixture only on the disposable branch.

| Live check | Result |
|---|---|
| Controlled publication ID | `b009cfe0-f049-4ec9-9041-7b8a35afa932` |
| Dry-run hash | `5819a77d96356320f602b4d4e6819d39e59d9fa4133b6b86a5ee01135778f59a` |
| Publication bundle fingerprint | `0eab2b8b65e7875e35816a93680481cf539516e250587e4f0fb20018a7ecde3a` |
| Governed membership reconciliation | 302 score pairs; 3,926 Equity components; 1,208 Food components; 1 valid source snapshot; 1 resource version |
| Direct server export | 302 rows, 13 Equity indicators and 4 Food metrics per row; all neighborhood contexts available |
| Actual HTTP download route | Two `200 OK` downloads, `private, no-store` and CSV attachment headers |
| Stable download bytes | both 1,144,656 bytes; SHA-256 `287c7f06cb741a861f3f41f96ef8430570b57102c100d1c686d7662451b69e48` |

The temporary local web server was stopped after the route check. The synthetic publication and
fixture will be removed with the disposable Neon branch at expiry; no production record or
deployment was changed.

## Remaining limits

The checks above prove the governed flow and public route on production-shaped PostgreSQL schema
with synthetic data. They do not validate the truth, freshness, licensing, or policy suitability of
any real public dataset. A real public release still requires its own approved validated runs,
source/provenance review, and controlled publication decision.
