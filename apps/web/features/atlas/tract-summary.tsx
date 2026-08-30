import type {AtlasTractProperties} from "@mke/contracts";
import {Card, Chip} from "@heroui/react";

type TractSummaryProps = {
  idPrefix?: string;
  tract: AtlasTractProperties;
};

function bandLabel(value: string | null): string {
  return value?.replaceAll("_", " ") ?? "not available";
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

  const priorityContext = tract.foodEquityPriority === 1
    ? "Priority 1 is the highest relative priority in this version."
    : "A lower number means a higher relative priority in this version.";

  return `Priority ${tract.foodEquityPriority} is based on two measures: Food Access Need is ${bandLabel(tract.foodAccessNeedBand)}, and Equity Baseline is ${bandLabel(tract.equityBaselineBand)}. ${priorityContext}`;
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
        ) : null}
      </Card.Content>
    </Card>
  );
}
