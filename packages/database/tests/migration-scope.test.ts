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
