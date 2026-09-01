# Plan 6A — Governed publication lifecycle verification

## Scope and release state

- Issue: `MOO-768`
- Verification date: 2026-09-01
- Code branch: `codex/moo-768-publication-lifecycle`
- Verification target: disposable Neon development branch only
- Production publication: **not performed**
- Authoritative validated runs: **not published or changed**
- Final development fixture state: zero current publications

This record proves the release mechanism, not approval to release production data. Gate 3 remains
a separate decision requiring exact candidate and dry-run evidence.

## Sanitized target identity

- Neon project: `wispy-glitter-41930798`
- Source branch: `moo-753-food-equity` (`br-floral-morning-a51g4fpt`)
- Disposable children: `moo-768-publication-lifecycle` (`br-dry-term-a599a485`, then corrective
  proofs `br-sweet-term-a5iba562` and `br-muddy-recipe-a5c8xj16`), all deleted after proof
- Database: `neondb`
- Migration role: `neondb_owner`
- Child classification: non-default, non-primary, development-only
- Child TTLs: 2026-09-08T17:50:32Z, 2026-09-08T18:50:00Z, and
  2026-09-08T19:00:00Z

Neon cannot expire a parent while it has a child. With explicit approval, the source expiration
was temporarily removed for this verification. After the child was deleted, the source branch's
original expiration `2026-09-06T04:54:50Z` was restored. No connection string or credential is
recorded here.

## Authoritative evidence before and after

| Evidence | Exact value |
| --- | --- |
| Equity Baseline run | `502e2a04-b013-53cd-8b09-c9144862701a` |
| Equity status | `validated` |
| Equity output hash | `19069c257e8f51fb4370b1ec8d04c6f823bd85e133846cf504866404c2c4e946` |
| Equity fingerprint | `125f23262552c9179d6dae2be69b44b30042ee5bdfdc9c5188087d73b6d531e8` |
| Equity shape | 302 scores; 3,900 components |
| Food run | `97bd1cdf-bf96-573f-8fcf-92e8676925d4` |
| Food status | `validated` |
| Food output hash | `dd53d60adf1755fff5d865f7ecfd4eba9459507b1c19c36a976b7152aa889096` |
| Food fingerprint | `cfec9911c2bc6de4866c97e7480f016a5aacbab5ef5b32accdd5d22716252603` |
| Food shape | 302 scores; 1,196 components |
| Current publication before migration | 0 |
| Current publication after fixture withdrawal | 0 |

The final live assertions matched every ID, status, output hash, and authoritative count above.

## Forward migration proof

Migration `0005_governed_publication.sql` was first replayed inside a forced rollback to expose
dependencies on the existing Food lifecycle trigger and checks. The migration was corrected to
drop/recreate those protections around the enum replacement. A second rollback-only replay
completed, then the disposable child was reset to its parent and the corrected migration was
applied from a clean state.

Independent checks proved:

- Drizzle migrations `0000` through `0005` and PostGIS are present;
- both run enums have `draft`, `validated`, `published`, `superseded`, and `failed`;
- all seven publication/member/audit tables, explicit foreign keys, checks, triggers, and the
  partial one-current unique index exist;
- direct public function execution is revoked;
- controlled publish and withdraw functions exist;
- zero current publications existed after migration; and
- authoritative validated evidence remained unchanged.

## Controlled fixture lifecycle

Integration fixtures carry Git commit `publication-integration-fixture` and random run hashes, so
they cannot be mistaken for the authoritative runs. Each fixture has one cloned geography,
Equity score/component, and Food score/component linked to existing validated value evidence.

The live repository integration proved:

- first publication atomically writes the current release, exact members, statuses, and audit;
- an identical idempotent retry returns the same publication and creates no duplicate success;
- reusing an idempotency key with different inputs is rejected;
- replacement atomically supersedes fixture A and selects fixture B while reusing its baseline;
- an incomplete score manifest fails and rolls back every provisional state change;
- `prohibited_public_use` source/resource membership is rejected before mutation;
- released scores and publication membership cannot be updated or deleted;
- direct published-to-validated status changes are rejected;
- approved withdrawal leaves zero current releases and supersedes the released fixture runs;
- an identical withdrawal retry returns the recorded result without a duplicate audit event;
- the CLI resolves an exact successful publish/withdraw retry from immutable audit identity before
  changed-current or candidate-state checks, and issues no second write;
- rejected fixture C remains validated; and
- authoritative Plan 2/3 runs stay validated with their exact hashes.

Unit tests additionally cover deterministic manifest bytes/fingerprints, duplicate/wrong-run and
hash mismatch rejection, exact geography/component reconciliation, EmergencyFood prohibition,
environment/host/Gate 3 guards, confirmation values, dry-run hash binding, report redaction/path
safety, CLI action separation, and fail-closed public selection.

## Verification commands and outcomes

Secrets were supplied only through local environment variables and are omitted here.

```text
npm run db:migrate --workspace @mke/database
  PASS — corrected migration applied from a clean child reset

npm run typecheck --workspace @mke/database
  PASS

npm test --workspace @mke/database -- --run tests/publication-schema.test.ts tests/migration-scope.test.ts
  PASS — 15 tests

npm run test:integration --workspace @mke/database -- --reporter verbose
  PASS — publication repository, publication schema, Food schema, and health (4 tests)
  SKIP — 10 preview repository cases requiring their separate exact-preview environment

npm exec --workspace @mke/database -- vitest run \
  tests/publication-repository.integration.test.ts \
  tests/publication-schema.integration.test.ts --reporter verbose
  PASS — 2 focused live tests after the database and CLI safe-retry corrections

uv run pytest tests/data -q -m integration
  PASS — 12 tests; 590 non-integration tests deselected

npm run verify
  PASS — lint; all workspace type checks; 455 tests; production Next.js build
  PASS — 32 client assets scanned with no database/publication secret or mutation code

uv run pytest -q
  PASS — 590 tests; 12 live integration tests deselected

git diff --check
  PASS
```

The final read-only reconciliation again returned zero current publications and the exact
authoritative statuses, hashes, 302/3,900 Equity shape, and 302/1,196 Food shape recorded above.
The disposable child was then deleted and the source expiration restored. GitGuardian/CI and PR
review remain delivery-stage checks and are not represented as locally completed.

## Security and operational conclusions

- Mutation code remains inside the private database package and is not exported from
  `@mke/database/server`, web routes, Server Actions, or browser code.
- The public selector requires exactly one internally consistent publication and never infers
  “latest.” Zero current releases fail closed.
- Production must provision distinct reader/operator credentials and grant the operator only the
  controlled execution boundary plus required reads. Development proof used the branch owner as
  allowed by the approved contract; it did not weaken production role separation.
- Deploying code or running migration/verification does not publish data.
- Reports are local, ignored, atomically written, and redact sensitive keys and credential URLs.

## Remaining Gate 3 stop

No authoritative or production publication occurred. A future production release must start
with an exact dry run, approved manifest/licensing decisions, expected-current comparison,
separate Gate 3 approval ID, dedicated publication-operator credential, and the procedures in
the [publication runbook](../operations/publication-runbook.md).
