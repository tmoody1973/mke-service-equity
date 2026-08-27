# Data Quality

## Allowed statuses

- verified
- provisional
- stale
- missing
- suppressed
- conflicting

## Principles

- Missing is never zero.
- Unknown values remain unknown.
- Source disagreements are surfaced.
- Stale service information must not be presented as current without a warning.
- Operating hours are never invented.

## Conflict rules

- Government geography: official Census/City/County source wins.
- PLACES-defined health measures: CDC PLACES wins.
- Store status: newest authoritative federal/local verification wins.
- Pantry hours: operator/partner verification wins.
- Unresolved disagreement: mark conflicting.

## User-facing behavior

Examples:

**Insufficient data**

or:

**Pantry hours: Provisional — last verified 94 days ago**

Quality states are part of the product UI.
