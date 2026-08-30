import {describe, expect, it} from "vitest";
import {
  compareRequestSchema,
  compareResponseSchema,
  compareUrlStateSchema,
  comparisonMetricSchema,
} from "../src/analyze";

const run = {
  id: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
  methodologyVersion: "food-equity-v1",
  equityBaselineMethodologyVersion: "equity-baseline-v1",
  completedAt: "2026-08-30T12:00:00.000Z",
  dataVintages: {acs: "2020-2024", foodRetail: "2025"},
} as const;

const source = {
  id: "source:acs-2024",
  source: {
    sourceName: "American Community Survey 5-year estimates",
    publisher: "United States Census Bureau",
    datasetVersion: "2024 ACS 5-year",
    sourceUrl: "https://api.census.gov/data/2024/acs/acs5",
    retrievedAt: "2026-08-27T12:00:00.000Z",
    validFrom: null,
    validTo: null,
    methodologyUrl: "https://www.census.gov/programs-surveys/acs/methodology.html",
    limitation: "Survey estimates include sampling uncertainty.",
  },
} as const;

const observedMeasurement = {
  state: "observed",
  value: 61.3,
  unit: "percent",
  qualityStatus: "verified",
  marginOfError: 22.5,
  confidenceLow: 38.8,
  confidenceHigh: 83.8,
  confidenceLevel: 90,
  reliability: "use_with_caution",
} as const;

const foodSlugs = [
  "sram_snap_low_access_share_1mi",
  "full_service_grocery_walk_access",
  "households_no_vehicle",
  "scheduled_transit_service_intensity",
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

function metric(category: "food_access" | "equity_baseline", slug: string) {
  return {
    category,
    slug,
    name: slug.replaceAll("_", " "),
    definition: `Definition for ${slug}.`,
    domain: category === "food_access" ? "retail_access" : "socioeconomic",
    dataYear: "2024",
    measurement: observedMeasurement,
    countyPercentile: 75,
    contribution: 2.5,
    higherIsWorse: true,
    sourceIds: [source.id],
    limitation: "Read this tract-level estimate with its source limits.",
  };
}

function tract(geoid: string, name: string) {
  return {
    runId: run.id,
    tract: {
      geoid,
      name,
      population: 2_430,
      geographyVintage: "2020",
      foodEquityPriority: 1,
      foodAccessNeedBand: "very_high",
      equityBaselineBand: "high",
      qualityStatus: "complete",
      exclusionReasons: [],
    },
    scores: {
      foodAccessNeedPercentile: 90,
      equityBaselinePercentile: 75,
      retailAccessScore: 80,
      transportationConstraintScore: 70,
    },
    foodAccessMeasures: foodSlugs.map((slug) => metric("food_access", slug)),
    equityIndicators: equitySlugs.map((slug) => metric("equity_baseline", slug)),
  } as const;
}

function availableResponse() {
  const tracts = [
    tract("55079000101", "Census Tract 1.01"),
    tract("55079000200", "Census Tract 2"),
  ];
  return {
    state: "available",
    mode: "validated_preview",
    run,
    request: {tracts: tracts.map((item) => item.tract.geoid)},
    tracts,
    sources: [source],
  } as const;
}

describe("Compare request contracts", () => {
  it("preserves the stable selection order for zero through five unique URL tracts", () => {
    expect(compareUrlStateSchema.parse({tracts: []})).toEqual({tracts: []});
    expect(compareUrlStateSchema.parse({tracts: ["55079000200", "55079000101"]})).toEqual({
      tracts: ["55079000200", "55079000101"],
    });
  });

  it("rejects duplicate, malformed, sixth, and unknown URL properties", () => {
    expect(compareUrlStateSchema.safeParse({
      tracts: ["55079000101", "55079000101"],
    }).success).toBe(false);
    expect(compareUrlStateSchema.safeParse({tracts: ["00101"]}).success).toBe(false);
    expect(compareUrlStateSchema.safeParse({
      tracts: Array.from({length: 6}, (_, index) => `55079000${String(index).padStart(3, "0")}`),
    }).success).toBe(false);
    expect(compareUrlStateSchema.safeParse({tracts: [], runId: run.id}).success).toBe(false);
  });

  it("requires two through five unique tracts for an analytical request", () => {
    expect(compareRequestSchema.safeParse({tracts: ["55079000101"]}).success).toBe(false);
    expect(compareRequestSchema.parse({
      tracts: ["55079000200", "55079000101"],
    }).tracts).toEqual(["55079000200", "55079000101"]);
    expect(compareRequestSchema.safeParse({
      tracts: ["55079000101", "55079000101"],
    }).success).toBe(false);
  });
});

describe("comparisonMetricSchema", () => {
  it.each([
    observedMeasurement,
    {
      state: "unreachable",
      value: null,
      unit: "minutes",
      qualityStatus: "verified",
    },
    {state: "missing", value: null, unit: "percent", qualityStatus: "missing"},
    {state: "suppressed", value: null, unit: "percent", qualityStatus: "suppressed"},
    {state: "conflicting", value: null, unit: "percent", qualityStatus: "conflicting"},
  ] as const)("preserves the explicit $state measurement state", (measurement) => {
    expect(comparisonMetricSchema.parse({
      ...metric("food_access", "households_no_vehicle"),
      measurement,
    }).measurement.state).toBe(measurement.state);
  });

  it("rejects a display measure without a source reference", () => {
    expect(comparisonMetricSchema.safeParse({
      ...metric("food_access", "households_no_vehicle"),
      sourceIds: [],
    }).success).toBe(false);
  });

  it("rejects unapproved and category-mismatched metric slugs", () => {
    expect(comparisonMetricSchema.safeParse({
      ...metric("food_access", "people_of_color"),
    }).success).toBe(false);
    expect(comparisonMetricSchema.safeParse({
      ...metric("equity_baseline", "undocumented_metric"),
    }).success).toBe(false);
  });
});

describe("compareResponseSchema", () => {
  it("accepts a strict, ordered, exact-run comparison with four Food and 13 Equity measures", () => {
    const response = compareResponseSchema.parse(availableResponse());
    expect(response.state).toBe("available");
    if (response.state === "available") {
      expect(response.tracts.map((item) => item.tract.geoid)).toEqual([
        "55079000101",
        "55079000200",
      ]);
      expect(response.tracts[0]?.foodAccessMeasures).toHaveLength(4);
      expect(response.tracts[0]?.equityIndicators).toHaveLength(13);
    }
  });

  it("accepts an incomplete tract only with null scores and no invented evidence", () => {
    const base = availableResponse();
    const completeTract = base.tracts[0]!;
    const originalTract = base.tracts[1]!;
    const response = {
      ...base,
      tracts: [
        completeTract,
        {
          ...originalTract,
          tract: {
            ...originalTract.tract,
            foodEquityPriority: null,
            foodAccessNeedBand: null,
            equityBaselineBand: null,
            qualityStatus: "insufficient_data",
            exclusionReasons: ["origin_unsnapped"],
          },
          scores: {
            foodAccessNeedPercentile: null,
            equityBaselinePercentile: null,
            retailAccessScore: null,
            transportationConstraintScore: null,
          },
          foodAccessMeasures: [],
          equityIndicators: [],
        },
      ],
    };
    expect(compareResponseSchema.parse(response).state).toBe("available");
  });

  it("rejects incomplete metric sets, mixed runs, missing source definitions, and partial order", () => {
    const base = availableResponse();
    const first = base.tracts[0]!;
    const second = base.tracts[1]!;
    const incomplete = {
      ...base,
      tracts: [{
        ...first,
        foodAccessMeasures: first.foodAccessMeasures.slice(0, 3),
      }, second],
    };
    expect(compareResponseSchema.safeParse(incomplete).success).toBe(false);

    const mixedRun = {
      ...base,
      tracts: [first, {
        ...second,
        runId: "502e2a04-b013-53cd-8b09-c9144862701a",
      }],
    };
    expect(compareResponseSchema.safeParse(mixedRun).success).toBe(false);

    const missingSource = {...base, sources: []};
    expect(compareResponseSchema.safeParse(missingSource).success).toBe(false);

    const firstFoodMeasure = first.foodAccessMeasures[0]!;
    const danglingSource = {
      ...base,
      tracts: [{
        ...first,
        foodAccessMeasures: [
          {...firstFoodMeasure, sourceIds: ["source:not-in-response"]},
          ...first.foodAccessMeasures.slice(1),
        ],
      }, second],
    };
    expect(compareResponseSchema.safeParse(danglingSource).success).toBe(false);

    const partialOrder = {
      ...base,
      request: {tracts: ["55079000200", "55079000101"]},
    };
    expect(compareResponseSchema.safeParse(partialOrder).success).toBe(false);
  });

  it("rejects operational and unknown browser fields", () => {
    expect(compareResponseSchema.safeParse({
      ...availableResponse(),
      storageUri: "s3://private/source.zip",
    }).success).toBe(false);
    const base = availableResponse();
    const response = {
      ...base,
      tracts: [{...base.tracts[0]!, databaseRowId: 42}, base.tracts[1]!],
    };
    expect(compareResponseSchema.safeParse(response).success).toBe(false);
  });

  it.each([
    "no_published_run",
    "preview_not_allowed",
    "run_not_found",
    "run_not_validated",
    "data_incomplete",
    "invalid_request",
    "unknown_tract",
    "comparison_incomplete",
  ] as const)("accepts the explicit unavailable reason %s", (reason) => {
    expect(compareResponseSchema.parse({state: "unavailable", reason})).toEqual({
      state: "unavailable",
      reason,
    });
  });
});
