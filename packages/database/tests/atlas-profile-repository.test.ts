import {describe, expect, it} from "vitest";
import {
  AtlasProfileDataIntegrityError,
  buildAtlasTractProfile,
} from "../src/atlas/profile-repository";

const baselineRunId = "502e2a04-b013-53cd-8b09-c9144862701a";
const foodRunId = "97bd1cdf-bf96-573f-8fcf-92e8676925d4";
const geographyId = "baa7cb74-6da7-5b2c-aa7c-991565645a1a";

function header(overrides: Record<string, unknown> = {}) {
  return {
    canonical_geography_id: geographyId,
    geoid: "55079000101",
    tract_name: "Census Tract 1.01",
    population: 2_430,
    geography_vintage: "2020 TIGER/Line",
    food_score_run_id: foodRunId,
    food_geography_id: geographyId,
    priority: 1,
    food_access_need_band: "very_high",
    food_equity_baseline_band: "high",
    food_quality_status: "complete",
    exclusion_reasons: [],
    retail_access_score: "82.5",
    transportation_constraint_score: "76.25",
    food_access_need_percentile: "84.125",
    baseline_score_id: "4ab0c77d-d84b-5899-b508-ac53272e2b35",
    baseline_score_run_id: baselineRunId,
    baseline_geography_id: geographyId,
    baseline_equity_band: "high",
    equity_baseline_percentile: "73.5",
    ...overrides,
  };
}

const foodMetrics = [
  ["sram_snap_low_access_share_1mi", "retail_access", "percent", true],
  ["full_service_grocery_walk_access", "retail_access", "minutes", true],
  ["households_no_vehicle", "transportation_constraint", "percent", true],
  ["scheduled_transit_service_intensity", "transportation_constraint", "unique_trips_per_hour", false],
] as const;

function foodRows() {
  return foodMetrics.map(([slug, domain, unit], index) => ({
    component_id: `10000000-0000-5000-8000-00000000000${index}`,
    food_score_run_id: foodRunId,
    component_geography_id: geographyId,
    metric_id: `20000000-0000-5000-8000-00000000000${index}`,
    metric_geography_id: geographyId,
    metric_slug: slug,
    metric_value: String(20 + index),
    metric_state: "observed",
    metric_unit: unit,
    metric_quality_status: "verified",
    metric_quality_metadata: slug === "households_no_vehicle"
      ? {
          margin_of_error: "2.4",
          cv_state: "reliable",
          source_confidence_level: "90_percent",
          quality_reason: null,
        }
      : {quality_reason: null},
    domain,
    indicator_percentile: String(60 + index),
    effective_weight: "0.25",
    component_quality_status: "verified",
    snapshot_id: `30000000-0000-5000-8000-00000000000${index}`,
    primary_snapshot_id: `30000000-0000-5000-8000-00000000000${index}`,
    source_name: `Food source ${index}`,
    source_publisher: `Publisher ${index}`,
    source_dataset_version: `Version ${index}`,
    source_url: "https://example.com/data",
    source_retrieved_at: new Date("2026-08-29T12:00:00.000Z"),
    source_valid_from: null,
    source_valid_to: null,
    source_methodology_url: "https://example.com/methodology",
    nearest_resource_id: slug === "full_service_grocery_walk_access"
      ? "40000000-0000-5000-8000-000000000001"
      : null,
    nearest_name: slug === "full_service_grocery_walk_access" ? "Example Market" : null,
    nearest_category: slug === "full_service_grocery_walk_access"
      ? "full_service_grocery"
      : null,
    nearest_address: slug === "full_service_grocery_walk_access" ? "123 Main St" : null,
    nearest_city: slug === "full_service_grocery_walk_access" ? "Milwaukee" : null,
    nearest_postal_code: slug === "full_service_grocery_walk_access" ? "53202" : null,
    nearest_full_service_grocery: slug === "full_service_grocery_walk_access" ? true : null,
    nearest_resource_source_matches: slug === "full_service_grocery_walk_access" ? true : null,
    nearest_resource_snapshot_linked: slug === "full_service_grocery_walk_access" ? true : null,
  }));
}

function equityRows() {
  return Array.from({length: 13}, (_, index) => ({
    component_id: `50000000-0000-5000-8000-${String(index).padStart(12, "0")}`,
    baseline_score_run_id: baselineRunId,
    component_geography_id: geographyId,
    indicator_value_id: `60000000-0000-5000-8000-${String(index).padStart(12, "0")}`,
    value_geography_id: geographyId,
    indicator_slug: index === 0 ? "limited_english_proficiency" : `indicator_${index}`,
    indicator_name: index === 0 ? "Limited English proficiency" : `Indicator ${index}`,
    indicator_description: `Definition ${index}`,
    indicator_domain: index < 3 ? "demographic" : index < 7 ? "socioeconomic" : "health",
    indicator_unit: "percent",
    higher_is_worse: true,
    indicator_value: String(10 + index),
    margin_of_error: index < 7 ? "1.5" : null,
    confidence_low: index >= 7 ? "8.5" : null,
    confidence_high: index >= 7 ? "12.5" : null,
    value_quality_metadata: index < 7
      ? {
          cv_state: index === 3 ? "use_with_caution" : "reliable",
          source_confidence_level: "90_percent",
        }
      : {},
    data_year: index < 7 ? "2024 ACS 5-year" : "2023",
    value_quality_status: "verified",
    indicator_percentile: String(70 + index),
    effective_weight: index < 3 ? "0.111111111111" : index < 7 ? "0.083333333333" : "0.055555555556",
    component_quality_status: "verified",
    snapshot_id: `70000000-0000-5000-8000-${String(index).padStart(12, "0")}`,
    source_name: index < 7 ? "American Community Survey 5-year estimates" : "CDC PLACES",
    source_publisher: index < 7 ? "U.S. Census Bureau" : "Centers for Disease Control and Prevention",
    source_dataset_version: index < 7 ? "2024 ACS 5-year" : "December 2025 PLACES release",
    source_url: "https://example.com/equity-data",
    source_retrieved_at: new Date("2026-08-27T12:00:00.000Z"),
    source_valid_from: null,
    source_valid_to: null,
    source_methodology_url: "https://example.com/equity-methodology",
  }));
}

describe("buildAtlasTractProfile", () => {
  it("builds exact Food and Equity evidence with deterministic contributions", () => {
    const profile = buildAtlasTractProfile([header()], foodRows(), equityRows(), {
      foodRunId,
      equityBaselineRunId: baselineRunId,
      geoid: "55079000101",
    });

    expect(profile.tract.foodEquityPriority).toBe(1);
    expect(profile.foodComponents).toHaveLength(4);
    expect(profile.equityDrivers).toHaveLength(13);
    expect(profile.foodComponents.find(
      (component) => component.slug === "full_service_grocery_walk_access",
    )).toMatchObject({
      slug: "full_service_grocery_walk_access",
      countyPercentile: 61,
      contribution: 2.75,
      nearestResource: {name: "Example Market"},
    });
    expect(profile.foodComponents.find(
      (component) => component.slug === "households_no_vehicle",
    )?.measurement).toMatchObject({
      confidenceLevel: 90,
      reliability: "reliable",
    });
    expect(profile.equityDrivers.find(
      (driver) => driver.slug === "limited_english_proficiency",
    )).toMatchObject({
      name: "Speaks English less than ‘very well,’ age 5+",
      measurement: {
        marginOfError: 1.5,
        confidenceLow: 8.5,
        confidenceHigh: 11.5,
        confidenceLevel: 90,
        reliability: "reliable",
      },
    });
    expect(profile.equityDrivers.find(
      (driver) => driver.slug === "indicator_3",
    )?.measurement).toMatchObject({reliability: "use_with_caution"});
    expect(profile.context).toEqual({state: "unavailable", reason: "not_pinned_to_run"});
    expect(profile.provenance).toHaveLength(6);
  });

  it("returns an honest profile without inferred components for insufficient data", () => {
    const profile = buildAtlasTractProfile([
      header({
        geoid: "55079187200",
        tract_name: "Census Tract 1872",
        priority: null,
        food_access_need_band: null,
        food_quality_status: "insufficient_data",
        exclusion_reasons: ["origin_unsnapped"],
        retail_access_score: null,
        transportation_constraint_score: null,
        food_access_need_percentile: null,
      }),
    ], [], [], {
      foodRunId,
      equityBaselineRunId: baselineRunId,
      geoid: "55079187200",
    });

    expect(profile.foodComponents).toEqual([]);
    expect(profile.equityDrivers).toEqual([]);
    expect(profile.explanation).toContain("could not be connected reliably");
  });

  it.each([
    ["wrong Food run", [header({food_score_run_id: baselineRunId})], foodRows(), equityRows()],
    ["wrong geography", [header()], foodRows().map((row, index) => index === 0
      ? {...row, metric_geography_id: "caa7cb74-6da7-5b2c-aa7c-991565645a1a"}
      : row), equityRows()],
    ["duplicate Food lineage", [header()], [...foodRows(), foodRows()[0]!], equityRows()],
    ["missing Food component", [header()], foodRows().slice(1), equityRows()],
    ["missing Equity component", [header()], foodRows(), equityRows().slice(1)],
    ["unlinked nearest resource", [header()], foodRows().map((row, index) => index === 1
      ? {...row, nearest_resource_snapshot_linked: false}
      : row), equityRows()],
    ["invalid ACS reliability metadata", [header()], foodRows(), equityRows().map((row, index) => index === 0
      ? {...row, value_quality_metadata: {cv_state: "unknown", source_confidence_level: "90_percent"}}
      : row)],
  ] as const)("fails the whole profile for %s", (_name, headers, foods, equities) => {
    expect(() => buildAtlasTractProfile(headers, foods, equities, {
      foodRunId,
      equityBaselineRunId: baselineRunId,
      geoid: "55079000101",
    })).toThrow(AtlasProfileDataIntegrityError);
  });
});
