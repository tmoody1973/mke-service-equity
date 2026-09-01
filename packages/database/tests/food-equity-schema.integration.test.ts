import {sql} from "drizzle-orm";
import {describe, expect, it} from "vitest";
import {createDatabaseClient} from "../src/client";
import {readRuntimeDatabaseUrl} from "../src/env";

describe.skipIf(!process.env.DATABASE_URL)("food-equity schema integration", () => {
  it("exposes the Plan 3 tables, closed lifecycle, and reviewed constraints", async () => {
    const database = createDatabaseClient(readRuntimeDatabaseUrl(process.env));

    const tables = await database.execute(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name like 'food_%'
      order by table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "food_access_metric_snapshots",
      "food_access_metric_values",
      "food_resource_versions",
      "food_resources",
      "food_score_components",
      "food_score_runs",
      "food_scores",
    ]);

    const lifecycle = await database.execute(sql`
      select enumlabel
      from pg_enum
      join pg_type on pg_type.oid = pg_enum.enumtypid
      where pg_type.typname = 'food_score_run_status'
      order by enumsortorder
    `);
    expect(lifecycle.rows.map((row) => row.enumlabel)).toEqual([
      "draft",
      "validated",
      "published",
      "superseded",
      "failed",
    ]);

    const safeguards = await database.execute(sql`
      select conname
      from pg_constraint
      where conname in (
        'food_resource_versions_geometry_srid_check',
        'food_access_metric_values_value_state_check',
        'food_score_runs_equity_baseline_run_id_score_runs_id_fk',
        'food_score_components_metric_value_geography_fk',
        'food_scores_equity_baseline_score_geography_fk',
        'food_scores_output_quality_check'
      )
      order by conname
    `);
    expect(safeguards.rows.map((row) => row.conname)).toHaveLength(6);

    const amendedColumns = await database.execute(sql`
      select table_name, column_name, is_nullable, data_type
      from information_schema.columns
      where table_schema = 'public'
        and (
          (table_name = 'food_resource_versions' and column_name in ('active', 'name'))
          or (table_name = 'food_scores' and column_name = 'exclusion_reasons')
        )
      order by table_name, column_name
    `);
    expect(amendedColumns.rows).toEqual([
      {
        table_name: "food_resource_versions",
        column_name: "active",
        is_nullable: "YES",
        data_type: "boolean",
      },
      {
        table_name: "food_resource_versions",
        column_name: "name",
        is_nullable: "YES",
        data_type: "text",
      },
      {
        table_name: "food_scores",
        column_name: "exclusion_reasons",
        is_nullable: "NO",
        data_type: "jsonb",
      },
    ]);

    const amendedConstraints = await database.execute(sql`
      select conname, pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname in (
        'food_resource_versions_identity_unique',
        'food_resource_versions_verified_at_check',
        'food_scores_exclusion_reasons_check'
      )
      order by conname
    `);
    expect(amendedConstraints.rows.map((row) => row.conname)).toEqual([
      "food_resource_versions_identity_unique",
      "food_resource_versions_verified_at_check",
      "food_scores_exclusion_reasons_check",
    ]);
    expect(
      amendedConstraints.rows.find(
        (row) => row.conname === "food_resource_versions_identity_unique",
      )?.definition,
    ).toMatch(/UNIQUE NULLS NOT DISTINCT \(resource_id, snapshot_id, valid_from, valid_to\)/i);

    const trigger = await database.execute(sql`
      select tgname
      from pg_trigger
      where tgname = 'food_score_runs_governed_transition_trigger'
        and not tgisinternal
    `);
    expect(trigger.rows).toHaveLength(1);
  });
});
