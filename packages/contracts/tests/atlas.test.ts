import {describe, expect, it} from "vitest";
import {
  atlasSearchResponseSchema,
  atlasResponseSchema,
  atlasNeighborhoodContextSchema,
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
  publication: null,
} as const;

const foodSites = {
  state: "available",
  layerId: "food_sites",
  title: "Food pantries and meal sites",
  description: "Source-listed community food sites. Check before visiting.",
  affectsScores: false,
  qualityStatus: "source_listed_check_before_visiting",
  scoreRunRelationship: "display_context_only_not_part_of_score_run",
  features: {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: "data-you-can-use:pantries-2026:18",
      geometry: {type: "Point", coordinates: [-87.947, 43.09]},
      properties: {
        id: "data-you-can-use:pantries-2026:18",
        name: "All Saints Catholic Church",
        siteType: "food_pantry",
        address: "4060 N. 26th St.",
        city: "Milwaukee",
        zipCode: "53209",
        phone: "414-444-5610",
        website: "https://example.org/pantry",
        details: "Pantry: Tuesday and Thursday",
        serviceArea: null,
        verificationStatus: "source_listed_check_before_visiting",
      },
    }],
  },
  source: {
    sourceName: "Milwaukee Food Environment Map — Food Pantries and Meal Sites",
    publisher: "Data You Can Use",
    collaborators: [
      "Milwaukee Food Council",
      "UWM Institute for Systems Change and Peacebuilding",
    ],
    datasetVersion: "Pantries 2026, ArcGIS FeatureServer layer 57",
    sourceUrl: "https://experience.arcgis.com/experience/4883a0957d124294aa236d9e9cc696a5",
    layerUrl: "https://services5.arcgis.com/example/FeatureServer/57",
    retrievedAt: "2026-08-30T19:17:48Z",
    sourceLastEditedAt: "2026-03-05T19:55:13Z",
    termsUrl: "https://doc.arcgis.com/en/arcgis-online/reference/terms-of-use.htm",
    attribution: "Data You Can Use, Milwaukee Food Council, and UWM Institute for Systems Change and Peacebuilding",
    sourceSnapshotSha256: "a".repeat(64),
    featureCount: 1,
    limitation: "Source-listed locations are not independently verified. Check before visiting.",
  },
} as const;

describe("atlasSearchResponseSchema", () => {
  it("accepts bounded tract and City-neighborhood results that resolve to GEOIDs", () => {
    const response = atlasSearchResponseSchema.parse({
      state: "available",
      query: "Northridge",
      neighborhoodReferenceStatus: "available",
      results: [
        {
          id: "neighborhood:117:55079185700",
          kind: "neighborhood",
          geoid: "55079185700",
          title: "Northridge",
          subtitle: "Census Tract 1857 · 42.8% of its City-covered area",
          sourceNeighborhoodId: 117,
          coveredAreaShare: 0.428,
        },
        {
          id: "tract:55079185700",
          kind: "tract",
          geoid: "55079185700",
          title: "Census Tract 1857",
          subtitle: "Census tract ID 55079185700",
        },
      ],
    });
    expect(response.state).toBe("available");
    if (response.state === "available") {
      expect(response.results).toHaveLength(2);
    }
  });

  it("rejects internal fields, malformed GEOIDs, and more than twenty results", () => {
    const tractResult = {
      id: "tract:55079185700",
      kind: "tract",
      geoid: "55079185700",
      title: "Census Tract 1857",
      subtitle: "Census tract ID 55079185700",
    } as const;

    expect(atlasSearchResponseSchema.safeParse({
      state: "available",
      query: "18",
      neighborhoodReferenceStatus: "available",
      results: [{...tractResult, storageUri: "data/raw/private.json"}],
    }).success).toBe(false);
    expect(atlasSearchResponseSchema.safeParse({
      state: "available",
      query: "18",
      neighborhoodReferenceStatus: "available",
      results: [{...tractResult, geoid: "1857"}],
    }).success).toBe(false);
    expect(atlasSearchResponseSchema.safeParse({
      state: "available",
      query: "18",
      neighborhoodReferenceStatus: "available",
      results: Array.from({length: 21}, (_, index) => ({
        ...tractResult,
        id: `tract:55079000${String(index).padStart(3, "0")}`,
        geoid: `55079000${String(index).padStart(3, "0")}`,
      })),
    }).success).toBe(false);
  });

  it("rejects blank or one-character searches", () => {
    expect(atlasSearchResponseSchema.safeParse({
      state: "available",
      query: "n",
      neighborhoodReferenceStatus: "available",
      results: [],
    }).success).toBe(false);
  });
});

describe("atlasResponseSchema", () => {
  it("accepts an available validated preview with canonical GeoJSON", () => {
    const response = atlasResponseSchema.parse({
      state: "available",
      mode: "validated_preview",
      run,
      tracts: {type: "FeatureCollection", features: [feature]},
      contextLayers: {foodSites},
    });

    expect(response.state).toBe("available");
    if (response.state === "available") {
      expect(response.tracts.features[0]?.id).toBe("55079000101");
    }
  });

  it("requires immutable publication identity for published mode", () => {
    const publishedRun = {
      ...run,
      publication: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        publishedAt: "2026-09-01T12:00:00.000Z",
        bundleFingerprint: "f".repeat(64),
      },
    };
    expect(atlasResponseSchema.safeParse({
      state: "available",
      mode: "published",
      run: publishedRun,
      tracts: {type: "FeatureCollection", features: [feature]},
      contextLayers: {foodSites},
    }).success).toBe(true);
    expect(atlasResponseSchema.safeParse({
      state: "available",
      mode: "published",
      run,
      tracts: {type: "FeatureCollection", features: [feature]},
      contextLayers: {foodSites},
    }).success).toBe(false);
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
      contextLayers: {foodSites},
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
      contextLayers: {foodSites},
      tracts: {type: "FeatureCollection", features: [feature, feature]},
    })).toThrow();
  });

  it("rejects operational fields instead of leaking them to the browser", () => {
    expect(() => atlasResponseSchema.parse({
      state: "available",
      mode: "validated_preview",
      run: {...run, storageUri: "s3://private/source.zip"},
      contextLayers: {foodSites},
      tracts: {type: "FeatureCollection", features: [feature]},
    })).toThrow();
  });

  it("keeps source-listed food sites separate from the score run and rejects count drift", () => {
    const response = atlasResponseSchema.parse({
      state: "available",
      mode: "validated_preview",
      run,
      tracts: {type: "FeatureCollection", features: [feature]},
      contextLayers: {foodSites},
    });
    expect(response.state).toBe("available");
    if (response.state === "available" && response.contextLayers.foodSites.state === "available") {
      expect(response.contextLayers.foodSites.affectsScores).toBe(false);
      expect(response.contextLayers.foodSites.scoreRunRelationship)
        .toBe("display_context_only_not_part_of_score_run");
    }

    expect(() => atlasResponseSchema.parse({
      state: "available",
      mode: "validated_preview",
      run,
      tracts: {type: "FeatureCollection", features: [feature]},
      contextLayers: {
        foodSites: {...foodSites, source: {...foodSites.source, featureCount: 2}},
      },
    })).toThrow();
  });
});

describe("atlasNeighborhoodContextSchema", () => {
  const source = {
    sourceName: "Milwaukee Neighborhood Identification Project",
    publisher: "City of Milwaukee Department of City Development",
    datasetVersion: "2000 reference; catalog updated January 2007",
    sourceUrl: "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/AGO/neighborhoods/MapServer/0",
    retrievedAt: "2026-08-30T12:00:00.000Z",
    validFrom: null,
    validTo: null,
    methodologyUrl: "https://city.milwaukee.gov/mapmilwaukee/DownloadMapData3497",
    limitation: "This is a City-published reference, not an official boundary.",
  } as const;

  it.each([
    ["mostly_in", 0.9, [{sourceNeighborhoodId: 1, name: "Example", coveredAreaShare: 0.7}]],
    ["spans", 0.9, [
      {sourceNeighborhoodId: 1, name: "North", coveredAreaShare: 0.49},
      {sourceNeighborhoodId: 2, name: "South", coveredAreaShare: 0.48},
    ]],
    ["partly_covered", 0.4, [{sourceNeighborhoodId: 1, name: "Edge", coveredAreaShare: 1}]],
    ["no_reference", 0, []],
  ] as const)("accepts the deterministic %s state", (labelKind, coverage, overlaps) => {
    const parsed = atlasNeighborhoodContextSchema.parse({
      state: "available",
      labelKind,
      cityReferenceCoverage: coverage,
      overlaps,
      otherBoundarySliversShare: 0,
      source,
      limitation: "Area shares describe only the tract portion covered by the City reference.",
    });
    expect(parsed.state).toBe("available");
    if (parsed.state === "available") {
      expect(parsed.labelKind).toBe(labelKind);
    }
  });

  it("rejects a mostly-in label without majority coverage and a majority overlap", () => {
    expect(() => atlasNeighborhoodContextSchema.parse({
      state: "available",
      labelKind: "mostly_in",
      cityReferenceCoverage: 0.4,
      overlaps: [{sourceNeighborhoodId: 1, name: "Example", coveredAreaShare: 0.4}],
      otherBoundarySliversShare: 0,
      source,
      limitation: "Area shares describe only the tract portion covered by the City reference.",
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
      confidenceLevel: null,
      reliability: null,
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
    neighborhoodContext: {state: "unavailable", reason: "snapshot_not_configured"},
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

  it("requires an ACS reliability label to carry its 90% margin and range", () => {
    expect(() => atlasTractProfileSchema.parse({
      ...completeProfile,
      foodComponents: [{
        ...evidence[0],
        measurement: {
          ...evidence[0]!.measurement,
          reliability: "use_with_caution",
        },
      }, ...evidence.slice(1)],
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
