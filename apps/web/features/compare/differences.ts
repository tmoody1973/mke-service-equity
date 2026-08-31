import type {
  CompareAvailableResponse,
  ComparisonMetric,
  ComparisonTract,
} from "@mke/contracts";
import {COMPARISON_METRIC_PRESENTATION_ORDER} from "./comparison-metric-registry";

const MINIMUM_PERCENTILE_GAP = 20;
const MAXIMUM_DIFFERENCES = 5;

type DifferenceKind = "priority" | "equity_baseline_band" | "food_access_need_band" | "metric";

export type DifferenceItem = {
  id: string;
  kind: DifferenceKind;
  missingEvidence: string | null;
  statement: string;
  title: string;
  uncertaintyCaution: string | null;
};

export type InsufficientComparison = {
  availableTractCount: number;
  id: string;
  label: string;
  requiredTractCount: 2;
};

export type DifferencesSummary = {
  emptyStatement: string | null;
  insufficientComparisons: Array<InsufficientComparison>;
  items: Array<DifferenceItem>;
};

type CategoricalValue = {
  name: string;
  value: number | string;
};

type NumericCandidate = {
  gap: number;
  item: DifferenceItem;
  order: number;
  slug: string;
};

function formatBand(value: string): string {
  const words = value.replaceAll("_", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function formatNumber(value: number): string {
  return value.toFixed(1);
}

function categoricalDifference({
  available,
  id,
  kind,
  missingNames,
  missingSubject,
  statementLead,
  title,
  valueLabel,
}: {
  available: Array<CategoricalValue>;
  id: string;
  kind: Exclude<DifferenceKind, "metric">;
  missingNames: Array<string>;
  missingSubject: string;
  statementLead: string;
  title: string;
  valueLabel: (value: number | string) => string;
}): DifferenceItem | null {
  if (available.length < 2 || new Set(available.map(({value}) => value)).size < 2) {
    return null;
  }

  const details = available
    .map(({name, value}) => `${name} is ${valueLabel(value)}`)
    .join("; ");
  return {
    id,
    kind,
    title,
    statement: `${statementLead}: ${details}.`,
    missingEvidence: missingNames.length > 0
      ? `${missingSubject} is not available for ${joinNames(missingNames)}. Missing information was not counted as zero.`
      : null,
    uncertaintyCaution: null,
  };
}

function joinNames(names: ReadonlyArray<string>): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function measurementUnavailableLabel(metric: ComparisonMetric | undefined): string {
  if (!metric) {
    return "comparison evidence unavailable";
  }
  if (metric.measurement.state === "unreachable") {
    return "no walking route found on the approved network";
  }
  if (metric.measurement.state === "missing") {
    return "data unavailable";
  }
  if (metric.measurement.state === "suppressed") {
    return "the source withheld this value";
  }
  return "the available sources disagree";
}

function metricFor(
  tract: ComparisonTract,
  category: "food_access" | "equity_baseline",
  slug: string,
): ComparisonMetric | undefined {
  const metrics = category === "food_access"
    ? tract.foodAccessMeasures
    : tract.equityIndicators;
  return metrics.find((metric) => metric.category === category && metric.slug === slug);
}

const RELIABILITY_LABELS = {
  use_with_caution: "Use with caution",
  high_uncertainty: "High uncertainty",
  cv_not_computable: "Reliability unclear",
} as const;

function uncertaintyCaution(
  entries: Array<{metric: ComparisonMetric; name: string}>,
): string | null {
  const cautions = entries.flatMap(({metric, name}) => {
    if (
      metric.measurement.state !== "observed"
      || metric.measurement.reliability === null
      || metric.measurement.reliability === "reliable"
    ) {
      return [];
    }
    return [{name, label: RELIABILITY_LABELS[metric.measurement.reliability]}];
  });
  if (cautions.length === 0) {
    return null;
  }
  if (cautions.length === 1) {
    const caution = cautions[0]!;
    return `Use caution: ${caution.name} is marked “${caution.label}.” Its county percentile has the same survey uncertainty. Read this tract’s estimate range before using this difference.`;
  }
  const details = cautions.map(({name, label}) => `${name} is marked “${label}”`).join("; ");
  return `Use caution: ${details}. Their county percentiles have the same survey uncertainty. Read these tracts’ estimate ranges before using this difference.`;
}

function buildMetricCandidates(
  tracts: ReadonlyArray<ComparisonTract>,
): {
  candidates: Array<NumericCandidate>;
  insufficientComparisons: Array<InsufficientComparison>;
} {
  const candidates: Array<NumericCandidate> = [];
  const insufficientComparisons: Array<InsufficientComparison> = [];

  COMPARISON_METRIC_PRESENTATION_ORDER.forEach(({category, label: fallbackLabel, slug}, order) => {
    const entries = tracts.map((tract) => ({
      metric: metricFor(tract, category, slug),
      name: tract.tract.name,
    }));
    const observed = entries.flatMap((entry) => entry.metric?.measurement.state === "observed"
      ? [{metric: entry.metric, name: entry.name}]
      : []);
    const label = entries.find(({metric}) => metric)?.metric?.name ?? fallbackLabel;
    if (observed.length < 2) {
      insufficientComparisons.push({
        id: `metric:${slug}`,
        label,
        availableTractCount: observed.length,
        requiredTractCount: 2,
      });
      return;
    }

    const percentiles = observed.map(({metric}) => metric.countyPercentile);
    const gap = Math.max(...percentiles) - Math.min(...percentiles);
    if (gap < MINIMUM_PERCENTILE_GAP) {
      return;
    }

    const unavailable = entries.filter(({metric}) => metric?.measurement.state !== "observed");
    candidates.push({
      gap,
      order,
      slug,
      item: {
        id: `metric:${slug}`,
        kind: "metric",
        title: label,
        statement: `The county-percentile range for ${label} is ${formatNumber(gap)} points. County percentiles: ${observed.map(({metric, name}) => `${name}, ${formatNumber(metric.countyPercentile)}`).join("; ")}.`,
        missingEvidence: unavailable.length > 0
          ? `Not included in this range: ${unavailable.map(({metric, name}) => `${name} (${measurementUnavailableLabel(metric)})`).join("; ")}. Missing information was not counted as zero.`
          : null,
        uncertaintyCaution: uncertaintyCaution(observed),
      },
    });
  });

  candidates.sort((left, right) => right.gap - left.gap
    || left.order - right.order
    || left.slug.localeCompare(right.slug));
  return {candidates, insufficientComparisons};
}

export function buildDifferences(comparison: CompareAvailableResponse): DifferencesSummary {
  const categoricalItems: Array<DifferenceItem> = [];
  const completePriority = comparison.tracts.flatMap((tract) => tract.tract.qualityStatus === "complete"
    && tract.tract.foodEquityPriority !== null
    ? [{name: tract.tract.name, value: tract.tract.foodEquityPriority}]
    : []);
  const priority = categoricalDifference({
    id: "priority",
    kind: "priority",
    title: "Priority levels differ",
    statementLead: "These tracts fall in different Priority levels",
    available: completePriority,
    missingNames: comparison.tracts
      .filter((tract) => tract.tract.qualityStatus !== "complete"
        || tract.tract.foodEquityPriority === null)
      .map((tract) => tract.tract.name),
    missingSubject: "Priority",
    valueLabel: (value) => `Priority ${value}`,
  });
  if (priority) {
    categoricalItems.push(priority);
  }

  const bandDefinitions = [
    {
      id: "equity_baseline_band",
      kind: "equity_baseline_band",
      title: "Equity Baseline bands differ",
      statementLead: "These tracts fall in different Equity Baseline bands",
      missingSubject: "Equity Baseline band",
      readValue: (tract: ComparisonTract) => tract.tract.equityBaselineBand,
    },
    {
      id: "food_access_need_band",
      kind: "food_access_need_band",
      title: "Food Access Need bands differ",
      statementLead: "These tracts fall in different Food Access Need bands",
      missingSubject: "Food Access Need band",
      readValue: (tract: ComparisonTract) => tract.tract.foodAccessNeedBand,
    },
  ] as const;
  for (const definition of bandDefinitions) {
    const available = comparison.tracts.flatMap((tract) => {
      const value = definition.readValue(tract);
      return value === null ? [] : [{name: tract.tract.name, value}];
    });
    const item = categoricalDifference({
      ...definition,
      available,
      missingNames: comparison.tracts
        .filter((tract) => definition.readValue(tract) === null)
        .map((tract) => tract.tract.name),
      valueLabel: (value) => formatBand(String(value)),
    });
    if (item) {
      categoricalItems.push(item);
    }
  }

  const {candidates, insufficientComparisons} = buildMetricCandidates(comparison.tracts);
  const items = [
    ...categoricalItems,
    ...candidates.map(({item}) => item),
  ].slice(0, MAXIMUM_DIFFERENCES);
  return {
    items,
    insufficientComparisons,
    emptyStatement: items.length === 0
      ? "No large differences were found under these rules. This does not mean the tracts are the same."
      : null,
  };
}
