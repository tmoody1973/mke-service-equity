# Equity Baseline Methodology

**Current approved version:** v1, approved 2026-08-27 for MOO-751

## Purpose

The Equity Baseline represents underlying demographic/structural, socioeconomic, and health conditions separately from service-specific need.

It does not claim that race, immigration status, or neighborhood identity is inherently a disadvantage. The baseline is intended to identify populations and places historically affected by unequal access to public resources and institutions.

## Canonical unit

2020 Census tract, keyed by GEOID.

## Subindices

### 1. Demographic / Structural
Approved indicators:

- residents who are people of color
- population age 5+ who speaks English less than “very well” (ACS estimate)
- foreign-born population

### 2. Socioeconomic
Approved indicators:

- population below 200% of the federal poverty level
- unemployment
- educational attainment
- housing cost burden

Vehicle availability is excluded from the core baseline and handled in service modules where relevant.

### 3. Health
Approved CDC PLACES crude-prevalence indicators:

- diabetes
- obesity
- asthma
- disability
- frequent mental distress
- no leisure-time physical activity

Life expectancy is deferred from v1 because it requires a separate source and vintage.

## Approved sources and vintages

- geography: 2020 Census TIGER/Line tracts
- demographic and socioeconomic indicators: 2024 ACS 5-Year Detailed Tables
- health indicators: CDC PLACES December 2025 release, using 2023 BRFSS-based crude prevalence

Each indicator retains its own source vintage.

## Scoring approach

1. Require a positive-population tract and all 13 valid indicator values.
2. Normalize direction so higher values consistently represent greater measured equity burden.
3. Convert each indicator to its Milwaukee County percentile using average ranks for ties.
4. Average indicators within each subindex.
5. Average the three equally weighted subindices.
6. Convert the composite score to a county percentile using the same tie rule.
7. Assign fixed five-band boundaries at 20, 40, 60, and 80.

Conceptually:

`Equity Baseline = 1/3 Demographic/Structural + 1/3 Socioeconomic + 1/3 Health`

Indicators are equally weighted within their subindex. For `N > 1`, percentile rank is
`100 * (average_rank - 1) / (N - 1)`; for `N = 1`, it is 50. Ties remain together and may
produce unequal band populations.

Bands are Very Low (`0–<20`), Low (`20–<40`), Moderate (`40–<60`), High (`60–<80`), and
Very High (`80–100`).

## Explainability

Every displayed result must expose:

- raw value
- county percentile
- indicator definition
- source
- vintage
- subindex contribution
- methodology version
- quality status

### Interpreting centered contributions

Review reports may show a tract's strongest **centered contributions** to help explain its
composite score. For each indicator, the diagnostic is:

`(indicator county percentile - 50) × approved effective weight`

The result is expressed in **composite-score points relative to the county midpoint**. For
example, `People of color share: +4.8 composite points vs county midpoint` means that this
indicator adds 4.8 points more to the tract's composite score than it would at indicator
percentile 50. A negative value means a lower contribution relative to that midpoint.

These values are not the indicator's raw percentage, percentage-point change, margin of error,
causal effect, or policy recommendation. They are an explanation of the already-approved score,
not an additional scoring formula. The approved effective weight combines the indicator's equal
weight within its subindex with that subindex's one-third weight in the composite.

The registry slug `limited_english_proficiency` refers specifically to the ACS C16001 estimate
for people age 5 and older who speak a language other than English at home and report speaking
English less than “very well.” Reader-facing explanations use that Census wording because the
measure does not assess literacy.

## Missing data

Never substitute missing with zero.

All 13 indicators are required. A positive-population tract with any unusable indicator is
`insufficient_data`; weights are not redistributed. A zero-population tract is
`ineligible_zero_population`.

ACS margins of error and reliability states, plus PLACES confidence limits, remain attached to
the values. High uncertainty is surfaced but does not independently exclude a valid estimate.

## Versioning

Every published result belongs to:

- a methodology version
- a score-run ID
- explicit source vintages

Methodology changes create a new version; they do not redefine old versions.

The complete approved formulas, source mappings, quality rules, and implementation design are
specified in
[`2026-08-27-moo-751-equity-baseline-design.md`](../superpowers/specs/2026-08-27-moo-751-equity-baseline-design.md).
