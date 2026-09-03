# MOO-770 — Production schema and validated-data promotion

## Scope

- Date: 2026-09-03
- Approval: explicit user approval for reviewed schema and controlled real-data promotion
- Neon project: `wispy-glitter-41930798`
- Source: `moo-753-food-equity` (`br-floral-morning-a51g4fpt`)
- Target: `production` (`br-raspy-voice-a5443cft`)
- Result: production contains the exact validated candidate and governed-publication schema;
  zero current publications remain.

This was preparation for MOO-758 Gate 3, not a public release. No Vercel variable, Vercel
deployment, publication row, run-status transition, or publication audit event was created.

## Controlled operation

The target was first confirmed to contain zero public application tables. Neon’s documented
branch-restore control-plane operation then reset it from the approved source branch. Neon
required the old target to be preserved because it had a child branch; the verified-empty prior
state was retained as `moo-770-pre-promotion-empty`. This platform operation copied the complete
source snapshot instead of using a SQL dump, row-by-row import, trigger bypass, or manual status
change.

The source snapshot had migrations `0000` through `0004`. Forward-only reviewed migrations
`0005_governed_publication.sql` and `0006_publication_metadata_not_null.sql` were then applied
to production. The target now reports seven applied migrations.

## Exact verification evidence

| Evidence | Production result |
| --- | --- |
| Canonical geographies | 302 |
| Equity run | `502e2a04-b013-53cd-8b09-c9144862701a`, `validated` |
| Equity output hash | `19069c257e8f51fb4370b1ec8d04c6f823bd85e133846cf504866404c2c4e946` |
| Equity scores / components | 302 / 3,900 |
| Food run | `97bd1cdf-bf96-573f-8fcf-92e8676925d4`, `validated` |
| Food output hash | `dd53d60adf1755fff5d865f7ecfd4eba9459507b1c19c36a976b7152aa889096` |
| Food scores / components | 302 / 1,196 |
| Current `atlas_publications` | 0 |
| Governed publication functions | `publish_atlas_release`, `withdraw_atlas_release` |

Read-only comparison queries showed the same geography, run, score, and component counts in the
approved source and production target before migrations. Final production queries confirmed the
same two validated run IDs and output hashes, the governed tables/functions, and zero current
publication rows.

## Remaining release gates

1. Create separate least-privilege production application-reader and publication-operator
   credentials; keep the operator credential out of Vercel.
2. Build and independently review the exact production manifest and dry-run report.
3. Obtain the separate MOO-758 Gate 3 approval naming the candidate, fingerprint, dry-run hash,
   expected-current value, and approval ID.
4. Only then publish through the controlled function, configure the reader-only Vercel variable,
   deploy, and verify the public site.
