import {readdir, readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

describe("Plan 1 database migration scope", () => {
  it("enables only PostGIS and creates no domain data", async () => {
    const migrationPath = fileURLToPath(
      new URL("../drizzle/0000_enable_postgis.sql", import.meta.url),
    );
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toMatch(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+postgis\s*;/i);
    expect(migration).not.toMatch(/CREATE\s+TABLE/i);
    expect(migration).not.toMatch(/INSERT\s+INTO/i);
    expect(migration).not.toMatch(/\b(scores?|resources?|geograph(?:y|ies|ic|ical))\b/i);
  });
});

describe("Plan 2 equity-baseline migration scope", () => {
  it("creates exactly the approved provenance and scoring tables", async () => {
    const migrationDirectory = fileURLToPath(new URL("../drizzle", import.meta.url));
    const migrationName = (await readdir(migrationDirectory)).find((name) =>
      name.endsWith("_equity_baseline.sql"),
    );

    expect(migrationName).toBeDefined();
    const migration = await readFile(`${migrationDirectory}/${migrationName}`, "utf8");
    const tableNames = [...migration.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map(
      ([, tableName]) => tableName,
    );

    expect(tableNames.sort()).toEqual([
      "data_sources",
      "geographies",
      "indicator_definitions",
      "indicator_values",
      "score_components",
      "score_runs",
      "scores",
      "source_snapshots",
    ]);
    expect(migration).not.toMatch(/\b(food|resource|access|investment)s?\b/i);
  });

  it("enforces PostGIS, numeric, provenance, and lifecycle invariants", async () => {
    const migrationDirectory = fileURLToPath(new URL("../drizzle", import.meta.url));
    const migrationName = (await readdir(migrationDirectory)).find((name) =>
      name.endsWith("_equity_baseline.sql"),
    );

    expect(migrationName).toBeDefined();
    const migration = await readFile(`${migrationDirectory}/${migrationName}`, "utf8");

    expect(migration).toMatch(/geometry\(MultiPolygon,4326\)/i);
    expect(migration).toMatch(/geometry\(Point,4326\)/i);
    expect(migration.match(/USING gist/g)).toHaveLength(2);
    expect(migration).toContain("geographies_geometry_valid_check");
    expect(migration).toContain("geographies_geometry_srid_check");
    expect(migration).toContain("geographies_geometry_not_empty_check");
    expect(migration).toContain("geographies_centroid_srid_check");
    expect(migration).toContain("geographies_centroid_not_empty_check");
    expect(migration).toContain("indicator_values_value_quality_check");
    expect(migration).toContain("scores_output_quality_check");
    expect(migration).toContain("score_runs_output_hash_check");
    expect(migration).toContain("score_runs_validation_result_check");
    expect(migration).toContain("score_runs_run_fingerprint_unique");
    expect(migration).toContain("source_snapshots_snapshot_fingerprint_unique");
    expect(migration).toContain("score_components_indicator_value_geography_fk");
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION enforce_plan2_score_run_transition/i);
    expect(migration).toMatch(/OLD\.status = 'draft'.*NEW\.status IN \('validated', 'failed'\)/s);
    expect(migration).toMatch(/NEW\.status IN \('published', 'superseded'\)/);
    expect(migration).toMatch(/CREATE TRIGGER score_runs_plan2_transition_trigger/i);
  });
});

describe("Plan 3 food-equity migration scope", () => {
  it("creates exactly the approved food-equity tables", async () => {
    const migrationDirectory = fileURLToPath(new URL("../drizzle", import.meta.url));
    const migrationName = (await readdir(migrationDirectory)).find((name) =>
      name.endsWith("_food_equity.sql"),
    );

    expect(migrationName).toBeDefined();
    const migration = await readFile(`${migrationDirectory}/${migrationName}`, "utf8");
    const tableNames = [...migration.matchAll(/CREATE TABLE "([a-z_]+)"/g)].map(
      ([, tableName]) => tableName,
    );

    expect(tableNames.sort()).toEqual([
      "food_access_metric_snapshots",
      "food_access_metric_values",
      "food_resource_versions",
      "food_resources",
      "food_score_components",
      "food_score_runs",
      "food_scores",
    ]);
    expect(migration).not.toMatch(/CREATE TABLE "public_investments"/i);
  });

  it("enforces lineage, geometry, output, and closed lifecycle invariants", async () => {
    const migrationDirectory = fileURLToPath(new URL("../drizzle", import.meta.url));
    const migrationName = (await readdir(migrationDirectory)).find((name) =>
      name.endsWith("_food_equity.sql"),
    );

    expect(migrationName).toBeDefined();
    const migration = await readFile(`${migrationDirectory}/${migrationName}`, "utf8");

    expect(migration).toMatch(/geometry\(point,4326\)/i);
    expect(migration).toContain("food_resource_versions_geometry_gist");
    expect(migration).toContain("food_resource_versions_geometry_srid_check");
    expect(migration).toContain("food_resource_versions_geometry_not_empty_check");
    expect(migration).toContain("food_access_metric_values_value_state_check");
    expect(migration).toContain("food_access_metric_values_quality_check");
    expect(migration).toContain("food_score_runs_equity_baseline_run_id_score_runs_id_fk");
    expect(migration).toContain("food_score_components_metric_value_geography_fk");
    expect(migration).toContain("food_scores_equity_baseline_score_geography_fk");
    expect(migration).toContain("food_scores_output_quality_check");
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION enforce_plan3_food_score_run_transition/i);
    expect(migration).toMatch(/TG_OP = 'INSERT'.*NEW\.status <> 'draft'/s);
    expect(migration).toMatch(/OLD\.status = 'draft'.*NEW\.status IN \('validated', 'failed'\)/s);
    expect(migration).not.toMatch(/food_score_run_status[^;]*(published|superseded)/i);
    expect(migration).not.toMatch(/public[_ ]investment/i);
  });
});

describe("Plan 3 food-equity contract amendment", () => {
  it("applies the approved nullable, identity, verification, and score-provenance changes", async () => {
    const migrationPath = fileURLToPath(
      new URL("../drizzle/0003_food_equity_contract_amendment.sql", import.meta.url),
    );
    const migration = await readFile(migrationPath, "utf8");

    expect(migration).toMatch(
      /ALTER TABLE "food_resource_versions" ALTER COLUMN "name" DROP NOT NULL/i,
    );
    expect(migration).toMatch(
      /ALTER TABLE "food_resource_versions" ALTER COLUMN "active" DROP NOT NULL/i,
    );
    expect(migration).toContain("DROP CONSTRAINT \"food_resource_versions_resource_snapshot_unique\"");
    expect(migration).toMatch(
      /food_resource_versions_identity_unique[\s\S]*UNIQUE NULLS NOT DISTINCT\s*\("resource_id","snapshot_id","valid_from","valid_to"\)/i,
    );
    expect(migration).toMatch(
      /verification_status" NOT IN \('override_verified', 'verified_context'\)[\s\S]*verified_at" IS NOT NULL/i,
    );
    expect(migration).toMatch(
      /ADD COLUMN "exclusion_reasons" jsonb[\s\S]*ALTER COLUMN "exclusion_reasons" SET NOT NULL/i,
    );
    expect(migration).toContain(
      "cannot amend existing incomplete food_scores without source-backed exclusion reasons",
    );
    expect(migration).toMatch(/jsonb_array_length[\s\S]*quality_status/i);
    expect(migration).toContain("food_scores_exclusion_reasons_check");
    expect(migration).not.toMatch(/DROP TABLE|DROP TYPE/i);

    const journalPath = fileURLToPath(new URL("../drizzle/meta/_journal.json", import.meta.url));
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      entries: {idx: number; tag: string}[];
    };
    expect(journal.entries.map(({idx, tag}) => ({idx, tag}))).toEqual([
      {idx: 0, tag: "0000_enable_postgis"},
      {idx: 1, tag: "0001_equity_baseline"},
      {idx: 2, tag: "0002_food_equity"},
      {idx: 3, tag: "0003_food_equity_contract_amendment"},
    ]);
  });
});
