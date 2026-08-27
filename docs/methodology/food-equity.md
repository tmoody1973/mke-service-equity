# Food Equity Methodology

## Purpose

Food Equity Priority identifies where high underlying equity vulnerability and food-access need overlap.

The Food module remains analytically separate from the Equity Baseline.

## Food Access Need dimensions

### Retail Access

Separate:

1. SNAP-authorized retail access
2. Full-service grocery access

A SNAP-authorized retailer is not automatically a full-service grocery.

Suggested retail classifications:

- supermarket
- supercenter
- large grocery
- small grocery
- specialty grocery
- convenience
- farmers market
- other food retail

`full_service_grocery` is an explicit classification, never inferred ad hoc from a store name.

### Transportation Constraint

Candidate measures:

- households without vehicles
- walking access
- nearby transit availability
- service frequency
- transit travel time in a later phase if reliable routing is available

### Emergency Food Availability

Candidate resources:

- food pantries
- meal programs
- mobile food resources
- other trusted emergency food programs

Count and operating availability should remain separate when reliable hours exist.

### Economic Constraint

Use selected household economic measures while documenting overlap with the Equity Baseline and avoiding accidental double-weighting.

## Food Equity Priority

Combine:

- Equity Baseline
- Food Access Need

into a transparent priority matrix.

The matrix must be documented and deterministic.

Example principle:

- Very High Equity + Very High Food Need → Priority 1
- Very High Equity + High Food Need → Priority 1
- High Equity + Very High Food Need → Priority 1
- High Equity + High Food Need → Priority 2

Exact boundaries are controlled by the approved methodology version.

## Need and service response

Public investment and existing service response do not directly increase or decrease the Food Equity Priority score.

Need determines priority.
Investment and services show response.

## AI restriction

No LLM may calculate, infer, modify, or override an official score.

AI may later explain verified values, but the evidence remains deterministic.
