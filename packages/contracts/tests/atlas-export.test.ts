import {describe, expect, it} from "vitest";
import {
  equityIndicatorSlugs,
  foodMetricSlugs,
  tractEvidenceColumnRegistry,
  tractEvidenceCsvHeaders,
  tractEvidenceExportSchema,
} from "../src/atlas";

const hash = (character: string) => character.repeat(64);

function measurement() {
  return {
    state: "observed" as const,
    value: 0,
    unit: "percent",
    qualityStatus: "verified" as const,
    marginOfError: 1.2,
    confidenceLow: 0,
    confidenceHigh: 1.2,
    confidenceLevel: 90 as const,
    reliability: "reliable" as const,
  };
}

function metric(slug: string) {
  return {
    slug,
    name: slug.replaceAll("_", " "),
    definition: `Definition for ${slug}.`,
    dataYear: "2024",
    measurement: measurement(),
    countyPercentile: 50,
    effectiveWeight: 0.1,
    contribution: 0,
    higherIsWorse: true,
    limitation: "Tract-level evidence does not describe every resident.",
  };
}

function row(index: number) {
  const geoid = String(index + 1).padStart(11, "0");
  return {
    geoid,
    name: `Census Tract ${geoid}`,
    population: 100,
    populationState: "observed",
    geographyVintage: "2020 Census tract",
    neighborhood: {
      state: "available",
      labelKind: "mostly_in",
      cityReferenceCoverage: 1,
      overlaps: [{
        sourceNeighborhoodId: 1,
        name: "Example neighborhood",
        coveredAreaShare: 1,
      }],
      otherBoundarySliversShare: 0,
      source: {
        sourceName: "City of Milwaukee neighborhoods",
        publisher: "City of Milwaukee",
        datasetVersion: "2026-01",
        sourceUrl: "https://example.gov/neighborhoods",
        retrievedAt: "2026-09-02T12:00:00.000Z",
        validFrom: null,
        validTo: null,
        methodologyUrl: null,
        limitation: "City-reference boundaries can overlap a tract.",
      },
      limitation: "Neighborhood coverage is area-based, not population-based.",
    },
    equityIndicators: equityIndicatorSlugs.map(metric),
    equityResults: {
      demographicSubindex: 20,
      socioeconomicSubindex: 30,
      healthSubindex: 40,
      compositeScore: 31,
      percentile: 45,
      band: "moderate",
      qualityStatus: "complete",
      exclusionReasons: [],
    },
    foodMetrics: foodMetricSlugs.map(metric),
    foodResults: {
      retailAccessScore: 20,
      transportationConstraintScore: 30,
      foodAccessNeedScore: 25,
      foodAccessNeedPercentile: 55,
      foodAccessNeedBand: "moderate",
      foodEquityPriority: 3,
      qualityStatus: "complete",
      exclusionReasons: [],
    },
  };
}

function exportPayload() {
  return {
    schemaVersion: "mke-tract-evidence-csv-v1",
    publication: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      publishedAt: "2026-09-02T12:00:00.000Z",
      bundleFingerprint: hash("a"),
    },
    foodRun: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      methodologyVersion: "food-equity-v1",
      outputHash: hash("b"),
      dataVintages: {food: "2024"},
    },
    equityBaselineRun: {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      methodologyVersion: "equity-baseline-v1",
      outputHash: hash("c"),
      dataVintages: {equity: "2024"},
    },
    rows: Array.from({length: 302}, (_, index) => row(index)),
  };
}

describe("tract evidence export contract", () => {
  it("defines the approved fixed Equity and Food metric families", () => {
    expect(equityIndicatorSlugs).toEqual([
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
    ]);
    expect(foodMetricSlugs).toEqual([
      "sram_snap_low_access_share_1mi",
      "full_service_grocery_walk_access",
      "households_no_vehicle",
      "scheduled_transit_service_intensity",
    ]);
  });

  it("defines a fixed, safe, wide CSV header registry", () => {
    expect(tractEvidenceCsvHeaders).toEqual(tractEvidenceColumnRegistry.map((column) => column.id));
    expect(new Set(tractEvidenceCsvHeaders).size).toBe(tractEvidenceCsvHeaders.length);
    expect(tractEvidenceCsvHeaders.every((header) => /^[a-z][a-z0-9_]*$/.test(header))).toBe(true);
    expect(tractEvidenceCsvHeaders).toContain("geoid");
    expect(tractEvidenceCsvHeaders).toContain("neighborhood_overlaps_json");
    expect(tractEvidenceCsvHeaders).toContain("housing_cost_burden_margin_of_error");
    expect(tractEvidenceCsvHeaders).toContain("scheduled_transit_service_intensity_value_state");
    expect(tractEvidenceCsvHeaders).toContain("publication_id");
    expect(tractEvidenceCsvHeaders).not.toContain("geometry");
    expect(tractEvidenceCsvHeaders).not.toContain("latitude");
    expect(tractEvidenceCsvHeaders).not.toContain("zip_code");
  });

  it("accepts exactly 302 ordered canonical tracts with complete metric families", () => {
    expect(tractEvidenceExportSchema.parse(exportPayload()).rows).toHaveLength(302);
  });

  it("rejects an incomplete, duplicated, unordered, or unknown export", () => {
    const payload = exportPayload();
    expect(tractEvidenceExportSchema.safeParse({...payload, rows: payload.rows.slice(0, 301)}).success)
      .toBe(false);
    expect(tractEvidenceExportSchema.safeParse({
      ...payload,
      rows: [payload.rows[1]!, payload.rows[0]!, ...payload.rows.slice(2)],
    }).success).toBe(false);
    expect(tractEvidenceExportSchema.safeParse({
      ...payload,
      rows: [{...payload.rows[0], equityIndicators: payload.rows[0]!.equityIndicators.slice(1)}, ...payload.rows.slice(1)],
    }).success).toBe(false);
    expect(tractEvidenceExportSchema.safeParse({
      ...payload,
      rawDatabaseUrl: "postgresql://not-allowed@example.test/data",
    }).success).toBe(false);
  });
});
