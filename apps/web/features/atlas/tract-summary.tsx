import type {AtlasTractProperties} from "@mke/contracts";
import {Card, Chip} from "@heroui/react";

type TractSummaryProps = {
  idPrefix?: string;
  tract: AtlasTractProperties;
};

function bandLabel(value: string | null): string {
  return value?.replaceAll("_", " ") ?? "not available";
}

export function explainEquityBaselineBand(value: string | null): string {
  if (value === "high" || value === "very_high") {
    return "Together, the 13 measures show more barriers here than in many other Milwaukee County tracts.";
  }
  if (value === "low" || value === "very_low") {
    return "Together, the 13 measures show fewer barriers here than in many other Milwaukee County tracts.";
  }
  if (value === "moderate") {
    return "Together, the 13 measures place this tract near the middle of Milwaukee County tracts.";
  }
  return "The Equity Baseline comparison is not available for this tract.";
}

export function explainPriorityLevel(value: number | null): string {
  const explanations: Record<number, string> = {
    1: "Priority 1 means the strongest overlap of food-access need and other measured barriers.",
    2: "Priority 2 means a strong overlap, but not as strong as Priority 1.",
    3: "Priority 3 means a middle or mixed overlap.",
    4: "Priority 4 means a smaller overlap.",
    5: "Priority 5 means the weakest overlap in this data version.",
  };
  return value === null
    ? "A priority level is not available for this tract."
    : explanations[value] ?? "The priority level is outside the supported range.";
}

export function explainTractSummary(tract: AtlasTractProperties): string {
  if (tract.qualityStatus === "ineligible_zero_population") {
    return "The approved 2020 Census tract data records no residents for this tract, so it is not scored. This is not a score of zero.";
  }

  if (tract.qualityStatus === "insufficient_data") {
    const originUnsnapped = tract.exclusionReasons.includes("origin_unsnapped");
    return originUnsnapped
      ? "No priority is shown because this tract's Census population center could not be connected reliably to the approved walking network. Missing data was not counted as zero."
      : "No priority is shown because one or more required measures were unavailable or did not pass the approved data checks. Missing data was not counted as zero.";
  }

  return `Priority ${tract.foodEquityPriority} is based on two measures: Food Access Need is ${bandLabel(tract.foodAccessNeedBand)}, and Equity Baseline is ${bandLabel(tract.equityBaselineBand)}. ${explainPriorityLevel(tract.foodEquityPriority)}`;
}

export function TractSummary({idPrefix = "atlas", tract}: TractSummaryProps) {
  const stateLabel = tract.qualityStatus === "complete"
      ? `Priority ${tract.foodEquityPriority}`
      : tract.qualityStatus === "insufficient_data"
        ? "Insufficient data"
        : "Not scored — no recorded population";

  return (
    <Card aria-labelledby={`${idPrefix}-tract-summary-${tract.geoid}`} className="gap-3" role="article">
      <Card.Header className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            Census tract ID {tract.geoid}
          </span>
          <Chip size="sm" variant="secondary">{stateLabel}</Chip>
        </div>
        <Card.Title id={`${idPrefix}-tract-summary-${tract.geoid}`}>{tract.name}</Card.Title>
        <Card.Description>
          {tract.population === null
            ? "Population data is not available"
            : `Population ${tract.population.toLocaleString("en-US")}`}
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-3 text-sm">
        <p>{explainTractSummary(tract)}</p>
        {tract.qualityStatus === "complete" ? (
          <>
            <dl className="grid grid-cols-2 gap-2 border-t border-divider pt-3 text-xs">
              <div>
                <dt className="text-muted">Food Access Need</dt>
                <dd className="font-medium capitalize">{bandLabel(tract.foodAccessNeedBand)}</dd>
              </div>
              <div>
                <dt className="text-muted">Equity Baseline</dt>
                <dd className="font-medium capitalize">{bandLabel(tract.equityBaselineBand)}</dd>
              </div>
            </dl>
            <section
              aria-labelledby={`${idPrefix}-equity-baseline-help`}
              className="space-y-2 rounded-lg border border-divider bg-default p-3 text-xs"
            >
              <h3 className="text-sm font-semibold" id={`${idPrefix}-equity-baseline-help`}>
                How to read Equity Baseline
              </h3>
              <p>
                It combines 13 measures covering income and housing costs, education and jobs,
                health and disability, English-language access, and populations that have
                historically faced unequal access to public resources.
              </p>
              <p>
                <span className="font-semibold capitalize">{bandLabel(tract.equityBaselineBand)}:</span>{" "}
                {explainEquityBaselineBand(tract.equityBaselineBand)}
              </p>
              <p className="text-muted">
                This describes conditions in a place. It does not rate or judge the people who live here.
              </p>
            </section>
          </>
        ) : null}
      </Card.Content>
    </Card>
  );
}
