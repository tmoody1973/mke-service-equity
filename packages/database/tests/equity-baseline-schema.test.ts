import {getTableConfig, type PgTable} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";
import {
  dataQualityStatusEnum,
  dataSources,
  equityBaselineBandEnum,
  geographies,
  indicatorDefinitions,
  indicatorDomainEnum,
  indicatorValues,
  scoreComponents,
  scoreQualityStatusEnum,
  scoreRuns,
  scoreRunStatusEnum,
  scores,
  snapshotValidationStatusEnum,
  sourceSnapshots,
} from "../src/schema";

const tables = [
  dataSources,
  geographies,
  indicatorDefinitions,
  scoreRuns,
  sourceSnapshots,
  indicatorValues,
  scoreComponents,
  scores,
] as const;

function config(table: PgTable) {
  return getTableConfig(table);
}

describe("equity-baseline schema contract", () => {
  it("declares exactly the eight approved tables with application-assigned UUID ids", () => {
    expect(tables.map((table) => config(table).name)).toEqual([
      "data_sources",
      "geographies",
      "indicator_definitions",
      "score_runs",
      "source_snapshots",
      "indicator_values",
      "score_components",
      "scores",
    ]);

    for (const table of tables) {
      expect(table.id.getSQLType()).toBe("uuid");
      expect(table.id.primary).toBe(true);
      expect(table.id.hasDefault).toBe(false);
    }
  });

  it("locks the approved enum contracts", () => {
    expect(indicatorDomainEnum.enumValues).toEqual([
      "demographic",
      "socioeconomic",
      "health",
    ]);
    expect(dataQualityStatusEnum.enumValues).toEqual([
      "verified",
      "provisional",
      "stale",
      "missing",
      "suppressed",
      "conflicting",
    ]);
    expect(snapshotValidationStatusEnum.enumValues).toEqual(["pending", "valid", "invalid"]);
    expect(scoreRunStatusEnum.enumValues).toEqual([
      "draft",
      "validated",
      "published",
      "superseded",
      "failed",
    ]);
    expect(scoreQualityStatusEnum.enumValues).toEqual([
      "complete",
      "insufficient_data",
      "ineligible_zero_population",
    ]);
    expect(equityBaselineBandEnum.enumValues).toEqual([
      "very_low",
      "low",
      "moderate",
      "high",
      "very_high",
    ]);
  });

  it("uses the approved geography types, identity, checks, and GiST indexes", () => {
    const geographyConfig = config(geographies);

    expect(geographies.geometry.getSQLType()).toBe("geometry(MultiPolygon,4326)");
    expect(geographies.centroid.getSQLType()).toBe("geometry(Point,4326)");
    expect(geographyConfig.indexes.map((item) => [item.config.name, item.config.method])).toEqual([
      ["geographies_geometry_gist", "gist"],
      ["geographies_centroid_gist", "gist"],
    ]);
    expect(geographyConfig.uniqueConstraints.map((item) => item.getName())).toContain(
      "geographies_type_geoid_vintage_unique",
    );
    expect(geographyConfig.checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "geographies_geoid_check",
        "geographies_state_fips_check",
        "geographies_county_fips_check",
        "geographies_population_check",
      ]),
    );
  });

  it("preserves normalized provenance with explicit foreign and unique constraints", () => {
    expect(config(sourceSnapshots).foreignKeys).toHaveLength(1);
    expect(config(indicatorDefinitions).foreignKeys).toHaveLength(1);
    expect(config(indicatorValues).foreignKeys).toHaveLength(3);
    expect(config(scoreComponents).foreignKeys).toHaveLength(3);
    expect(config(scores).foreignKeys).toHaveLength(2);

    expect(config(sourceSnapshots).uniqueConstraints.map((item) => item.getName())).toContain(
      "source_snapshots_source_version_checksum_unique",
    );
    expect(config(indicatorDefinitions).uniqueConstraints.map((item) => item.getName())).toContain(
      "indicator_definitions_methodology_slug_unique",
    );
    expect(config(indicatorValues).uniqueConstraints.map((item) => item.getName())).toContain(
      "indicator_values_geography_indicator_snapshot_unique",
    );
    expect(config(indicatorValues).uniqueConstraints.map((item) => item.getName())).toContain(
      "indicator_values_id_geography_unique",
    );
    expect(config(scores).uniqueConstraints.map((item) => item.getName())).toContain(
      "scores_run_geography_unique",
    );
  });

  it("retains nullable source values only behind explicit quality state", () => {
    expect(indicatorValues.value.notNull).toBe(false);
    expect(indicatorValues.qualityStatus.notNull).toBe(true);
    expect(indicatorValues.qualityMetadata.notNull).toBe(true);
    expect(indicatorValues.value.getSQLType()).toBe("numeric(15, 12)");
    expect(config(indicatorValues).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "indicator_values_value_range_check",
        "indicator_values_value_quality_check",
        "indicator_values_confidence_check",
      ]),
    );
  });

  it("requires complete score outputs and null analytical outputs for exclusions", () => {
    expect(scoreRuns.runFingerprint.notNull).toBe(true);
    expect(scoreRuns.outputHash.notNull).toBe(false);
    expect(scores.equityBaselineBand.notNull).toBe(false);
    expect(config(scores).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining(["scores_numeric_range_check", "scores_output_quality_check"]),
    );
    expect(config(scoreComponents).checks.map((item) => item.name)).toContain(
      "score_components_quality_check",
    );
  });
});
