# Scoring Governance

## Score run states

- draft
- validated
- published
- superseded
- failed

The public application reads only published runs.

## Required run metadata

- score_run_id
- methodology_version
- started_at
- completed_at
- source vintages
- git commit
- validation result
- publication status

## Publication workflow

1. ingest
2. validate
3. normalize
4. calculate
5. generate QA report
6. human review when required
7. publish

A website deployment does not publish a new score run.

## Regression protection

Maintain golden test tracts with expected:

- subindex percentiles
- Equity Baseline
- Food Access Need
- Food Equity Priority

Unexpected changes fail CI and require review.
