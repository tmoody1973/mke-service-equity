import type {
  AtlasMeasurement,
  CompareAvailableResponse,
  ComparisonMetric,
  ComparisonTract,
} from "@mke/contracts";

const RUN_ID = "97bd1cdf-bf96-573f-8fcf-92e8676925d4";
const SOURCE_ID = "source:test";

export const FOOD_METRIC_FIXTURES = [
  ["sram_snap_low_access_share_1mi", "Residents beyond one driving mile from a SNAP-authorized retailer", "percent"],
  ["full_service_grocery_walk_access", "Walk to the nearest full-service grocery", "minutes"],
  ["households_no_vehicle", "Households with no vehicle available", "percent"],
  ["scheduled_transit_service_intensity", "Scheduled transit service within a ten-minute walk", "unique_trips_per_hour"],
] as const;

export const EQUITY_METRIC_FIXTURES = [
  ["people_of_color", "People of color", "demographic"],
  ["limited_english_proficiency", "Speaks English less than ‘very well,’ age 5+", "demographic"],
  ["foreign_born", "Foreign born", "demographic"],
  ["below_200_percent_fpl", "Population below 200 percent of the federal poverty level", "socioeconomic"],
  ["unemployment", "Unemployment", "socioeconomic"],
  ["less_than_high_school", "Less than high school education", "socioeconomic"],
  ["housing_cost_burden", "Housing cost burden", "socioeconomic"],
  ["diagnosed_diabetes", "Diagnosed diabetes", "health"],
  ["obesity", "Obesity", "health"],
  ["current_asthma", "Current asthma", "health"],
  ["any_disability", "Any disability", "health"],
  ["frequent_mental_distress", "Frequent mental distress", "health"],
  ["no_leisure_time_physical_activity", "No leisure-time physical activity", "health"],
] as const;

type MetricSlug = typeof FOOD_METRIC_FIXTURES[number][0]
  | typeof EQUITY_METRIC_FIXTURES[number][0];

type MetricOverride = {
  measurement?: AtlasMeasurement;
  value?: number;
};

export function observedMeasurement({
  reliability = "reliable",
  unit = "percent",
  value = 25,
}: {
  reliability?: "reliable" | "use_with_caution" | "high_uncertainty" | "cv_not_computable" | null;
  unit?: string;
  value?: number;
} = {}): AtlasMeasurement {
  return {
    state: "observed",
    value,
    unit,
    qualityStatus: "verified",
    marginOfError: reliability === null ? null : 5,
    confidenceLow: reliability === null ? null : Math.max(0, value - 5),
    confidenceHigh: reliability === null ? null : Math.min(100, value + 5),
    confidenceLevel: reliability === null ? null : 90,
    reliability,
  };
}

function metric(
  category: "food_access" | "equity_baseline",
  slug: MetricSlug,
  name: string,
  domain: string,
  unit: string,
  tractIndex: number,
  override?: MetricOverride,
): ComparisonMetric {
  const value = override?.value ?? 20 + tractIndex;
  return {
    category,
    slug,
    name,
    definition: slug === "limited_english_proficiency"
      ? "Share of people age 5 and older who report speaking English less than ‘very well.’ This measures English-language access, not literacy."
      : `Approved definition for ${name}.`,
    domain,
    dataYear: "2024 ACS 5-year",
    measurement: override?.measurement ?? observedMeasurement({unit, value}),
    countyPercentile: 60 + tractIndex,
    contribution: category === "equity_baseline" ? 1.2 : 2.1,
    higherIsWorse: slug !== "scheduled_transit_service_intensity",
    sourceIds: [SOURCE_ID],
    limitation: `Approved limitation for ${name}.`,
  } as ComparisonMetric;
}

export function completeComparisonTract({
  geoid,
  index,
  metricOverrides = {},
  name,
  population = 2_000 + index,
}: {
  geoid: string;
  index: number;
  metricOverrides?: Partial<Record<MetricSlug, MetricOverride>>;
  name: string;
  population?: number | null;
}): ComparisonTract {
  return {
    runId: RUN_ID,
    tract: {
      geoid,
      name,
      population,
      geographyVintage: "2020 TIGER/Line",
      foodEquityPriority: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      foodAccessNeedBand: index % 2 === 0 ? "high" : "moderate",
      equityBaselineBand: index % 2 === 0 ? "very_high" : "moderate",
      qualityStatus: "complete",
      exclusionReasons: [],
    },
    scores: {
      foodAccessNeedPercentile: 80 - index,
      equityBaselinePercentile: 70 - index,
      retailAccessScore: 75 - index,
      transportationConstraintScore: 65 - index,
    },
    foodAccessMeasures: FOOD_METRIC_FIXTURES.map(([slug, nameValue, unit]) => metric(
      "food_access",
      slug,
      nameValue,
      slug === "households_no_vehicle" || slug === "scheduled_transit_service_intensity"
        ? "transportation_constraint"
        : "retail_access",
      unit,
      index,
      metricOverrides[slug],
    )) as ComparisonTract["foodAccessMeasures"],
    equityIndicators: EQUITY_METRIC_FIXTURES.map(([slug, nameValue, domain]) => metric(
      "equity_baseline",
      slug,
      nameValue,
      domain,
      "percent",
      index,
      metricOverrides[slug],
    )) as ComparisonTract["equityIndicators"],
  };
}

export function insufficientComparisonTract({
  geoid,
  name,
  population = 1_100,
}: {
  geoid: string;
  name: string;
  population?: number | null;
}): ComparisonTract {
  return {
    runId: RUN_ID,
    tract: {
      geoid,
      name,
      population,
      geographyVintage: "2020 TIGER/Line",
      foodEquityPriority: null,
      foodAccessNeedBand: null,
      equityBaselineBand: "high",
      qualityStatus: "insufficient_data",
      exclusionReasons: ["origin_unsnapped"],
    },
    scores: {
      foodAccessNeedPercentile: null,
      equityBaselinePercentile: 72,
      retailAccessScore: null,
      transportationConstraintScore: null,
    },
    foodAccessMeasures: [],
    equityIndicators: [],
  };
}

export function zeroPopulationComparisonTract({
  geoid,
  name,
}: {
  geoid: string;
  name: string;
}): ComparisonTract {
  return {
    runId: RUN_ID,
    tract: {
      geoid,
      name,
      population: 0,
      geographyVintage: "2020 TIGER/Line",
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

export function makeComparison(
  tracts: Array<ComparisonTract> = [
    completeComparisonTract({geoid: "55079000101", index: 0, name: "Census Tract 1.01"}),
    completeComparisonTract({geoid: "55079000200", index: 1, name: "Census Tract 2"}),
  ],
): CompareAvailableResponse {
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
        sourceName: "American Community Survey 5-year estimates",
        publisher: "U.S. Census Bureau",
        datasetVersion: "2024 ACS 5-year",
        sourceUrl: "https://api.census.gov/data/2024/acs/acs5",
        retrievedAt: "2026-08-29T12:00:00.000Z",
        validFrom: null,
        validTo: null,
        methodologyUrl: "https://www.census.gov/programs-surveys/acs/methodology.html",
        limitation: null,
      },
    }],
  };
}
