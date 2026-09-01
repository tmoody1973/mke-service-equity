import {sql} from "drizzle-orm";
import {describe, expect, it} from "vitest";
import {createDatabaseClient} from "../src/client";
import {readRuntimeDatabaseUrl} from "../src/env";

describe.skipIf(!process.env.DATABASE_URL)("publication schema integration", () => {
  it("installs the governed publication boundary without changing validated runs", async () => {
    const database = createDatabaseClient(readRuntimeDatabaseUrl(process.env));

    const tables = await database.execute(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name like 'atlas_publication%'
      order by table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "atlas_publication_audit_events",
      "atlas_publication_equity_component_members",
      "atlas_publication_food_component_members",
      "atlas_publication_resource_version_members",
      "atlas_publication_score_members",
      "atlas_publication_source_snapshot_members",
      "atlas_publications",
    ]);

    const metadataConstraints = await database.execute(sql`
      select constraint_record.conname,
        pg_get_constraintdef(constraint_record.oid) as definition
      from pg_constraint constraint_record
      where constraint_record.conname in (
        'atlas_publications_state_metadata_check',
        'atlas_publication_audit_events_error_check'
      )
      order by constraint_record.conname
    `);
    expect(metadataConstraints.rows).toHaveLength(2);
    expect(metadataConstraints.rows.find(
      (row) => row.conname === "atlas_publication_audit_events_error_check",
    )?.definition).toMatch(/error_code IS NOT NULL/i);
    const publicationMetadataDefinition = metadataConstraints.rows.find(
      (row) => row.conname === "atlas_publications_state_metadata_check",
    )?.definition;
    expect(publicationMetadataDefinition).toMatch(/superseded_by IS NOT NULL/i);
    expect(publicationMetadataDefinition).toMatch(/superseded_reason IS NOT NULL/i);

    const runStates = await database.execute(sql`
      select
        pg_type.typname,
        array_to_json(array_agg(pg_enum.enumlabel order by pg_enum.enumsortorder)) labels
      from pg_enum
      join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname in ('score_run_status', 'food_score_run_status')
      group by pg_type.typname
      order by pg_type.typname
    `);
    expect(runStates.rows).toEqual([
      {
        typname: "food_score_run_status",
        labels: ["draft", "validated", "published", "superseded", "failed"],
      },
      {
        typname: "score_run_status",
        labels: ["draft", "validated", "published", "superseded", "failed"],
      },
    ]);

    const boundary = await database.execute(sql`
      select
        exists (
          select 1 from pg_proc
          where proname = 'publish_atlas_release' and pronargs = 21
        ) as has_publish,
        exists (
          select 1 from pg_proc
          where proname = 'withdraw_atlas_release' and pronargs = 8
        ) as has_withdraw,
        to_regclass('atlas_publications_one_current_idx') is not null as has_one_current_index,
        not exists (
          select 1
          from pg_proc function
          cross join lateral aclexplode(
            coalesce(function.proacl, acldefault('f', function.proowner))
          ) privilege
          where function.proname = 'publish_atlas_release'
            and privilege.grantee = 0
            and privilege.privilege_type = 'EXECUTE'
        ) as public_cannot_publish,
        not exists (
          select 1
          from pg_proc function
          cross join lateral aclexplode(
            coalesce(function.proacl, acldefault('f', function.proowner))
          ) privilege
          where function.proname = 'withdraw_atlas_release'
            and privilege.grantee = 0
            and privilege.privilege_type = 'EXECUTE'
        ) as public_cannot_withdraw
    `);
    expect(boundary.rows).toEqual([
      {
        has_publish: true,
        has_withdraw: true,
        has_one_current_index: true,
        public_cannot_publish: true,
        public_cannot_withdraw: true,
      },
    ]);

    const triggers = await database.execute(sql`
      select tgname
      from pg_trigger
      where not tgisinternal
        and tgname in (
          'score_runs_governed_transition_trigger',
          'food_score_runs_governed_transition_trigger',
          'atlas_publications_transition_trigger',
          'atlas_publication_score_members_immutable_trigger',
          'scores_released_immutable_trigger',
          'food_scores_released_immutable_trigger'
        )
      order by tgname
    `);
    expect(triggers.rows.map((row) => row.tgname)).toEqual([
      "atlas_publication_score_members_immutable_trigger",
      "atlas_publications_transition_trigger",
      "food_score_runs_governed_transition_trigger",
      "food_scores_released_immutable_trigger",
      "score_runs_governed_transition_trigger",
      "scores_released_immutable_trigger",
    ]);

    const current = await database.execute(sql`
      select count(*)::integer as current_count
      from atlas_publications
      where state = 'published'
    `);
    expect(current.rows).toEqual([{current_count: 0}]);

    const authoritative = await database.execute(sql`
      select
        (select count(*)::integer from score_runs where status = 'validated') as baseline_validated,
        (select count(*)::integer from food_score_runs where status = 'validated') as food_validated
    `);
    expect(Number(authoritative.rows[0]?.baseline_validated)).toBeGreaterThan(0);
    expect(Number(authoritative.rows[0]?.food_validated)).toBeGreaterThan(0);
  });
});
