import {describe, expect, it, vi} from "vitest";
import {
  buildComparisonResponse,
  ComparisonDataIntegrityError,
  loadComparison,
} from "../src/analyze/compare-repository";

const baselineRunId = "502e2a04-b013-53cd-8b09-c9144862701a";
const foodRunId = "97bd1cdf-bf96-573f-8fcf-92e8676925d4";
const requestedGeoids = ["55079000200", "55079000101"] as const;

const selectedRun = {
  state: "selected" as const,
  mode: "validated_preview" as const,
  run: {
    id: foodRunId,
    methodologyVersion: "food-equity-v1",
    equityBaselineMethodologyVersion: "equity-baseline-v1",
    completedAt: "2026-08-30T12:00:00.000Z",
    dataVintages: {acs: "2020-2024", foodRetail: "2025"},
    publication: null,
  },
  equityBaselineRunId: baselineRunId,
  foodOutputHash: "a".repeat(64),
  equityBaselineOutputHash: "b".repeat(64),
};

const foodMetrics = [
  ["sram_snap_low_access_share_1mi", "retail_access", "percent"],
  ["full_service_grocery_walk_access", "retail_access", "minutes"],
  ["households_no_vehicle", "transportation_constraint", "percent"],
  ["scheduled_transit_service_intensity", "transportation_constraint", "unique_trips_per_hour"],
] as const;

const equitySlugs = [
  "people_of_color",
  "limited_english_proficiency",
  "foreign_born",
  "below_200_percent_fpl",
  "unemployment",
  "less_than_high_school",
  "housing_cost_burden",
  "diagnosed_diabetes",
  "obesity",
  "current_asthma",
  "any_disability",
  "frequent_mental_distress",
  "no_leisure_time_physical_activity",
] as const;

function geographyId(geoid: string) {
  return `geography-${geoid}`;
}

function header(geoid: string, overrides: Record<string, unknown> = {}) {
  const id = geographyId(geoid);
  return {
    canonical_geography_id: id,
    geoid,
    tract_name: `Census Tract ${geoid.slice(-5)}`,
    population: 2_430,
    geography_vintage: "2020 TIGER/Line",
    food_score_run_id: foodRunId,
    food_geography_id: id,
    priority: 1,
    food_access_need_band: "very_high",
    food_equity_baseline_band: "high",
    food_quality_status: "complete",
    exclusion_reasons: [],
    retail_access_score: "82.5",
    transportation_constraint_score: "76.25",
    food_access_need_percentile: "84.125",
    baseline_score_id: `baseline-${geoid}`,
    baseline_score_run_id: baselineRunId,
    baseline_geography_id: id,
    baseline_equity_band: "high",
    equity_baseline_percentile: "73.5",
    ...overrides,
  };
}

function commonSource() {
  return {
    source_name: "Approved shared source",
    source_publisher: "Approved publisher",
    source_dataset_version: "2026 edition",
    source_url: "https://example.com/data",
    source_retrieved_at: new Date("2026-08-29T12:00:00.000Z"),
    source_valid_from: null,
    source_valid_to: null,
    source_methodology_url: "https://example.com/methodology",
  };
}

function foodRows(geoid: string) {
  const id = geographyId(geoid);
  return foodMetrics.map(([slug, domain, unit], index) => ({
    geoid,
    component_id: `food-component-${geoid}-${index}`,
    food_score_run_id: foodRunId,
    component_geography_id: id,
    metric_id: `food-metric-${geoid}-${index}`,
    metric_geography_id: id,
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
        }
      : {},
    domain,
    indicator_percentile: String(60 + index),
    effective_weight: "0.25",
    component_quality_status: "verified",
    snapshot_id: `food-snapshot-${geoid}-${index}`,
    primary_snapshot_id: `food-snapshot-${geoid}-${index}`,
    ...commonSource(),
    nearest_resource_id: slug === "full_service_grocery_walk_access"
      ? `nearest-${geoid}`
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

function equityRows(geoid: string) {
  const id = geographyId(geoid);
  return equitySlugs.map((slug, index) => ({
    geoid,
    component_id: `equity-component-${geoid}-${index}`,
    baseline_score_run_id: baselineRunId,
    component_geography_id: id,
    indicator_value_id: `indicator-value-${geoid}-${index}`,
    value_geography_id: id,
    indicator_slug: slug,
    indicator_name: slug.replaceAll("_", " "),
    indicator_description: `Definition for ${slug}.`,
    indicator_domain: index < 3 ? "demographic" : index < 7 ? "socioeconomic" : "health",
    indicator_unit: "percent",
    higher_is_worse: true,
    indicator_value: String(10 + index),
    margin_of_error: index < 7 ? "1.5" : null,
    confidence_low: index >= 7 ? "8.5" : null,
    confidence_high: index >= 7 ? "12.5" : null,
    value_quality_metadata: index < 7
      ? {cv_state: "reliable", source_confidence_level: "90_percent"}
      : {},
    data_year: index < 7 ? "2024 ACS 5-year" : "2023",
    value_quality_status: "verified",
    indicator_percentile: String(70 + index),
    effective_weight: index < 3
      ? "0.111111111111"
      : index < 7
        ? "0.083333333333"
        : "0.055555555556",
    component_quality_status: "verified",
    snapshot_id: `equity-snapshot-${geoid}-${index}`,
    ...commonSource(),
  }));
}

function completeRows() {
  return {
    headers: requestedGeoids.map((geoid) => header(geoid)).reverse(),
    foods: requestedGeoids.flatMap((geoid) => foodRows(geoid)).reverse(),
    equities: requestedGeoids.flatMap((geoid) => equityRows(geoid)).reverse(),
  };
}

function inspectQuery(value: unknown): {boundValues: Array<string>; sqlText: string} {
  const boundValues: Array<string> = [];
  const textParts: Array<string> = [];
  const visit = (part: unknown) => {
    if (typeof part === "string") {
      boundValues.push(part);
      return;
    }
    if (Array.isArray(part)) {
      part.forEach(visit);
      return;
    }
    if (typeof part !== "object" || part === null) {
      return;
    }
    const record = part as {queryChunks?: unknown; value?: unknown};
    if (Array.isArray(record.queryChunks)) {
      record.queryChunks.forEach(visit);
    } else if (Array.isArray(record.value)) {
      textParts.push(...record.value.filter((item): item is string => typeof item === "string"));
    }
  };
  visit(value);
  return {boundValues, sqlText: textParts.join(" ")};
}

describe("buildComparisonResponse", () => {
  it("preserves request order, exact evidence, and one deduplicated source catalog", () => {
    const rows = completeRows();
    rows.foods = rows.foods.map((row) => row.geoid === requestedGeoids[0]
      && row.metric_slug === "households_no_vehicle"
      ? {
          ...row,
          metric_value: "61.3",
          indicator_percentile: "97",
          metric_quality_metadata: {
            margin_of_error: "22.5",
            cv_state: "high_uncertainty",
            source_confidence_level: "90_percent",
          },
        }
      : row);
    const response = buildComparisonResponse(
      selectedRun,
      [...requestedGeoids],
      rows.headers,
      rows.foods,
      rows.equities,
    );

    expect(response.tracts.map((tract) => tract.tract.geoid)).toEqual(requestedGeoids);
    expect(response.tracts.every((tract) => tract.foodAccessMeasures.length === 4)).toBe(true);
    expect(response.tracts.every((tract) => tract.equityIndicators.length === 13)).toBe(true);
    expect(response.tracts[0]?.equityIndicators.map((metric) => metric.slug)).toEqual(equitySlugs);
    expect(response.tracts[0]?.foodAccessMeasures.find(
      (metric) => metric.slug === "households_no_vehicle",
    )?.measurement).toMatchObject({
      state: "observed",
      value: 61.3,
      marginOfError: 22.5,
      confidenceLow: 38.8,
      confidenceHigh: 83.8,
      confidenceLevel: 90,
      reliability: "high_uncertainty",
    });
    expect(response.sources).toHaveLength(1);
    const availableSourceIds = new Set(response.sources.map((source) => source.id));
    const referencedSourceIds = response.tracts.flatMap((tract) => [
      ...tract.foodAccessMeasures.flatMap((metric) => metric.sourceIds),
      ...tract.equityIndicators.flatMap((metric) => metric.sourceIds),
    ]);
    expect(referencedSourceIds.every((sourceId) => availableSourceIds.has(sourceId))).toBe(true);
  });

  it("preserves supported Equity Baseline data for insufficient Food data and keeps zero population null", () => {
    const completeGeoid = requestedGeoids[0];
    const insufficientGeoid = requestedGeoids[1];
    const zeroGeoid = "55079990000";
    const headers = [
      header(completeGeoid),
      header(insufficientGeoid, {
        priority: null,
        food_access_need_band: null,
        food_quality_status: "insufficient_data",
        exclusion_reasons: ["origin_unsnapped"],
        retail_access_score: null,
        transportation_constraint_score: null,
        food_access_need_percentile: null,
        food_equity_baseline_band: "moderate",
        baseline_equity_band: "moderate",
        equity_baseline_percentile: "55",
      }),
      header(zeroGeoid, {
        population: 0,
        priority: null,
        food_access_need_band: null,
        food_equity_baseline_band: null,
        baseline_equity_band: null,
        food_quality_status: "ineligible_zero_population",
        exclusion_reasons: ["zero_population"],
        retail_access_score: null,
        transportation_constraint_score: null,
        food_access_need_percentile: null,
        equity_baseline_percentile: null,
      }),
    ];
    const response = buildComparisonResponse(
      selectedRun,
      [completeGeoid, insufficientGeoid, zeroGeoid],
      headers,
      foodRows(completeGeoid),
      equityRows(completeGeoid),
    );

    expect(response.tracts[1]).toMatchObject({
      tract: {qualityStatus: "insufficient_data", equityBaselineBand: "moderate"},
      scores: {equityBaselinePercentile: 55, foodAccessNeedPercentile: null},
      foodAccessMeasures: [],
      equityIndicators: [],
    });
    expect(response.tracts[2]).toMatchObject({
      tract: {
        population: 0,
        qualityStatus: "ineligible_zero_population",
        foodAccessNeedBand: null,
        equityBaselineBand: null,
      },
      scores: {
        foodAccessNeedPercentile: null,
        equityBaselinePercentile: null,
        retailAccessScore: null,
        transportationConstraintScore: null,
      },
      foodAccessMeasures: [],
      equityIndicators: [],
    });
  });

  it.each([
    ["unknown tract", () => {
      const rows = completeRows();
      return [rows.headers.slice(0, 1), rows.foods, rows.equities] as const;
    }],
    ["duplicate header", () => {
      const rows = completeRows();
      return [[...rows.headers, rows.headers[0]!], rows.foods, rows.equities] as const;
    }],
    ["header Food run mismatch", () => {
      const rows = completeRows();
      return [rows.headers.map((row, index) => index === 0
        ? {...row, food_score_run_id: baselineRunId}
        : row), rows.foods, rows.equities] as const;
    }],
    ["header pinned baseline run mismatch", () => {
      const rows = completeRows();
      return [rows.headers.map((row, index) => index === 0
        ? {...row, baseline_score_run_id: foodRunId}
        : row), rows.foods, rows.equities] as const;
    }],
    ["header geography mismatch", () => {
      const rows = completeRows();
      return [rows.headers.map((row, index) => index === 0
        ? {...row, food_geography_id: "different-geography"}
        : row), rows.foods, rows.equities] as const;
    }],
    ["header baseline band mismatch", () => {
      const rows = completeRows();
      return [rows.headers.map((row, index) => index === 0
        ? {...row, baseline_equity_band: "low"}
        : row), rows.foods, rows.equities] as const;
    }],
    ["unexpected evidence tract", () => {
      const rows = completeRows();
      return [rows.headers, [...rows.foods, ...foodRows("55079000300")], rows.equities] as const;
    }],
    ["mixed Food run", () => {
      const rows = completeRows();
      return [rows.headers, rows.foods.map((row, index) => index === 0
        ? {...row, food_score_run_id: baselineRunId}
        : row), rows.equities] as const;
    }],
    ["mixed Equity run", () => {
      const rows = completeRows();
      return [rows.headers, rows.foods, rows.equities.map((row, index) => index === 0
        ? {...row, baseline_score_run_id: foodRunId}
        : row)] as const;
    }],
    ["incomplete evidence", () => {
      const rows = completeRows();
      return [rows.headers, rows.foods.slice(1), rows.equities] as const;
    }],
    ["duplicate source lineage", () => {
      const rows = completeRows();
      return [rows.headers, [...rows.foods, rows.foods[0]!], rows.equities] as const;
    }],
  ] as const)("fails the whole comparison for %s", (_name, fixture) => {
    const [headers, foods, equities] = fixture();
    expect(() => buildComparisonResponse(
      selectedRun,
      [...requestedGeoids],
      headers,
      foods,
      equities,
    )).toThrow(ComparisonDataIntegrityError);
  });

  it("distinguishes an unavailable requested tract from duplicate stored headers", () => {
    const rows = completeRows();
    expect(() => buildComparisonResponse(
      selectedRun,
      [...requestedGeoids],
      rows.headers.slice(0, 1),
      rows.foods,
      rows.equities,
    )).toThrow("comparison_requested_tract_unavailable");
    expect(() => buildComparisonResponse(
      selectedRun,
      [...requestedGeoids],
      [...rows.headers, rows.headers[0]!],
      rows.foods,
      rows.equities,
    )).toThrow("comparison_header_count_mismatch");
  });
});

describe("loadComparison", () => {
  it("uses exactly three bounded parameterized queries and restores order for five tracts", async () => {
    const fiveGeoids = [
      "55079000500",
      "55079000400",
      "55079000300",
      "55079000200",
      "55079000101",
    ];
    const rows = {
      headers: fiveGeoids.map((geoid) => header(geoid)).reverse(),
      foods: fiveGeoids.flatMap((geoid) => foodRows(geoid)).reverse(),
      equities: fiveGeoids.flatMap((geoid) => equityRows(geoid)).reverse(),
    };
    const execute = vi.fn()
      .mockResolvedValueOnce({rows: rows.headers})
      .mockResolvedValueOnce({rows: rows.foods})
      .mockResolvedValueOnce({rows: rows.equities});

    const response = await loadComparison(
      selectedRun,
      fiveGeoids,
      {DATABASE_URL: "postgresql://example.test/database"},
      () => ({execute}),
    );

    expect(response.tracts.map((tract) => tract.tract.geoid)).toEqual(fiveGeoids);
    expect(execute).toHaveBeenCalledTimes(3);
    for (const call of execute.mock.calls) {
      const {boundValues, sqlText} = inspectQuery(call[0]);
      expect(boundValues).toEqual(expect.arrayContaining(fiveGeoids));
      expect(boundValues).toContain(foodRunId);
      for (const geoid of fiveGeoids) {
        expect(sqlText).not.toContain(geoid);
      }
      expect(sqlText).not.toContain(foodRunId);
    }
    const foodQueryText = inspectQuery(execute.mock.calls[1]?.[0]).sqlText;
    const equityQueryText = inspectQuery(execute.mock.calls[2]?.[0]).sqlText;
    expect(foodQueryText).toContain("food_score.quality_status = 'complete'");
    expect(equityQueryText).toContain("food_score.quality_status = 'complete'");
  });

  it("rejects an invalid request before opening a database client", async () => {
    const createClient = vi.fn();
    await expect(loadComparison(
      selectedRun,
      ["55079000101"],
      {DATABASE_URL: "postgresql://example.test/database"},
      createClient,
    )).rejects.toThrowError(new ComparisonDataIntegrityError("invalid_comparison_request"));
    expect(createClient).not.toHaveBeenCalled();
  });
});
