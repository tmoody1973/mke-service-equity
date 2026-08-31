import type {
  CompareAvailableResponse,
  ComparisonMetric,
  ComparisonTract,
} from "@mke/contracts";

import {
  formatMeasurement,
  ordinal,
  qualityLabel,
  RELIABILITY_PRESENTATION,
} from "../atlas/profile/evidence-presentation";
import {explainPriorityLevel} from "../atlas/tract-summary";
import {COMPARISON_FOOD_METRICS} from "./comparison-metric-registry";

export type ComparisonSummaryCell = {
  primary: string;
  qualityLabel: string | null;
  reliabilityLabel: string | null;
  secondary: string | null;
  tractGeoid: string;
  tractName: string;
};

export type ComparisonSummaryRow = {
  cells: Array<ComparisonSummaryCell>;
  id: string;
  label: string;
};

function bandLabel(value: string): string {
  const words = value.replaceAll("_", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} band`;
}

function unavailableReason(tract: ComparisonTract): string {
  return tract.tract.qualityStatus === "ineligible_zero_population"
    ? "no recorded population"
    : "insufficient data";
}

function baseCell(tract: ComparisonTract): Pick<
  ComparisonSummaryCell,
  "tractGeoid" | "tractName"
> {
  return {tractGeoid: tract.tract.geoid, tractName: tract.tract.name};
}

function summaryCell(
  tract: ComparisonTract,
  primary: string,
  secondary: string | null = null,
  quality: string | null = null,
  reliability: string | null = null,
): ComparisonSummaryCell {
  return {
    ...baseCell(tract),
    primary,
    secondary,
    qualityLabel: quality,
    reliabilityLabel: reliability,
  };
}

export function metricFor(
  tract: ComparisonTract,
  category: "food_access" | "equity_baseline",
  slug: string,
): ComparisonMetric | undefined {
  const metrics = category === "food_access"
    ? tract.foodAccessMeasures
    : tract.equityIndicators;
  return metrics.find((metric) => metric.slug === slug);
}

function metricCell(tract: ComparisonTract, slug: string): ComparisonSummaryCell {
  const metric = metricFor(tract, "food_access", slug);
  if (!metric) {
    return summaryCell(tract, `Not available — ${unavailableReason(tract)}`);
  }
  const reliability = metric.measurement.state === "observed"
    && metric.measurement.reliability !== null
    ? RELIABILITY_PRESENTATION[metric.measurement.reliability].label
    : null;
  return summaryCell(
    tract,
    formatMeasurement(metric.measurement),
    metric.measurement.state === "observed"
      ? `${ordinal(metric.countyPercentile)} county percentile`
      : null,
    qualityLabel(metric.measurement.qualityStatus),
    reliability,
  );
}

export function buildComparisonSummaryRows(
  comparison: CompareAvailableResponse,
): Array<ComparisonSummaryRow> {
  const population: ComparisonSummaryRow = {
    id: "population",
    label: "Population",
    cells: comparison.tracts.map((tract) => summaryCell(
      tract,
      tract.tract.population === null
        ? "Population unavailable"
        : new Intl.NumberFormat("en-US").format(tract.tract.population),
    )),
  };
  const priority: ComparisonSummaryRow = {
    id: "priority",
    label: "Food Equity Priority",
    cells: comparison.tracts.map((tract) => tract.tract.foodEquityPriority === null
      ? summaryCell(tract, `Not scored — ${unavailableReason(tract)}`)
      : summaryCell(
          tract,
          `Priority ${tract.tract.foodEquityPriority}`,
          explainPriorityLevel(tract.tract.foodEquityPriority),
          "Complete data",
        )),
  };
  const equity: ComparisonSummaryRow = {
    id: "equity_baseline",
    label: "Equity Baseline",
    cells: comparison.tracts.map((tract) => tract.tract.equityBaselineBand === null
      || tract.scores.equityBaselinePercentile === null
      ? summaryCell(tract, `Not available — ${unavailableReason(tract)}`)
      : summaryCell(
          tract,
          bandLabel(tract.tract.equityBaselineBand),
          `${ordinal(tract.scores.equityBaselinePercentile)} county percentile`,
        )),
  };
  const food: ComparisonSummaryRow = {
    id: "food_access_need",
    label: "Food Access Need",
    cells: comparison.tracts.map((tract) => tract.tract.foodAccessNeedBand === null
      || tract.scores.foodAccessNeedPercentile === null
      ? summaryCell(tract, `Not available — ${unavailableReason(tract)}`)
      : summaryCell(
          tract,
          bandLabel(tract.tract.foodAccessNeedBand),
          `${ordinal(tract.scores.foodAccessNeedPercentile)} county percentile`,
        )),
  };
  return [
    population,
    priority,
    equity,
    food,
    ...COMPARISON_FOOD_METRICS.map(({label, slug}) => ({
      id: `metric:${slug}`,
      label,
      cells: comparison.tracts.map((tract) => metricCell(tract, slug)),
    })),
  ];
}
