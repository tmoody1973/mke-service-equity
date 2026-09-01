import {getTableConfig, type PgTable} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";
import {
  foodAccessMetricSnapshots,
  foodAccessMetricValues,
  foodAccessNeedBandEnum,
  foodMetricStateEnum,
  foodResourceCategoryEnum,
  foodResourceCoordinateStatusEnum,
  foodResourceVerificationStatusEnum,
  foodResources,
  foodResourceVersions,
  foodScoreComponents,
  foodScoreRuns,
  foodScoreRunStatusEnum,
  foodScores,
} from "../src/schema";

const tables = [
  foodResources,
  foodResourceVersions,
  foodAccessMetricValues,
  foodAccessMetricSnapshots,
  foodScoreRuns,
  foodScoreComponents,
  foodScores,
] as const;

function config(table: PgTable) {
  return getTableConfig(table);
}

describe("food-equity schema contract", () => {
  it("declares only the seven approved Plan 3 tables with application-assigned ids", () => {
    expect(tables.map((table) => config(table).name)).toEqual([
      "food_resources",
      "food_resource_versions",
      "food_access_metric_values",
      "food_access_metric_snapshots",
      "food_score_runs",
      "food_score_components",
      "food_scores",
    ]);

    for (const table of tables.filter((table) => "id" in table)) {
      expect(table.id.getSQLType()).toBe("uuid");
      expect(table.id.primary).toBe(true);
      expect(table.id.hasDefault).toBe(false);
    }
  });

  it("locks resource, metric, band, and closed lifecycle enums", () => {
    expect(foodResourceCategoryEnum.enumValues).toEqual([
      "full_service_grocery",
      "candidate_full_service",
      "grocery_other",
      "convenience",
      "combination_grocery_other",
      "specialty_bakery",
      "specialty_produce",
      "specialty_meat",
      "specialty_seafood",
      "seasonal_or_direct",
      "restricted_access",
      "non_fixed_or_online",
      "emergency_food_bank",
      "emergency_food_pantry",
      "emergency_pantry_recovery",
      "emergency_meal_program",
      "unverified",
    ]);
    expect(foodResourceCoordinateStatusEnum.enumValues).toEqual([
      "source_coordinate",
      "authoritative_geocode",
      "manually_verified",
      "invalid",
      "missing",
    ]);
    expect(foodResourceVerificationStatusEnum.enumValues).toEqual([
      "verified",
      "override_verified",
      "unverified",
      "verified_context",
      "stale_unverified_context",
      "unroutable_context",
    ]);
    expect(foodMetricStateEnum.enumValues).toEqual([
      "observed",
      "unreachable",
      "missing",
      "suppressed",
      "conflicting",
    ]);
    expect(foodAccessNeedBandEnum.enumValues).toEqual([
      "very_low",
      "low",
      "moderate",
      "high",
      "very_high",
    ]);
    expect(foodScoreRunStatusEnum.enumValues).toEqual([
      "draft",
      "validated",
      "published",
      "superseded",
      "failed",
    ]);
  });

  it("preserves stable resource identity and immutable snapshot versions", () => {
    expect(config(foodResources).foreignKeys).toHaveLength(1);
    expect(config(foodResourceVersions).foreignKeys).toHaveLength(2);
    expect(config(foodResources).uniqueConstraints.map((item) => item.getName())).toContain(
      "food_resources_source_record_unique",
    );
    const versionConstraints = config(foodResourceVersions).uniqueConstraints;
    expect(versionConstraints.map((item) => item.getName())).toEqual(
      expect.arrayContaining([
        "food_resource_versions_fingerprint_unique",
        "food_resource_versions_identity_unique",
      ]),
    );
    expect(
      versionConstraints.find(
        (item) => item.getName() === "food_resource_versions_identity_unique",
      ),
    ).toMatchObject({
      columns: [
        {name: "resource_id"},
        {name: "snapshot_id"},
        {name: "valid_from"},
        {name: "valid_to"},
      ],
      nullsNotDistinct: true,
    });
    expect(foodResourceVersions.name.notNull).toBe(false);
    expect(foodResourceVersions.active.notNull).toBe(false);
    expect(foodResourceVersions.geometry.getSQLType()).toMatch(/geometry\(point/i);
    expect(config(foodResourceVersions).indexes.map((item) => [item.config.name, item.config.method]))
      .toContainEqual(["food_resource_versions_geometry_gist", "gist"]);
    expect(config(foodResourceVersions).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "food_resource_versions_hash_check",
        "food_resource_versions_coordinate_check",
        "food_resource_versions_classification_check",
        "food_resource_versions_valid_dates_check",
      ]),
    );
  });

  it("requires metric units, calculation versions, quality, and complete snapshot lineage", () => {
    expect(config(foodAccessMetricValues).foreignKeys).toHaveLength(3);
    expect(config(foodAccessMetricSnapshots).foreignKeys).toHaveLength(2);
    expect(foodAccessMetricValues.value.notNull).toBe(false);
    expect(foodAccessMetricValues.unit.notNull).toBe(true);
    expect(foodAccessMetricValues.calculationVersion.notNull).toBe(true);
    expect(foodAccessMetricValues.qualityStatus.notNull).toBe(true);
    expect(config(foodAccessMetricValues).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "food_access_metric_values_hash_check",
        "food_access_metric_values_unit_check",
        "food_access_metric_values_value_state_check",
        "food_access_metric_values_quality_check",
      ]),
    );
  });

  it("pins every run to an approved baseline and retains component provenance", () => {
    expect(config(foodScoreRuns).foreignKeys).toHaveLength(1);
    expect(config(foodScoreRuns).uniqueConstraints.map((item) => item.getName())).toContain(
      "food_score_runs_run_fingerprint_unique",
    );
    expect(config(foodScoreRuns).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "food_score_runs_output_hash_check",
        "food_score_runs_completion_check",
        "food_score_runs_failure_metadata_check",
        "food_score_runs_validation_result_check",
      ]),
    );
    expect(config(foodScoreComponents).foreignKeys).toHaveLength(3);
    expect(config(foodScoreComponents).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "food_score_components_percentile_check",
        "food_score_components_weight_check",
      ]),
    );
  });

  it("requires consistent Food Access Need and Priority outputs", () => {
    expect(config(foodScores).foreignKeys).toHaveLength(3);
    expect(config(foodScores).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "food_scores_numeric_range_check",
        "food_scores_priority_check",
        "food_scores_exclusion_reasons_check",
        "food_scores_output_quality_check",
      ]),
    );
    expect(foodScores.exclusionReasons.notNull).toBe(true);
    expect(config(foodScores).uniqueConstraints.map((item) => item.getName())).toContain(
      "food_scores_run_geography_unique",
    );
  });
});
