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
    return "This tract has zero recorded population in the approved geography source, so it is not eligible for scoring. This does not mean the tract received a score of zero.";
  }

  if (tract.qualityStatus === "insufficient_data") {
    const originUnsnapped = tract.exclusionReasons.includes("origin_unsnapped");
    return originUnsnapped
      ? "A Food Equity Priority is not shown because the approved walking-network origin could not be matched reliably. Missing information was not replaced with zero."
      : "A Food Equity Priority is not shown because required data did not meet the approved completeness rules. Missing information was not replaced with zero.";
  }

  const priorityContext = tract.foodEquityPriority === 5
    ? "Priority 5 is the highest relative priority in this version."
    : "A higher number indicates a higher relative priority in this version.";

  return `Priority ${tract.foodEquityPriority} combines a ${bandLabel(tract.foodAccessNeedBand)} Food Access Need band with a ${bandLabel(tract.equityBaselineBand)} Equity Baseline band. ${priorityContext}`;
}

export function TractSummary({idPrefix = "atlas", tract}: TractSummaryProps) {
  const stateLabel = tract.qualityStatus === "complete"
    ? `Priority ${tract.foodEquityPriority}`
    : tract.qualityStatus === "insufficient_data"
      ? "Insufficient data"
      : "Not scored";

  return (
    <Card aria-labelledby={`${idPrefix}-tract-summary-${tract.geoid}`} className="gap-3" role="article">
      <Card.Header className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            GEOID {tract.geoid}
          </span>
          <Chip size="sm" variant="secondary">{stateLabel}</Chip>
        </div>
        <Card.Title id={`${idPrefix}-tract-summary-${tract.geoid}`}>{tract.name}</Card.Title>
        <Card.Description>
          {tract.population === null
            ? "Population not available"
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
