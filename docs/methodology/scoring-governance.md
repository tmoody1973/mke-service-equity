# Scoring Governance

## Score run states

- draft
- validated
- published
- superseded
- failed

The public application reads only published runs.

Pipelines may move a run only from `draft` to `validated` or `failed`. The governed publication
transaction alone may move an exact reviewed pair from `validated` to `published`, then from
`published` to `superseded`. It rejects backward transitions and re-publication. Withdrawal
supersedes the current release and leaves zero current; recovery is a new forward release.

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

Publication also requires exact score/component/source/resource membership, output hashes,
redistribution decisions, expected-current comparison, approval evidence, an idempotency key,
and a matching dry-run hash. Released analytical content and publication/audit history are
immutable.

## Regression protection

Maintain golden test tracts with expected:

- subindex percentiles
- Equity Baseline
- Food Access Need
- Food Equity Priority

Unexpected changes fail CI and require review.
