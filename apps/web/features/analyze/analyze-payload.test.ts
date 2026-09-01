import {
  compareAvailableResponseSchema,
  opportunityAvailableResponseSchema,
  type OpportunityAvailableResponse,
} from "@mke/contracts";
import {describe, expect, it} from "vitest";

import {
  completeComparisonTract,
  makeComparison,
} from "../compare/comparison-test-fixture";
import {OPPORTUNITY_RESPONSE} from "../opportunity/opportunity-test-fixture";

const COMPARE_RESPONSE_MAX_BYTES = 500_000;
const OPPORTUNITY_RESPONSE_MAX_BYTES = 150_000;
const MILWAUKEE_TRACT_COUNT = 302;

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function largestNoFilterOpportunityResponse(): OpportunityAvailableResponse {
  const template = OPPORTUNITY_RESPONSE.matchingAreas[0];
  if (!template) {
    throw new Error("Opportunity payload fixture requires one matching area.");
  }

  const matchingAreas = Array.from({length: MILWAUKEE_TRACT_COUNT}, (_, index) => {
    const ordinal = String(index + 1).padStart(3, "0");
    return {
      ...template,
      runId: OPPORTUNITY_RESPONSE.run.id,
      tract: {
        ...template.tract,
        geoid: `55079${String(index + 1).padStart(6, "0")}`,
        name: `Census Tract ${ordinal}`,
        population: 1_000,
      },
    };
  });

  return {
    ...OPPORTUNITY_RESPONSE,
    filters: {
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
    },
    summary: {
      matchingTractCount: MILWAUKEE_TRACT_COUNT,
      knownPopulationLivingInMatchingTracts: MILWAUKEE_TRACT_COUNT * 1_000,
      matchingTractsMissingPopulation: 0,
      excludedForMissingFilterData: 0,
    },
    matchingAreas,
  };
}

describe("Analyze response payload boundaries", () => {
  it("keeps a complete five-tract comparison below 500,000 UTF-8 bytes", () => {
    const comparison = makeComparison(Array.from({length: 5}, (_, index) => (
      completeComparisonTract({
        geoid: `55079${String(index + 1).padStart(6, "0")}`,
        index,
        name: `Census Tract ${index + 1}`,
      })
    )));

    expect(compareAvailableResponseSchema.safeParse(comparison).success).toBe(true);
    expect(comparison.tracts).toHaveLength(5);
    expect(comparison.tracts.every(
      (tract) => tract.foodAccessMeasures.length === 4 && tract.equityIndicators.length === 13,
    )).toBe(true);
    expect(serializedBytes(comparison)).toBeLessThanOrEqual(COMPARE_RESPONSE_MAX_BYTES);
  });

  it("keeps the largest no-filter Opportunity response below 150,000 UTF-8 bytes", () => {
    const response = largestNoFilterOpportunityResponse();

    expect(opportunityAvailableResponseSchema.safeParse(response).success).toBe(true);
    expect(response.matchingAreas).toHaveLength(MILWAUKEE_TRACT_COUNT);
    expect(serializedBytes(response)).toBeLessThanOrEqual(OPPORTUNITY_RESPONSE_MAX_BYTES);
  });

  it("keeps Atlas geometry out of the Opportunity response", () => {
    const response = largestNoFilterOpportunityResponse();
    const serialized = JSON.stringify(response);

    expect(serialized).not.toContain('"geometry"');
    expect(serialized).not.toContain('"coordinates"');
    expect(response.matchingAreas.every(
      (area) => !Object.hasOwn(area, "geometry") && !Object.hasOwn(area.tract, "geometry"),
    )).toBe(true);
  });
});
