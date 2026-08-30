import {describe, expect, it} from "vitest";
import {
  atlasResponseSchema,
  atlasTractProfileSchema,
  atlasTractPropertiesSchema,
} from "../src/atlas";

const tractProperties = {
  geoid: "55079000101",
  name: "Census Tract 1.01",
  population: 2_430,
  geographyVintage: "2020",
  foodEquityPriority: 5,
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
  it("keeps observed zero, missing, and suppressed measurements distinct", () => {
    const profile = atlasTractProfileSchema.parse({
      runId: run.id,
      tract: tractProperties,
      explanation: "This tract has very high food access need and a high Equity Baseline band.",
      foodComponents: [
        {
          slug: "households_no_vehicle",
          name: "Households without a vehicle",
          domain: "transportation_constraint",
          measurement: {state: "observed", value: 0, unit: "percent", qualityStatus: "verified"},
          contribution: 0,
          higherIsWorse: true,
        },
        {
          slug: "transit_service_intensity",
          name: "Scheduled transit service intensity",
          domain: "transportation_constraint",
          measurement: {state: "missing", value: null, unit: "trips", qualityStatus: "missing"},
          contribution: null,
          higherIsWorse: false,
        },
      ],
      equityDrivers: [
        {
          slug: "limited_english_proficiency",
          name: "Limited English proficiency",
          domain: "demographic",
          measurement: {state: "suppressed", value: null, unit: "percent", qualityStatus: "suppressed"},
          contribution: null,
          higherIsWorse: true,
        },
      ],
      context: [],
      provenance: [],
    });

    expect(profile.foodComponents[0]?.measurement).toMatchObject({state: "observed", value: 0});
    expect(profile.foodComponents[1]?.measurement.state).toBe("missing");
    expect(profile.equityDrivers[0]?.measurement.state).toBe("suppressed");
  });

  it("rejects a non-observed measurement carrying a numeric value", () => {
    expect(() => atlasTractProfileSchema.parse({
      runId: run.id,
      tract: tractProperties,
      explanation: "Explanation",
      foodComponents: [{
        slug: "metric",
        name: "Metric",
        domain: "retail_access",
        measurement: {state: "missing", value: 0, unit: "percent", qualityStatus: "missing"},
        contribution: null,
        higherIsWorse: true,
      }],
      equityDrivers: [],
      context: [],
      provenance: [],
    })).toThrow();
  });
});
