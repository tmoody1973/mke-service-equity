# Equity Baseline Methodology

## Purpose

The Equity Baseline represents underlying demographic/structural, socioeconomic, and health conditions separately from service-specific need.

It does not claim that race, immigration status, or neighborhood identity is inherently a disadvantage. The baseline is intended to identify populations and places historically affected by unequal access to public resources and institutions.

## Canonical unit

2020 Census tract, keyed by GEOID.

## Subindices

### 1. Demographic / Structural
Candidate indicators:

- residents who are people of color
- limited English proficiency
- foreign-born population

### 2. Socioeconomic
Candidate indicators:

- population below 200% of the federal poverty level
- unemployment
- educational attainment
- housing cost burden

Vehicle availability is excluded from the core baseline and handled in service modules where relevant.

### 3. Health
Candidate indicators:

- diabetes
- obesity
- asthma
- disability
- poor mental health
- physical inactivity
- life expectancy where methodologically appropriate

## Scoring approach

1. Validate each raw measure.
2. Normalize indicator direction so higher percentile consistently represents greater measured vulnerability.
3. Convert each tract indicator to its Milwaukee County percentile.
4. Combine indicators within each subindex.
5. Combine the three subindices with equal weight unless an approved methodology version says otherwise.
6. Convert the result to a county percentile.
7. Assign a five-band classification.

Conceptually:

`Equity Baseline = 1/3 Demographic/Structural + 1/3 Socioeconomic + 1/3 Health`

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

## Missing data

Never substitute missing with zero.

If sufficient input data are unavailable, the score must be marked insufficient rather than fabricated.

## Versioning

Every published result belongs to:

- a methodology version
- a score-run ID
- explicit source vintages

Methodology changes create a new version; they do not redefine old versions.
