# Governed Atlas publication runbook

This runbook covers the server-only MKE Food Equity Atlas publication command added by
`MOO-768`. Publication is a data release, not a website deployment. The command promotes one
fully validated Food Equity run together with its exact pinned Equity Baseline, scores,
components, source snapshots, resource versions, licensing decisions, and audit evidence.

No step in this document authorizes a production release. Production requires a separately
approved Gate 3 decision naming the exact candidate, dry-run hash, and approval ID.

## Roles and non-negotiable rules

- The migration owner applies reviewed migrations only.
- The pipeline writer may create and validate analytical runs but cannot publish.
- The publication operator may execute the controlled functions and required reads but receives
  no general analytical-table update or delete permission.
- The application reader may read the current immutable bundle but cannot publish or mutate.
- Production uses separate application-reader and publication-operator credentials.
- Never hand-edit a run status, publication row, current pointer, member row, hash, or audit row.
- Never treat a Vercel deployment, database migration, or validated preview as publication.
- Never publish a source or resource marked `prohibited_public_use`.
- Never put a connection string, password, API key, or token in a request, manifest, report,
  terminal transcript, issue, pull request, or support message.

## Required inputs

An authorized operator prepares two reviewed local JSON files:

1. A canonical publication manifest containing the exact run identities and all score,
   component, source-snapshot, and resource-version members.
2. A request containing the environment, candidate Food run, expected current publication (or
   `null`), approval ID, new idempotency key, exact confirmation value, actor, reason, and
   `gate3ApprovalId` (`null` in development).

The dry-run request must not contain `dryRunHash`. The later publish or withdraw request contains
the exact hash produced by the matching dry run. Keep approval evidence outside the repository;
only the non-secret approval identifier belongs in the request/report.

The server-only environment must provide:

```text
DATABASE_URL_UNPOOLED
MKE_PIPELINE_ENV
MKE_PUBLICATION_ENV
MKE_PUBLICATION_EXPECTED_HOST
MKE_PUBLICATION_GIT_COMMIT
```

For production only, it must also provide `MKE_PUBLICATION_GATE3_APPROVAL_ID`, equal to the
separately approved Gate 3 ID in the request. Both environment variables must equal the request
environment. The expected host must exactly equal the database URL host. Do not print these
values while checking them.

## Dry run

Dry run is mandatory and read-only. It checks the expected current release, candidate/baseline
status and hashes, exact lineage and membership, redistribution decisions, database host,
environment, and Git commit.

```bash
npm run publication --workspace @mke/database -- dry-run \
  --request <reviewed-dry-run-request.json> \
  --manifest <reviewed-manifest.json>
```

For withdrawal, omit `--manifest`. Stop if the command fails, the database host/environment is
not the approved target, the current publication differs from the request, any member is missing
or duplicated, a hash differs, or any licensing decision is unresolved/prohibited. Do not edit
evidence until the command passes; correct the upstream request, manifest, approval, or data.

Review the generated secret-free report under ignored `data/reports/publication/`. Confirm the
candidate, expected current publication, bundle fingerprint, member counts, approval ID, actor,
reason, Git commit, and `dryRunHash`. Have the required reviewer approve this exact evidence.

## Publish or replace

Create the write request by preserving the approved dry-run fields and adding its exact
`dryRunHash`. The confirmation must exactly equal the candidate Food run ID. Use a new UUID as the
idempotency key for a new logical release attempt.

```bash
npm run publication --workspace @mke/database -- publish \
  --request <approved-publish-request.json> \
  --manifest <approved-manifest.json>
```

The controlled database transaction locks the release channel, compares the expected current
publication, revalidates all evidence, writes immutable membership, promotes the candidate, and
writes the audit event. When replacing a release, it supersedes the former publication and Food
run in the same transaction. A reused baseline remains published; a replaced baseline is
superseded only when the new release uses another baseline.

There is never a destructive rollback or a superseded-to-current transition. Recovery is a new
forward release with a new candidate and approval.

## Reconcile

Reconcile is read-only and should run immediately after publication and during monitoring:

```bash
npm run publication --workspace @mke/database -- reconcile \
  --request <reviewed-dry-run-request.json> \
  --manifest <reviewed-manifest.json>
```

It must prove the exact current publication identity, run/hash pins, member lineage, counts, and
source/resource decisions. Public application/cache identity is the immutable publication ID
plus normalized request identity—never the newest timestamp.

## Safe retry

If the publish response is lost or uncertain, retry only the identical logical request: same
candidate, expected current ID, manifest/bundle fingerprint, dry-run hash, approval, actor,
reason, and idempotency key. An exact retry returns the existing publication without duplicating
membership or a successful audit event. Never reuse an idempotency key with different inputs.

## Withdraw

Withdrawal is an approved incident/release action that intentionally leaves zero current public
releases. Dry-run the withdrawal first. Its confirmation and expected-current value must both
equal the exact current publication ID. Add the resulting hash to the reviewed write request,
then run:

```bash
npm run publication --workspace @mke/database -- withdraw \
  --request <approved-withdraw-request.json>
```

The current publication and both released runs become superseded atomically. The public selector
then fails closed with `no_published_run`; it does not fall back to a validated or older release.

## Monitoring

Monitor these conditions with read-only database checks and ordinary application health checks:

- zero or one `atlas_publications` row has state `published`;
- the current publication's Food and Equity runs are both `published`;
- stored output hashes equal the publication pins;
- every member points to the exact run/geography/value recorded in the manifest;
- the public selector returns that publication ID, or explicitly returns `no_published_run`;
- no public/app role can execute either controlled mutation function;
- reports and browser bundles contain no credentials or publication mutation code.

An empty current release is valid only after an approved withdrawal or before the first release.
More than one current row, any hash/lineage mismatch, or a partly readable release is an incident.

## Incident responses

### Rejected dry run

Stop. Preserve the failure report. Correct the named upstream evidence and repeat dry run with a
newly reviewed report. Never bypass reconciliation or directly change database rows.

### Failed or uncertain transaction

Read the current publication and audit evidence. A database error rolls back the whole operation.
If no success exists, fix the cause and make a new logical attempt. If success exists but the
response was lost, use the exact safe retry.

### No current release

Confirm whether an approved withdrawal occurred. Keep the public app failed closed. Restore
service only through a new approved forward publication, never by reactivating a superseded row.

### Selector inconsistency or post-release application fault

Stop public caching and preserve the release. Reconcile the database first. If the bundle is
sound, fix/deploy application code without changing publication. If the data release is wrong,
publish a corrected forward replacement or perform an explicitly approved withdrawal.

### Suspected credential exposure

Stop publication work, revoke/rotate the affected credential through the credential owner,
inspect audit logs, and re-establish separate application/operator access. Do not paste the
credential into the incident record.

### Source terms or redistribution change

Stop direct display/use of the affected source, record the reviewed policy change, rebuild the
manifest, and obtain new approval. `prohibited_public_use` can never enter a release. Source data
remains under its publisher's terms; this repository does not relicense it.

## Reports and retention

Publication reports are canonical local JSON under `data/reports/publication/`, written
atomically and redacted by key and credential-shaped URL. They are ignored by Git. Store an
approved report in the authorized evidence system only after checking it contains no secrets.
Record only sanitized IDs, hashes, counts, outcomes, and approval references in project docs.
