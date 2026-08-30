import {describe, expect, it} from "vitest";
import {
  AtlasDataIntegrityError,
  buildAtlasFeatureCollection,
} from "../src/atlas/atlas-repository";

const baselineRunId = "502e2a04-b013-53cd-8b09-c9144862701a";
const foodRunId = "97bd1cdf-bf96-573f-8fcf-92e8676925d4";

const geometry = {
  type: "MultiPolygon",
  coordinates: [[[[-87.95, 43.03], [-87.94, 43.03], [-87.94, 43.04], [-87.95, 43.03]]]],
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    geoid: "55079000101",
    tract_name: "Census Tract 1.01",
    population: 2_430,
    geography_vintage: "2020 TIGER/Line",
    geometry,
    geometry_valid: true,
    food_score_id: "193632b7-c8d3-52fc-8226-77d4eae10995",
    food_score_run_id: foodRunId,
    priority: 1,
    food_access_need_band: "very_high",
    food_equity_baseline_band: "high",
    quality_status: "complete",
    exclusion_reasons: [],
    baseline_score_id: "4ab0c77d-d84b-5899-b508-ac53272e2b35",
    baseline_score_run_id: baselineRunId,
    baseline_geography_id: "baa7cb74-6da7-5b2c-aa7c-991565645a1a",
    food_geography_id: "baa7cb74-6da7-5b2c-aa7c-991565645a1a",
    canonical_geography_id: "baa7cb74-6da7-5b2c-aa7c-991565645a1a",
    baseline_equity_band: "high",
    ...overrides,
  };
}

describe("buildAtlasFeatureCollection", () => {
  it("preserves complete, insufficient, and zero-population canonical tracts", () => {
    const collection = buildAtlasFeatureCollection([
      row(),
      row({
        geoid: "55079187200",
        tract_name: "Census Tract 1872",
        food_score_id: "293632b7-c8d3-52fc-8226-77d4eae10995",
        priority: null,
        food_access_need_band: null,
        food_equity_baseline_band: "moderate",
        baseline_equity_band: "moderate",
        quality_status: "insufficient_data",
        exclusion_reasons: ["origin_unsnapped"],
      }),
      row({
        geoid: "55079990000",
        tract_name: "Census Tract 9900",
        population: 0,
        food_score_id: "393632b7-c8d3-52fc-8226-77d4eae10995",
        priority: null,
        food_access_need_band: null,
        food_equity_baseline_band: null,
        baseline_equity_band: null,
        quality_status: "ineligible_zero_population",
        exclusion_reasons: ["zero_population"],
      }),
    ], {expectedCount: 3, foodRunId, equityBaselineRunId: baselineRunId});

    expect(collection.features.map((feature) => [
      feature.id,
      feature.properties.qualityStatus,
      feature.properties.foodEquityPriority,
    ])).toEqual([
      ["55079000101", "complete", 1],
      ["55079187200", "insufficient_data", null],
      ["55079990000", "ineligible_zero_population", null],
    ]);
  });

  it.each([
    ["missing canonical tract", [row()], {expectedCount: 2, foodRunId, equityBaselineRunId: baselineRunId}],
    ["duplicate GEOID", [row(), row()], {expectedCount: 2, foodRunId, equityBaselineRunId: baselineRunId}],
    ["missing Food score", [row({food_score_id: null})], {expectedCount: 1, foodRunId, equityBaselineRunId: baselineRunId}],
    ["wrong Food run", [row({food_score_run_id: "87bd1cdf-bf96-573f-8fcf-92e8676925d4"})], {expectedCount: 1, foodRunId, equityBaselineRunId: baselineRunId}],
    ["wrong pinned baseline", [row({baseline_score_run_id: "602e2a04-b013-53cd-8b09-c9144862701a"})], {expectedCount: 1, foodRunId, equityBaselineRunId: baselineRunId}],
    ["wrong geography join", [row({baseline_geography_id: "caa7cb74-6da7-5b2c-aa7c-991565645a1a"})], {expectedCount: 1, foodRunId, equityBaselineRunId: baselineRunId}],
    ["invalid canonical geometry", [row({geometry_valid: false})], {expectedCount: 1, foodRunId, equityBaselineRunId: baselineRunId}],
    ["score band mismatch", [row({baseline_equity_band: "very_low"})], {expectedCount: 1, foodRunId, equityBaselineRunId: baselineRunId}],
  ] as const)("fails the whole collection for %s", (_name, rows, options) => {
    expect(() => buildAtlasFeatureCollection(rows, options)).toThrow(AtlasDataIntegrityError);
  });

  it("sorts features by GEOID for deterministic output", () => {
    const collection = buildAtlasFeatureCollection([
      row({geoid: "55079000200", food_score_id: "293632b7-c8d3-52fc-8226-77d4eae10995"}),
      row(),
    ], {expectedCount: 2, foodRunId, equityBaselineRunId: baselineRunId});

    expect(collection.features.map((feature) => feature.id)).toEqual([
      "55079000101",
      "55079000200",
    ]);
  });
});
