import {describe, expect, it, vi} from "vitest";
import {
  buildOpportunityResponse,
  loadOpportunity,
  OpportunityDataIntegrityError,
} from "../src/analyze/opportunity-repository";

const foodRunId = "97bd1cdf-bf96-573f-8fcf-92e8676925d4";
const baselineRunId = "502e2a04-b013-53cd-8b09-c9144862701a";
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

const summary = {
  canonical_tract_count: 302,
  integrity_issue_count: 0,
  matching_tract_count: 2,
  known_population: 2_430,
  matching_missing_population: 1,
  excluded_missing_filter_data: 3,
};

function row(
  geoid: string | null,
  name: string | null,
  population: number | null,
  overrides: Record<string, unknown> = {},
) {
  if (geoid === null) {
    return {
      ...summary,
      matching_tract_count: 0,
      known_population: 0,
      matching_missing_population: 0,
      geoid: null,
      ...overrides,
    };
  }
  return {
    ...summary,
    geoid,
    tract_name: name,
    population,
    geography_vintage: "2020 TIGER/Line",
    food_score_run_id: foodRunId,
    baseline_score_run_id: baselineRunId,
    priority: 2,
    food_access_need_band: "high",
    equity_baseline_band: "high",
    food_quality_status: "complete",
    exclusion_reasons: [],
    food_access_need_percentile: "74",
    equity_baseline_percentile: "68",
    retail_access_score: "71",
    transportation_constraint_score: "76",
    ...overrides,
  };
}

function inspectQuery(value: unknown): {boundValues: Array<unknown>; sqlText: string} {
  const boundValues: Array<unknown> = [];
  const textParts: Array<string> = [];
  const visit = (part: unknown) => {
    if (
      typeof part === "string"
      || typeof part === "number"
      || typeof part === "boolean"
    ) {
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
  return {boundValues, sqlText: textParts.join(" ").replaceAll(/\s+/g, " ")};
}

describe("buildOpportunityResponse", () => {
  it("preserves SQL ordering, known and missing population, and supported incomplete states", () => {
    const rows = [
      row("55079000101", "Census Tract 1.01", 2_430),
      row("55079187200", "Census Tract 1872", null, {
        priority: null,
        food_access_need_band: null,
        equity_baseline_band: "very_low",
        food_quality_status: "insufficient_data",
        exclusion_reasons: ["origin_unsnapped"],
        food_access_need_percentile: null,
        equity_baseline_percentile: "12",
        retail_access_score: null,
        transportation_constraint_score: null,
      }),
    ];
    const response = buildOpportunityResponse(selectedRun, {}, rows);

    expect(response.matchingAreas.map((area) => area.tract.geoid)).toEqual([
      "55079000101",
      "55079187200",
    ]);
    expect(response.summary).toEqual({
      matchingTractCount: 2,
      knownPopulationLivingInMatchingTracts: 2_430,
      matchingTractsMissingPopulation: 1,
      excludedForMissingFilterData: 3,
    });
    expect(response.matchingAreas[1]).toMatchObject({
      tract: {qualityStatus: "insufficient_data", equityBaselineBand: "very_low"},
      scores: {equityBaselinePercentile: 12, foodAccessNeedPercentile: null},
    });
  });

  it("keeps observed population zero distinct and every zero-population score null", () => {
    const response = buildOpportunityResponse(selectedRun, {}, [row(
      "55079990000",
      "Census Tract 9900",
      0,
      {
        matching_tract_count: 1,
        known_population: 0,
        matching_missing_population: 0,
        priority: null,
        food_access_need_band: null,
        equity_baseline_band: null,
        food_quality_status: "ineligible_zero_population",
        exclusion_reasons: ["zero_population"],
        food_access_need_percentile: null,
        equity_baseline_percentile: null,
        retail_access_score: null,
        transportation_constraint_score: null,
      },
    )]);
    expect(response.matchingAreas[0]).toMatchObject({
      tract: {population: 0, qualityStatus: "ineligible_zero_population"},
      scores: {
        foodAccessNeedPercentile: null,
        equityBaselinePercentile: null,
        retailAccessScore: null,
        transportationConstraintScore: null,
      },
    });
  });

  it("returns an available no-match summary from the SQL sentinel row", () => {
    const response = buildOpportunityResponse(selectedRun, {priorities: [1]}, [row(
      null,
      null,
      null,
      {excluded_missing_filter_data: 4},
    )]);
    expect(response.matchingAreas).toEqual([]);
    expect(response.summary).toMatchObject({matchingTractCount: 0, excludedForMissingFilterData: 4});
  });

  it.each([
    ["canonical count", [{...row("55079000101", "Census Tract 1.01", 2_430), canonical_tract_count: 301}]],
    ["broken primary-snapshot lineage", [{...row("55079000101", "Census Tract 1.01", 2_430), integrity_issue_count: 1}]],
    ["invalid metric unit", [{...row("55079000101", "Census Tract 1.01", 2_430), integrity_issue_count: 1}]],
    ["invalid complete-score state", [{...row("55079000101", "Census Tract 1.01", 2_430), integrity_issue_count: 1}]],
    ["mixed selected run", [row("55079000101", "Census Tract 1.01", 2_430, {food_score_run_id: baselineRunId})]],
    ["contract-invalid population", [row("55079000101", "Census Tract 1.01", -1)]],
    ["summary drift", [row("55079000101", "Census Tract 1.01", 2_430)]],
    ["duplicate response rows", [
      row("55079000101", "Census Tract 1.01", 1_215),
      row("55079000101", "Census Tract 1.01", 1_215),
    ]],
    ["unordered response rows", [
      row("55079000200", "Census Tract 2", 1_215),
      row("55079000101", "Census Tract 1.01", 1_215),
    ]],
  ] as const)("fails closed for %s", (_name, rows) => {
    expect(() => buildOpportunityResponse(
      selectedRun,
      {},
      rows as unknown as ReadonlyArray<Record<string, unknown>>,
    ))
      .toThrow(OpportunityDataIntegrityError);
  });
});

describe("loadOpportunity", () => {
  const cases = [
    [{priorities: [2, 1]}, [2, 1], "priority_match"],
    [{equityBands: ["high", "very_high"]}, ["high", "very_high"], "equity_band_match"],
    [{equityPercentileMinimum: 80}, [80], "equity_percentile_match"],
    [{foodNeedBands: ["moderate", "high"]}, ["moderate", "high"], "food_band_match"],
    [{foodNeedPercentileMinimum: 75}, [75], "food_percentile_match"],
    [{noVehicleMinimumPercent: 0}, [0], "no_vehicle_match"],
    [{snapLowAccessMinimumPercent: 20}, [20], "snap_match"],
    [{groceryWalkMinimumMinutes: 10}, [10], "grocery_match"],
    [{includeUnreachableGrocery: true}, [true], "grocery_match"],
    [{transitMaximumTripsPerHour: 5}, [5], "transit_match"],
  ] as const;

  it.each(cases)("parameterizes one approved filter %#", async (filters, expectedValues, marker) => {
    const execute = vi.fn().mockResolvedValue({rows: [row(
      "55079000101",
      "Census Tract 1.01",
      2_430,
      {
        matching_tract_count: 1,
        known_population: 2_430,
        matching_missing_population: 0,
      },
    )]});
    await loadOpportunity(
      selectedRun,
      filters,
      {DATABASE_URL: "postgresql://example.test/database"},
      () => ({execute}),
    );

    expect(execute).toHaveBeenCalledTimes(1);
    const inspected = inspectQuery(execute.mock.calls[0]?.[0]);
    expect(inspected.boundValues).toEqual(expect.arrayContaining([
      foodRunId,
      baselineRunId,
      ...expectedValues,
    ]));
    expect(inspected.sqlText).toContain(marker);
  });

  it("encodes OR within categories, AND across categories, inclusive bounds, and tri-state missing", async () => {
    const execute = vi.fn().mockResolvedValue({rows: [row(null, null, null)]});
    await loadOpportunity(selectedRun, {
      priorities: [1, 2],
      equityBands: ["high", "very_high"],
      equityPercentileMinimum: 80,
      foodNeedBands: ["moderate", "high"],
      foodNeedPercentileMinimum: 75,
      noVehicleMinimumPercent: 0,
      snapLowAccessMinimumPercent: 20,
      groceryWalkMinimumMinutes: 10,
      includeUnreachableGrocery: true,
      transitMaximumTripsPerHour: 5,
    }, {DATABASE_URL: "postgresql://example.test/database"}, () => ({execute}));

    const {sqlText} = inspectQuery(execute.mock.calls[0]?.[0]);
    expect(sqlText).toContain("priority::integer in");
    expect(sqlText).toContain("equity_baseline_band::text in");
    expect(sqlText).toContain("food_access_need_band::text in");
    expect(sqlText).toContain(">=");
    expect(sqlText).toContain("<=");
    expect(sqlText).toContain("no_vehicle_state = 'observed'");
    expect(sqlText).toContain("grocery_state = 'unreachable'");
    expect(sqlText).toContain("primary_snapshot_linked is not true");
    expect(sqlText).toContain("component_quality_matches is not true");
    expect(sqlText).toContain("invalid_unit_count");
    expect(sqlText).toContain("invalid_state_count");
    expect(sqlText).toContain("is not false");
    expect(sqlText).toContain("is null");
    expect(sqlText).toContain("excluded_missing_filter_data");
    expect(sqlText).toContain("sum(population) filter (where classification = 'match')");
    expect(sqlText).toContain(
      "order by matching.tract_name collate \"C\", matching.geoid collate \"C\"",
    );
  });

  it("opens one query with no filters and rejects unknown filters before the client", async () => {
    const execute = vi.fn().mockResolvedValue({rows: [row(null, null, null)]});
    await loadOpportunity(
      selectedRun,
      {},
      {DATABASE_URL: "postgresql://example.test/database"},
      () => ({execute}),
    );
    expect(execute).toHaveBeenCalledTimes(1);

    const createClient = vi.fn();
    await expect(loadOpportunity(
      selectedRun,
      {ranking: "highest_need"},
      {DATABASE_URL: "postgresql://example.test/database"},
      createClient,
    )).rejects.toThrowError(new OpportunityDataIntegrityError("invalid_opportunity_filters"));
    expect(createClient).not.toHaveBeenCalled();
  });
});
