import type {
  AtlasMeasurement,
  AtlasReliabilityState,
} from "@mke/contracts";

export function labelWords(value: string): string {
  return value.replaceAll("_", " ");
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {maximumFractionDigits: 1}).format(value);
}

export function formatMeasurement(measurement: AtlasMeasurement): string {
  if (measurement.state === "unreachable") {
    return "No walking route was found on the approved street-and-path network";
  }
  if (measurement.state !== "observed") {
    return measurement.state === "missing"
      ? "Data is not available"
      : measurement.state === "suppressed"
        ? "The source withheld this value"
        : "The available sources disagree";
  }

  const value = formatNumber(measurement.value);
  if (measurement.unit === "percent") {
    return `${value}%`;
  }
  if (measurement.unit === "minutes" || measurement.unit === "minute") {
    return `${value} minutes`;
  }
  if (measurement.unit === "unique_trips_per_hour") {
    return `${value} scheduled trips per hour`;
  }
  return `${value} ${labelWords(measurement.unit)}`;
}

export function ordinal(value: number): string {
  const rounded = Math.round(value);
  const mod100 = rounded % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? "th"
    : rounded % 10 === 1
      ? "st"
      : rounded % 10 === 2
        ? "nd"
        : rounded % 10 === 3
          ? "rd"
          : "th";
  return `${rounded}${suffix}`;
}

export function contributionLabel(value: number): string {
  if (value === 0) {
    return "0";
  }
  const formatted = formatNumber(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `−${formatted}`;
}

export function qualityLabel(status: AtlasMeasurement["qualityStatus"]): string {
  const labels = {
    conflicting: "Sources disagree",
    missing: "Data unavailable",
    provisional: "Provisional data",
    stale: "Older data",
    suppressed: "Value withheld",
    verified: "Verified data",
  } as const;
  return labels[status];
}

export function uncertaintyLabel(measurement: AtlasMeasurement): string | null {
  if (measurement.state !== "observed") {
    return null;
  }
  if (
    measurement.confidenceLevel === 90
    && measurement.marginOfError !== null
    && measurement.confidenceLow !== null
    && measurement.confidenceHigh !== null
  ) {
    const unit = measurement.unit === "percent" ? "%" : ` ${labelWords(measurement.unit)}`;
    return `Likely range (Census 90% confidence): ${formatNumber(measurement.confidenceLow)}${unit} to ${formatNumber(measurement.confidenceHigh)}${unit}. Margin of error: plus or minus ${formatNumber(measurement.marginOfError)} ${measurement.unit === "percent" ? "percentage points" : labelWords(measurement.unit)}.`;
  }
  if (measurement.marginOfError !== null) {
    return `Margin of error: plus or minus ${formatNumber(measurement.marginOfError)} ${measurement.unit === "percent" ? "percentage points" : labelWords(measurement.unit)}.`;
  }
  if (measurement.confidenceLow !== null && measurement.confidenceHigh !== null) {
    return `Confidence range: ${formatNumber(measurement.confidenceLow)}% to ${formatNumber(measurement.confidenceHigh)}%.`;
  }
  return null;
}

export const RELIABILITY_PRESENTATION: Record<AtlasReliabilityState, {
  chipColor: "default" | "success" | "warning" | "danger";
  description: string;
  label: string;
  needsPlanningCaution: boolean;
}> = {
  reliable: {
    chipColor: "default",
    description: "This survey estimate is relatively stable, but it is still an estimate rather than a count of every household.",
    label: "More stable estimate",
    needsPlanningCaution: false,
  },
  use_with_caution: {
    chipColor: "warning",
    description: "The Census surveys a sample, not every household. For this measure, the estimate is uncertain enough that the actual tract value could be meaningfully different.",
    label: "Use with caution",
    needsPlanningCaution: true,
  },
  high_uncertainty: {
    chipColor: "danger",
    description: "This survey estimate is very uncertain, so the actual tract value could be very different. Do not use this measure by itself to make a plan.",
    label: "High uncertainty",
    needsPlanningCaution: true,
  },
  cv_not_computable: {
    chipColor: "default",
    description: "The estimate is zero, so the usual reliability check cannot be calculated. Read the likely range before using this measure.",
    label: "Reliability unclear",
    needsPlanningCaution: true,
  },
};
