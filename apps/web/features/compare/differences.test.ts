import type {
  AtlasMeasurement,
  CompareAvailableResponse,
  ComparisonMetric,
  ComparisonTract,
} from "@mke/contracts";
import {describe, expect, it} from "vitest";

import {buildDifferences} from "./differences";

const RUN_ID = "97bd1cdf-bf96-573f-8fcf-92e8676925d4";
const SOURCE_ID = "source:test";

const FOOD_METRICS = [
  ["sram_snap_low_access_share_1mi", "Residents beyond one driving mile from a SNAP-authorized retailer"],
  ["full_service_grocery_walk_access", "Walk to the nearest full-service grocery"],
  ["households_no_vehicle", "Households with no vehicle available"],
  ["scheduled_transit_service_intensity", "Scheduled transit service within a ten-minute walk"],
] as const;

const EQUITY_METRICS = [
  ["people_of_color", "People of color"],
  ["limited_english_proficiency", "Speaks English less than ‘very well,’ age 5+"],
  ["foreign_born", "Foreign born"],
  ["below_200_percent_fpl", "Population below 200 percent of the federal poverty level"],
  ["unemployment", "Unemployment"],
  ["less_than_high_school", "Less than high school education"],
  ["housing_cost_burden", "Housing cost burden"],
  ["diagnosed_diabetes", "Diagnosed diabetes"],
  ["obesity", "Obesity"],
  ["current_asthma", "Current asthma"],
  ["any_disability", "Any disability"],
  ["frequent_mental_distress", "Frequent mental distress"],
  ["no_leisure_time_physical_activity", "No leisure-time physical activity"],
] as const;

type MetricSlug = typeof FOOD_METRICS[number][0] | typeof EQUITY_METRICS[number][0];

type MetricOverride = {
  contribution?: number;
  countyPercentile?: number;
  measurement?: AtlasMeasurement;
};

function observedMeasurement(
  reliability: "reliable" | "use_with_caution" | "high_uncertainty" | "cv_not_computable" | null = "reliable",
): AtlasMeasurement {
  return {
    state: "observed",
    value: 50,
    unit: "percent",
    qualityStatus: "verified",
    marginOfError: reliability === null ? null : 5,
    confidenceLow: reliability === null ? null : 45,
    confidenceHigh: reliability === null ? null : 55,
    confidenceLevel: reliability === null ? null : 90,
    reliability,
  };
}

function unavailableMeasurement(
  state: "unreachable" | "missing" | "suppressed" | "conflicting",
): AtlasMeasurement {
  if (state === "unreachable") {
    return {state, value: null, unit: "minutes", qualityStatus: "verified"};
  }
  if (state === "missing") {
    return {state, value: null, unit: "percent", qualityStatus: "missing"};
  }
  if (state === "suppressed") {
    return {state, value: null, unit: "percent", qualityStatus: "suppressed"};
  }
  return {state, value: null, unit: "percent", qualityStatus: "conflicting"};
}

function metric(
  category: "food_access" | "equity_baseline",
  slug: MetricSlug,
  name: string,
  override: MetricOverride = {},
): ComparisonMetric {
  return {
    category,
    slug,
    name,
    definition: `Approved definition for ${name}.`,
    domain: category === "food_access" ? "food_access" : "equity_baseline",
    dataYear: "2024",
    measurement: override.measurement ?? observedMeasurement(),
    countyPercentile: override.countyPercentile ?? 50,
    contribution: override.contribution ?? 0,
    higherIsWorse: true,
    sourceIds: [SOURCE_ID],
    limitation: null,
  } as ComparisonMetric;
}

function completeTract({
  foodBand = "moderate",
  geoid,
  metricOverrides = {},
  name,
  priority = 3,
  equityBand = "moderate",
}: {
  equityBand?: "very_low" | "low" | "moderate" | "high" | "very_high";
  foodBand?: "very_low" | "low" | "moderate" | "high" | "very_high";
  geoid: string;
  metricOverrides?: Partial<Record<MetricSlug, MetricOverride>>;
  name: string;
  priority?: 1 | 2 | 3 | 4 | 5;
}): ComparisonTract {
  return {
    runId: RUN_ID,
    tract: {
      geoid,
      name,
      population: 2_000,
      geographyVintage: "2020",
      foodEquityPriority: priority,
      foodAccessNeedBand: foodBand,
      equityBaselineBand: equityBand,
      qualityStatus: "complete",
      exclusionReasons: [],
    },
    scores: {
      foodAccessNeedPercentile: 50,
      equityBaselinePercentile: 50,
      retailAccessScore: 50,
      transportationConstraintScore: 50,
    },
    foodAccessMeasures: FOOD_METRICS.map(([slug, metricName]) => metric(
      "food_access",
      slug,
      metricName,
      metricOverrides[slug],
    )) as ComparisonTract["foodAccessMeasures"],
    equityIndicators: EQUITY_METRICS.map(([slug, metricName]) => metric(
      "equity_baseline",
      slug,
      metricName,
      metricOverrides[slug],
    )) as ComparisonTract["equityIndicators"],
  };
}

function unavailableTract(geoid: string, name: string): ComparisonTract {
  return {
    runId: RUN_ID,
    tract: {
      geoid,
      name,
      population: 0,
      geographyVintage: "2020",
      foodEquityPriority: null,
      foodAccessNeedBand: null,
      equityBaselineBand: null,
      qualityStatus: "ineligible_zero_population",
      exclusionReasons: ["zero_population"],
    },
    scores: {
      foodAccessNeedPercentile: null,
      equityBaselinePercentile: null,
      retailAccessScore: null,
      transportationConstraintScore: null,
    },
    foodAccessMeasures: [],
    equityIndicators: [],
  };
}

function comparison(tracts: Array<ComparisonTract>): CompareAvailableResponse {
  return {
    state: "available",
    mode: "validated_preview",
    run: {
      id: RUN_ID,
      methodologyVersion: "food-equity-v1",
      equityBaselineMethodologyVersion: "equity-baseline-v1",
      completedAt: "2026-08-30T12:00:00.000Z",
      dataVintages: {acs: "2024 ACS 5-year"},
    },
    request: {tracts: tracts.map((tract) => tract.tract.geoid)},
    tracts,
    sources: [{
      id: SOURCE_ID,
      source: {
        sourceName: "Test source",
        publisher: "Test publisher",
        datasetVersion: "Test version",
        sourceUrl: "https://example.test/source",
        retrievedAt: "2026-08-30T12:00:00.000Z",
        validFrom: null,
        validTo: null,
        methodologyUrl: null,
        limitation: null,
      },
    }],
  };
}

describe("buildDifferences", () => {
  it("uses fixed category order, includes the exact 20-point threshold, and discloses unavailable tracts", () => {
    const result = buildDifferences(comparison([
      completeTract({
        geoid: "55079000101",
        name: "Census Tract 1.01",
        priority: 1,
        equityBand: "high",
        foodBand: "very_high",
        metricOverrides: {
          housing_cost_burden: {countyPercentile: 80},
          unemployment: {countyPercentile: 69.9},
        },
      }),
      completeTract({
        geoid: "55079000200",
        name: "Census Tract 2",
        priority: 3,
        equityBand: "moderate",
        foodBand: "high",
        metricOverrides: {
          housing_cost_burden: {countyPercentile: 60},
          unemployment: {countyPercentile: 50},
        },
      }),
      unavailableTract("55079000300", "Census Tract 3"),
    ]));

    expect(result.items).toEqual([
      {
        id: "priority",
        kind: "priority",
        title: "Priority levels differ",
        statement: "These tracts fall in different Priority levels: Census Tract 1.01 is Priority 1; Census Tract 2 is Priority 3.",
        missingEvidence: "Priority is not available for Census Tract 3. Missing information was not counted as zero.",
        uncertaintyCaution: null,
      },
      {
        id: "equity_baseline_band",
        kind: "equity_baseline_band",
        title: "Equity Baseline bands differ",
        statement: "These tracts fall in different Equity Baseline bands: Census Tract 1.01 is High; Census Tract 2 is Moderate.",
        missingEvidence: "Equity Baseline band is not available for Census Tract 3. Missing information was not counted as zero.",
        uncertaintyCaution: null,
      },
      {
        id: "food_access_need_band",
        kind: "food_access_need_band",
        title: "Food Access Need bands differ",
        statement: "These tracts fall in different Food Access Need bands: Census Tract 1.01 is Very high; Census Tract 2 is High.",
        missingEvidence: "Food Access Need band is not available for Census Tract 3. Missing information was not counted as zero.",
        uncertaintyCaution: null,
      },
      {
        id: "metric:housing_cost_burden",
        kind: "metric",
        title: "Housing cost burden",
        statement: "The county-percentile range for Housing cost burden is 20.0 points. County percentiles: Census Tract 1.01, 80.0; Census Tract 2, 60.0.",
        missingEvidence: "Not included in this range: Census Tract 3 (comparison evidence unavailable). Missing information was not counted as zero.",
        uncertaintyCaution: null,
      },
    ]);
    expect(result.emptyStatement).toBeNull();
    expect(result.insufficientComparisons).toEqual([]);
    expect(result.items.map((item) => item.id)).not.toContain("metric:unemployment");
  });

  it("orders metric gaps deterministically, uses display order for ties, caps at five, and ignores contribution magnitude", () => {
    const firstOverrides: Partial<Record<MetricSlug, MetricOverride>> = {
      sram_snap_low_access_share_1mi: {countyPercentile: 90, contribution: 0},
      full_service_grocery_walk_access: {countyPercentile: 90, contribution: 1},
      households_no_vehicle: {countyPercentile: 85, contribution: 2},
      scheduled_transit_service_intensity: {countyPercentile: 80, contribution: 3},
      people_of_color: {countyPercentile: 75, contribution: 999},
      limited_english_proficiency: {countyPercentile: 74, contribution: 1_000},
    };
    const result = buildDifferences(comparison([
      completeTract({geoid: "55079000101", name: "Census Tract 1.01", metricOverrides: firstOverrides}),
      completeTract({geoid: "55079000200", name: "Census Tract 2"}),
    ]));

    expect(result.items.map((item) => item.id)).toEqual([
      "metric:sram_snap_low_access_share_1mi",
      "metric:full_service_grocery_walk_access",
      "metric:households_no_vehicle",
      "metric:scheduled_transit_service_intensity",
      "metric:people_of_color",
    ]);
    expect(result.items).toHaveLength(5);
  });

  it.each([
    ["unreachable", "no walking route found on the approved network"],
    ["missing", "data unavailable"],
    ["suppressed", "the source withheld this value"],
    ["conflicting", "the available sources disagree"],
  ] as const)("excludes %s evidence from a numeric claim and names its state", (state, label) => {
    const result = buildDifferences(comparison([
      completeTract({
        geoid: "55079000101",
        name: "Census Tract 1.01",
        metricOverrides: {housing_cost_burden: {countyPercentile: 90}},
      }),
      completeTract({
        geoid: "55079000200",
        name: "Census Tract 2",
        metricOverrides: {housing_cost_burden: {countyPercentile: 60}},
      }),
      completeTract({
        geoid: "55079000300",
        name: "Census Tract 3",
        metricOverrides: {
          housing_cost_burden: {
            countyPercentile: 100,
            measurement: unavailableMeasurement(state),
          },
        },
      }),
    ]));

    expect(result.items.find((item) => item.id === "metric:housing_cost_burden")?.missingEvidence)
      .toBe(`Not included in this range: Census Tract 3 (${label}). Missing information was not counted as zero.`);
    expect(result.items.find((item) => item.id === "metric:housing_cost_burden")?.statement)
      .toContain("30.0 points");
  });

  it.each([
    ["use_with_caution", "Use with caution"],
    ["high_uncertainty", "High uncertainty"],
    ["cv_not_computable", "Reliability unclear"],
  ] as const)("carries the stored %s Census caution into the percentile explanation", (reliability, label) => {
    const result = buildDifferences(comparison([
      completeTract({
        geoid: "55079000101",
        name: "Census Tract 1.01",
        metricOverrides: {
          housing_cost_burden: {
            countyPercentile: 90,
            measurement: observedMeasurement(reliability),
          },
        },
      }),
      completeTract({
        geoid: "55079000200",
        name: "Census Tract 2",
        metricOverrides: {housing_cost_burden: {countyPercentile: 60}},
      }),
    ]));

    expect(result.items.find((item) => item.id === "metric:housing_cost_burden")?.uncertaintyCaution)
      .toBe(`Use caution: Census Tract 1.01 is marked “${label}.” Its county percentile has the same survey uncertainty. Read this tract’s estimate range before using this difference.`);
  });

  it("identifies measures with fewer than two observed values", () => {
    const result = buildDifferences(comparison([
      completeTract({
        geoid: "55079000101",
        name: "Census Tract 1.01",
        metricOverrides: {current_asthma: {countyPercentile: 80}},
      }),
      completeTract({
        geoid: "55079000200",
        name: "Census Tract 2",
        metricOverrides: {current_asthma: {measurement: unavailableMeasurement("missing")}},
      }),
      completeTract({
        geoid: "55079000300",
        name: "Census Tract 3",
        metricOverrides: {current_asthma: {measurement: unavailableMeasurement("suppressed")}},
      }),
    ]));

    expect(result.insufficientComparisons).toEqual([{
      id: "metric:current_asthma",
      label: "Current asthma",
      availableTractCount: 1,
      requiredTractCount: 2,
    }]);
    expect(result.items.map((item) => item.id)).not.toContain("metric:current_asthma");
  });

  it("does not call sub-threshold tracts the same and uses no ranking or recommendation language", () => {
    const result = buildDifferences(comparison([
      completeTract({
        geoid: "55079000101",
        name: "Census Tract 1.01",
        metricOverrides: {housing_cost_burden: {countyPercentile: 69.9}},
      }),
      completeTract({geoid: "55079000200", name: "Census Tract 2"}),
    ]));
    const serialized = JSON.stringify(result);

    expect(result.items).toEqual([]);
    expect(result.emptyStatement).toBe(
      "No large differences were found under these rules. This does not mean the tracts are the same.",
    );
    expect(serialized).not.toMatch(/\b(better|worse|deserving|recommended|recommendation|winner|should)\b/i);
  });

  it("is byte-for-byte stable when repository metric rows arrive in a different order", () => {
    const original = comparison([
      completeTract({
        geoid: "55079000101",
        name: "Census Tract 1.01",
        metricOverrides: {
          housing_cost_burden: {countyPercentile: 90},
          people_of_color: {countyPercentile: 80},
        },
      }),
      completeTract({geoid: "55079000200", name: "Census Tract 2"}),
    ]);
    const reordered = {
      ...original,
      tracts: original.tracts.map((tract) => ({
        ...tract,
        foodAccessMeasures: [...tract.foodAccessMeasures].reverse(),
        equityIndicators: [...tract.equityIndicators].reverse(),
      })),
    };

    expect(JSON.stringify(buildDifferences(reordered)))
      .toBe(JSON.stringify(buildDifferences(original)));
  });
});
