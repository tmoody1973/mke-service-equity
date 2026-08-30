import {describe, expect, it} from "vitest";
import {
  opportunityFilterStateSchema,
  opportunityRequestSchema,
  opportunityResponseSchema,
} from "../src/analyze";

const run = {
  id: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
  methodologyVersion: "food-equity-v1",
  equityBaselineMethodologyVersion: "equity-baseline-v1",
  completedAt: "2026-08-30T12:00:00.000Z",
  dataVintages: {acs: "2020-2024", foodRetail: "2025"},
} as const;

function matchingArea(
  geoid: string,
  name: string,
  population: number | null,
) {
  return {
    runId: run.id,
    tract: {
      geoid,
      name,
      population,
      geographyVintage: "2020",
      foodEquityPriority: 2,
      foodAccessNeedBand: "high",
      equityBaselineBand: "high",
      qualityStatus: "complete",
      exclusionReasons: [],
    },
    scores: {
      foodAccessNeedPercentile: 74,
      equityBaselinePercentile: 68,
      retailAccessScore: 71,
      transportationConstraintScore: 76,
    },
  } as const;
}

describe("opportunityFilterStateSchema", () => {
  it("represents no applied filters without inventing defaults", () => {
    expect(opportunityFilterStateSchema.parse({})).toEqual({
      priorities: [],
      equityBands: [],
      equityPercentileMinimum: null,
      foodNeedBands: [],
      foodNeedPercentileMinimum: null,
      noVehicleMinimumPercent: null,
      snapLowAccessMinimumPercent: null,
      groceryWalkMinimumMinutes: null,
      includeUnreachableGrocery: false,
      transitMaximumTripsPerHour: null,
    });
  });

  it("sorts and deduplicates categorical selections into canonical order", () => {
    expect(opportunityFilterStateSchema.parse({
      priorities: [5, 2, 1, 2],
      equityBands: ["very_high", "low", "high", "low"],
      foodNeedBands: ["moderate", "very_low", "moderate"],
    })).toMatchObject({
      priorities: [1, 2, 5],
      equityBands: ["low", "high", "very_high"],
      foodNeedBands: ["very_low", "moderate"],
    });
  });

  it("accepts inclusive boundary values and an explicit unreachable grocery option", () => {
    expect(opportunityFilterStateSchema.parse({
      equityPercentileMinimum: 0,
      foodNeedPercentileMinimum: 100,
      noVehicleMinimumPercent: 0,
      snapLowAccessMinimumPercent: 100,
      groceryWalkMinimumMinutes: 0,
      includeUnreachableGrocery: true,
      transitMaximumTripsPerHour: 0,
    })).toMatchObject({
      equityPercentileMinimum: 0,
      foodNeedPercentileMinimum: 100,
      noVehicleMinimumPercent: 0,
      snapLowAccessMinimumPercent: 100,
      groceryWalkMinimumMinutes: 0,
      includeUnreachableGrocery: true,
      transitMaximumTripsPerHour: 0,
    });
  });

  it.each([
    {equityPercentileMinimum: -0.1},
    {foodNeedPercentileMinimum: 100.1},
    {noVehicleMinimumPercent: Number.POSITIVE_INFINITY},
    {snapLowAccessMinimumPercent: Number.NaN},
    {groceryWalkMinimumMinutes: -1},
    {transitMaximumTripsPerHour: -1},
  ])("rejects an invalid finite inclusive threshold: $equityPercentileMinimum", (value) => {
    expect(opportunityFilterStateSchema.safeParse(value).success).toBe(false);
  });

  it("rejects unapproved resource, public-land, ranking, and unknown filters", () => {
    expect(opportunityFilterStateSchema.safeParse({foodSiteAvailability: "none"}).success)
      .toBe(false);
    expect(opportunityFilterStateSchema.safeParse({publicLandNearby: true}).success).toBe(false);
    expect(opportunityFilterStateSchema.safeParse({ranking: "highest_need"}).success).toBe(false);
  });

  it("wraps only normalized filters in an analytical request", () => {
    expect(opportunityRequestSchema.parse({filters: {priorities: [2, 1, 2]}})).toEqual({
      filters: {
        priorities: [1, 2],
        equityBands: [],
        equityPercentileMinimum: null,
        foodNeedBands: [],
        foodNeedPercentileMinimum: null,
        noVehicleMinimumPercent: null,
        snapLowAccessMinimumPercent: null,
        groceryWalkMinimumMinutes: null,
        includeUnreachableGrocery: false,
        transitMaximumTripsPerHour: null,
      },
    });
  });
});

describe("opportunityResponseSchema", () => {
  it("accepts ordered matching areas and separates known from missing population", () => {
    const response = opportunityResponseSchema.parse({
      state: "available",
      mode: "validated_preview",
      run,
      filters: {},
      summary: {
        matchingTractCount: 3,
        knownPopulationLivingInMatchingTracts: 2_430,
        matchingTractsMissingPopulation: 1,
        excludedForMissingFilterData: 4,
      },
      matchingAreas: [
        matchingArea("55079000101", "Census Tract 1.01", 2_430),
        matchingArea("55079000200", "Census Tract 2", 0),
        matchingArea("55079000300", "Census Tract 3", null),
      ],
    });
    expect(response.state).toBe("available");
    if (response.state === "available") {
      expect(response.summary.knownPopulationLivingInMatchingTracts).toBe(2_430);
      expect(response.summary.matchingTractsMissingPopulation).toBe(1);
      expect(response.matchingAreas[1]?.tract.population).toBe(0);
    }
  });

  it("accepts a no-match result as available rather than unavailable", () => {
    expect(opportunityResponseSchema.parse({
      state: "available",
      mode: "published",
      run,
      filters: {priorities: [1]},
      summary: {
        matchingTractCount: 0,
        knownPopulationLivingInMatchingTracts: 0,
        matchingTractsMissingPopulation: 0,
        excludedForMissingFilterData: 0,
      },
      matchingAreas: [],
    }).state).toBe("available");
  });

  it("rejects count drift, population drift, duplicate or unordered rows, and mixed runs", () => {
    const base = {
      state: "available",
      mode: "published",
      run,
      filters: {},
      summary: {
        matchingTractCount: 2,
        knownPopulationLivingInMatchingTracts: 3_000,
        matchingTractsMissingPopulation: 0,
        excludedForMissingFilterData: 0,
      },
      matchingAreas: [
        matchingArea("55079000101", "Census Tract 1.01", 1_000),
        matchingArea("55079000200", "Census Tract 2", 2_000),
      ],
    } as const;

    expect(opportunityResponseSchema.safeParse({
      ...base,
      summary: {...base.summary, matchingTractCount: 1},
    }).success).toBe(false);
    expect(opportunityResponseSchema.safeParse({
      ...base,
      summary: {...base.summary, knownPopulationLivingInMatchingTracts: 2_999},
    }).success).toBe(false);
    expect(opportunityResponseSchema.safeParse({
      ...base,
      matchingAreas: [base.matchingAreas[0], base.matchingAreas[0]],
    }).success).toBe(false);
    expect(opportunityResponseSchema.safeParse({
      ...base,
      matchingAreas: [base.matchingAreas[1], base.matchingAreas[0]],
    }).success).toBe(false);
    expect(opportunityResponseSchema.safeParse({
      ...base,
      matchingAreas: [
        base.matchingAreas[0],
        {...base.matchingAreas[1], runId: "502e2a04-b013-53cd-8b09-c9144862701a"},
      ],
    }).success).toBe(false);
  });

  it("rejects geometry, internal paths, and unapproved output fields", () => {
    const area = matchingArea("55079000101", "Census Tract 1.01", 1_000);
    expect(opportunityResponseSchema.safeParse({
      state: "available",
      mode: "published",
      run,
      filters: {},
      summary: {
        matchingTractCount: 1,
        knownPopulationLivingInMatchingTracts: 1_000,
        matchingTractsMissingPopulation: 0,
        excludedForMissingFilterData: 0,
      },
      matchingAreas: [{...area, geometry: {type: "Point", coordinates: [0, 0]}}],
      storageUri: "s3://private/source.zip",
    }).success).toBe(false);
  });

  it.each([
    "no_published_run",
    "preview_not_allowed",
    "run_not_found",
    "run_not_validated",
    "data_incomplete",
    "invalid_filters",
    "results_incomplete",
  ] as const)("accepts the explicit unavailable reason %s", (reason) => {
    expect(opportunityResponseSchema.parse({state: "unavailable", reason})).toEqual({
      state: "unavailable",
      reason,
    });
  });
});
