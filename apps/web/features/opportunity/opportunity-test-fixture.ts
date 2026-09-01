import type {
  AtlasTractFeatureCollection,
  OpportunityAvailableResponse,
} from "@mke/contracts";

export const OPPORTUNITY_RUN = {
  id: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
  methodologyVersion: "food-equity-v1",
  equityBaselineMethodologyVersion: "equity-baseline-v1",
  completedAt: "2026-08-30T12:00:00.000Z",
  dataVintages: {acs: "2020-2024"},
  publication: null,
};

const tractOne = {
  geoid: "55079000101",
  name: "Census Tract 1.01",
  population: 2_430,
  geographyVintage: "2020",
  foodEquityPriority: 1 as const,
  foodAccessNeedBand: "very_high" as const,
  equityBaselineBand: "high" as const,
  qualityStatus: "complete" as const,
  exclusionReasons: [],
};

const tractTwo = {
  geoid: "55079000201",
  name: "Census Tract 2.01",
  population: 1_870,
  geographyVintage: "2020",
  foodEquityPriority: 3 as const,
  foodAccessNeedBand: "moderate" as const,
  equityBaselineBand: "high" as const,
  qualityStatus: "complete" as const,
  exclusionReasons: [],
};

const tractThree = {
  geoid: "55079000301",
  name: "Census Tract 3.01",
  population: 980,
  geographyVintage: "2020",
  foodEquityPriority: 5 as const,
  foodAccessNeedBand: "low" as const,
  equityBaselineBand: "low" as const,
  qualityStatus: "complete" as const,
  exclusionReasons: [],
};

export const OPPORTUNITY_RESPONSE: OpportunityAvailableResponse = {
  state: "available",
  mode: "validated_preview",
  run: OPPORTUNITY_RUN,
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
    matchingTractCount: 2,
    knownPopulationLivingInMatchingTracts: 4_300,
    matchingTractsMissingPopulation: 0,
    excludedForMissingFilterData: 0,
  },
  matchingAreas: [
    {
      runId: OPPORTUNITY_RUN.id,
      tract: tractOne,
      scores: {
        equityBaselinePercentile: 88,
        foodAccessNeedPercentile: 91,
        retailAccessScore: 90,
        transportationConstraintScore: 82,
      },
    },
    {
      runId: OPPORTUNITY_RUN.id,
      tract: tractTwo,
      scores: {
        equityBaselinePercentile: 76,
        foodAccessNeedPercentile: 54,
        retailAccessScore: 52,
        transportationConstraintScore: 68,
      },
    },
  ],
};

function feature(
  properties: typeof tractOne | typeof tractTwo | typeof tractThree,
  longitude: number,
) {
  return {
    type: "Feature" as const,
    id: properties.geoid,
    geometry: {
      type: "MultiPolygon" as const,
      coordinates: [[[
        [longitude, 43.03],
        [longitude + 0.01, 43.03],
        [longitude + 0.01, 43.04],
        [longitude, 43.03],
      ]]] as [number, number][][][],
    },
    properties,
  };
}

export const OPPORTUNITY_TRACTS: AtlasTractFeatureCollection = {
  type: "FeatureCollection",
  features: [
    feature(tractOne, -87.95),
    feature(tractTwo, -87.93),
    feature(tractThree, -87.91),
  ],
};
