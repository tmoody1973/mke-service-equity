# MOO-770 — Production release readiness design

**Status:** Production schema and validated-data promotion approved and completed on 2026-09-03.
This is not MOO-758 Gate 3 approval and does not authorize a publication or deployment.

## Purpose

Turn the completed local Food Equity Atlas into a releasable public product without weakening its
data-quality, provenance, or publication safeguards. MOO-770 supports the existing MOO-758 Gate 3
decision; it does not replace that decision.

## Read-only readiness findings

- Neon `production` is the default protected release target but currently has zero application
  tables. It has no Atlas publication schema or current publication.
- Vercel project `mke-service-equity` is correctly configured with the `apps/web` root, Next.js,
  and Node 24, but currently has no production environment-variable definitions.
- The development candidate is a real, validated pair: Equity Baseline
  `502e2a04-b013-53cd-8b09-c9144862701a` and Food Equity
  `97bd1cdf-bf96-573f-8fcf-92e8676925d4`, with 302 canonical tracts.
- Two baseline tracts are `ineligible_zero_population`; one additional Food tract is
  `insufficient_data`. Their missing components are intentional quality states, not zeroes or
  failed ingestion.

## Release blocker: truthful incomplete-score export

The current export loader requires exactly 13 Equity and four Food component members for every
tract. The real candidate has 3,900 Equity components (rather than 3,926) and 1,196 Food
components (rather than 1,208), because it correctly omits components where a score is not
available. The current loader would fail closed for that candidate.

MOO-770 must retain a fixed 302-row, 13-plus-four column family while representing unavailable
measurements explicitly:

- score and metric quality states remain authoritative;
- unavailable values, percentiles, weights, and contributions are null with a clear state, never
  zero or inferred;
- complete tracts retain the exact evidence currently exposed;
- the atlas, compare, opportunity, and CSV export agree on the same score/run and unavailable
  states;
- tests use the real candidate's `300 complete / 2 ineligible` Equity shape and
  `299 complete / 2 ineligible / 1 insufficient` Food shape.

This is a presentation-contract correction only. It cannot alter methodology, score calculations,
priority classification, source snapshots, or publication membership rules.

## Production release sequence

1. Add tests for the real incomplete-score shape, then update the server-only export contract and
   UI copy to preserve explicit unavailable states.
2. Complete repository, responsive, accessibility, and production-mode fail-closed verification.
3. Promote the approved real data bundle using a reproducible, reviewed procedure that preserves
   all required source snapshots, resources, geometries, neighborhoods, scores, components, and
   run lineage. The 2026-09-03 promotion used Neon’s branch-restore control-plane operation from
   the exact approved source into the verified-empty production target; it did not use ad-hoc
   table edits, row copying, or run-status updates. Apply forward-only reviewed schema migrations
   after the snapshot restore, and record the sanitized verification evidence.
4. Configure Vercel production server-only variables only after the production reader role and
   published-data target exist. `DATABASE_URL` is reader-only; no publication credential belongs
   in Vercel. Preview must remain isolated from production. `HEROUI_AUTH_TOKEN` stays build-only,
   and only approved public map-style configuration may use `NEXT_PUBLIC_`.
5. Assemble a canonical production manifest and read-only dry-run request for the exact promoted
   candidate. The dry run must prove current-publication identity, full membership and lineage,
   redistribution decisions, host/environment guards, and the immutable bundle fingerprint.
6. Stop for the separate MOO-758 Gate 3 approval. It must name the exact candidate, manifest
   fingerprint, dry-run hash, expected current publication, approval ID, and release intent.
7. Only after Gate 3: execute the controlled publication transaction with the production operator,
   reconcile it, deploy the already-verified code to Vercel production, and run public URL checks.

## Out of scope

- Publishing the validated run directly.
- Credential creation, source acquisition, Vercel configuration, or Vercel deployment before the
  MOO-758 Gate 3 package is approved.
- Recalculation, methodology changes, data imputation, or treating unavailable metrics as zero.
- New product features, authentication, AI, ranking, or policy recommendations.

## Completion evidence

MOO-770 is ready to hand to MOO-758 only when tests prove the incomplete-score presentation,
the production promotion procedure is independently reviewable and reversible, required roles and
Vercel variable names are documented without values, and a dry-run-ready manifest package can be
created without touching production.
