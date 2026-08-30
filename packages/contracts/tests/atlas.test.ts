import {describe, expect, it} from "vitest";
import {
  atlasResponseSchema,
  atlasTractProfileSchema,
  atlasTractProfileResponseSchema,
  atlasTractPropertiesSchema,
} from "../src/atlas";

const tractProperties = {
  geoid: "55079000101",
  name: "Census Tract 1.01",
  population: 2_430,
  geographyVintage: "2020",
  foodEquityPriority: 1,
  foodAccessNeedBand: "very_high",
  equityBaselineBand: "high",
  qualityStatus: "complete",
  exclusionReasons: [],
} as const;

const feature = {
  type: "Feature",
  id: tractProperties.geoid,
  geometry: {
    type: "MultiPolygon",
    coordinates: [[[[-87.95, 43.03], [-87.94, 43.03], [-87.94, 43.04], [-87.95, 43.03]]]],
  },
  properties: tractProperties,
} as const;

const run = {
  id: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
  methodologyVersion: "food-equity-v1",
  equityBaselineMethodologyVersion: "equity-baseline-v1",
  completedAt: "2026-08-30T12:00:00.000Z",
  dataVintages: {acs: "2020-2024", foodRetail: "2025"},
} as const;

describe("atlasResponseSchema", () => {
  it("accepts an available validated preview with canonical GeoJSON", () => {
    const response = atlasResponseSchema.parse({
      state: "available",
      mode: "validated_preview",
      run,
      tracts: {type: "FeatureCollection", features: [feature]},
    });

    expect(response.state).toBe("available");
    if (response.state === "available") {
      expect(response.tracts.features[0]?.id).toBe("55079000101");
    }
  });

  it.each([
    "no_published_run",
    "preview_not_allowed",
    "run_not_found",
    "run_not_validated",
    "data_incomplete",
  ] as const)("accepts the explicit unavailable reason %s", (reason) => {
    expect(atlasResponseSchema.parse({state: "unavailable", reason})).toEqual({
      state: "unavailable",
      reason,
    });
  });

  it("rejects a feature whose id does not match its GEOID", () => {
    expect(() => atlasResponseSchema.parse({
      state: "available",
      mode: "published",
      run,
      tracts: {
        type: "FeatureCollection",
        features: [{...feature, id: "55079000102"}],
      },
    })).toThrow();
  });

  it("rejects duplicate tract GEOIDs", () => {
    expect(() => atlasResponseSchema.parse({
      state: "available",
      mode: "published",
      run,
      tracts: {type: "FeatureCollection", features: [feature, feature]},
    })).toThrow();
  });

  it("rejects operational fields instead of leaking them to the browser", () => {
    expect(() => atlasResponseSchema.parse({
      state: "available",
      mode: "validated_preview",
      run: {...run, storageUri: "s3://private/source.zip"},
      tracts: {type: "FeatureCollection", features: [feature]},
    })).toThrow();
  });
});

describe("atlasTractPropertiesSchema", () => {
  it("preserves an observed zero without converting it to missing", () => {
    expect(atlasTractPropertiesSchema.parse({
      ...tractProperties,
      population: 0,
      foodEquityPriority: null,
      foodAccessNeedBand: null,
      equityBaselineBand: null,
      qualityStatus: "ineligible_zero_population",
      exclusionReasons: ["zero_population"],
    }).population).toBe(0);
  });

  it("requires incomplete tracts to have a null priority", () => {
    expect(() => atlasTractPropertiesSchema.parse({
      ...tractProperties,
      qualityStatus: "insufficient_data",
    })).toThrow();
  });

  it("requires complete tracts to have a priority and both bands", () => {
    expect(() => atlasTractPropertiesSchema.parse({
      ...tractProperties,
      foodEquityPriority: null,
    })).toThrow();
  });
});

describe("atlasTractProfileSchema", () => {
  const provenance = {
    sourceName: "American Community Survey 5-year estimates",
    publisher: "U.S. Census Bureau",
    datasetVersion: "2024 ACS 5-year",
    sourceUrl: "https://api.census.gov/data/2024/acs/acs5",
    retrievedAt: "2026-08-29T12:00:00.000Z",
    validFrom: null,
    validTo: null,
    methodologyUrl: "https://www.census.gov/programs-surveys/acs/methodology.html",
    limitation: null,
  } as const;

  const evidence = Array.from({length: 4}, (_, index) => ({
    slug: `food-metric-${index}`,
    name: `Food metric ${index}`,
    definition: "A scored Food Access measure.",
    domain: index < 2 ? "retail_access" : "transportation_constraint",
    dataYear: null,
    measurement: {
      state: "observed" as const,
      value: index,
      unit: "percent",
      qualityStatus: "verified" as const,
      marginOfError: null,
      confidenceLow: null,
      confidenceHigh: null,
    },
    countyPercentile: 50,
    effectiveWeight: 0.25,
    contribution: 0,
    higherIsWorse: true,
    provenance: [provenance],
    nearestResource: null,
    limitation: null,
  }));

  const drivers = Array.from({length: 13}, (_, index) => ({
    ...evidence[0],
    slug: index === 0 ? "limited_english_proficiency" : `equity-driver-${index}`,
    name: index === 0 ? "Speaks English less than ‘very well,’ age 5+" : `Equity driver ${index}`,
    definition: "A scored Equity Baseline measure.",
    domain: index < 3 ? "demographic" : index < 7 ? "socioeconomic" : "health",
  }));

  const completeProfile = {
    runId: run.id,
    tract: tractProperties,
    explanation: "Priority 1 reflects very high Food Access Need and high Equity Baseline conditions.",
    scores: {
      foodAccessNeedPercentile: 84.2,
      equityBaselinePercentile: 73.1,
      retailAccessScore: 81.5,
      transportationConstraintScore: 76.4,
    },
    foodComponents: evidence,
    equityDrivers: drivers,
    context: {state: "unavailable", reason: "not_pinned_to_run"},
    provenance: [provenance],
    limitations: ["These tract-level measures do not describe every person in the tract."],
  } as const;

  it("preserves an observed zero and the approved English-language label", () => {
    const profile = atlasTractProfileSchema.parse(completeProfile);

    expect(profile.foodComponents[0]?.measurement).toMatchObject({state: "observed", value: 0});
    expect(profile.equityDrivers[0]?.name).toContain("English");
  });

  it("rejects a non-observed measurement carrying a numeric value", () => {
    expect(() => atlasTractProfileSchema.parse({
      ...completeProfile,
      foodComponents: [{
        ...evidence[0],
        measurement: {state: "missing", value: 0, unit: "percent", qualityStatus: "missing"},
      }],
    })).toThrow();
  });

  it("rejects a complete profile without all four Food and thirteen Equity inputs", () => {
    expect(() => atlasTractProfileSchema.parse({
      ...completeProfile,
      foodComponents: [],
      equityDrivers: [],
    })).toThrow();
  });

  it("rejects internal operational metadata", () => {
    expect(() => atlasTractProfileSchema.parse({
      ...completeProfile,
      storageUri: "s3://private/raw-data.zip",
    })).toThrow();
  });
});

describe("atlasTractProfileResponseSchema", () => {
  it.each(["invalid_tract", "profile_incomplete", "no_published_run"] as const)(
    "accepts the safe unavailable reason %s",
    (reason) => {
      expect(atlasTractProfileResponseSchema.parse({state: "unavailable", reason})).toEqual({
        state: "unavailable",
        reason,
      });
    },
  );
});
