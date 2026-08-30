import type {
  AtlasEvidenceItem,
  AtlasMeasurement,
  AtlasReliabilityState,
  AtlasTractProfile,
} from "@mke/contracts";
import {Accordion, Card, Chip} from "@heroui/react";
import {TractSummary} from "../tract-summary";

type TractProfileContentProps = {
  idPrefix: string;
  profile: AtlasTractProfile;
};

function labelWords(value: string): string {
  return value.replaceAll("_", " ");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {maximumFractionDigits: 1}).format(value);
}

function formatAreaShare(value: number): string {
  return `${formatNumber(value * 100)}%`;
}

function formatMeasurement(measurement: AtlasMeasurement): string {
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

function ordinal(value: number): string {
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

function contributionLabel(value: number): string {
  if (value === 0) {
    return "0";
  }
  const formatted = formatNumber(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `−${formatted}`;
}

function qualityLabel(status: AtlasMeasurement["qualityStatus"]): string {
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

function uncertaintyLabel(measurement: AtlasMeasurement): string | null {
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

const RELIABILITY_PRESENTATION: Record<AtlasReliabilityState, {
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

function EvidenceList({items, scoreName}: {
  items: ReadonlyArray<AtlasEvidenceItem>;
  scoreName: "Equity Baseline" | "Food Access Need";
}) {
  return (
    <ol className="space-y-3">
      {items.map((item) => {
        const uncertainty = uncertaintyLabel(item.measurement);
        const reliability = item.measurement.state === "observed"
          && item.measurement.reliability !== null
          ? RELIABILITY_PRESENTATION[item.measurement.reliability]
          : null;
        return (
          <li key={item.slug}>
            <Card className="gap-2" data-evidence-slug={item.slug} variant="secondary">
              <Card.Header className="gap-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Card.Title className="text-sm">{item.name}</Card.Title>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Chip size="sm" variant="soft">
                      {qualityLabel(item.measurement.qualityStatus)}
                    </Chip>
                    {reliability ? (
                      <Chip color={reliability.chipColor} size="sm" variant="soft">
                        {reliability.label}
                      </Chip>
                    ) : null}
                  </div>
                </div>
                {item.definition.trim().toLocaleLowerCase("en-US")
                  !== item.name.trim().toLocaleLowerCase("en-US")
                  ? <Card.Description>{item.definition}</Card.Description>
                  : null}
              </Card.Header>
              <Card.Content className="space-y-1 text-sm">
                <p className="font-semibold">{formatMeasurement(item.measurement)}</p>
                <p>County comparison: {ordinal(item.countyPercentile)} percentile</p>
                <p>Effect on {scoreName}: {contributionLabel(item.contribution)} points</p>
                {uncertainty ? <p className="text-xs text-muted">{uncertainty}</p> : null}
                {reliability?.needsPlanningCaution ? (
                  <div
                    aria-label={`Estimate reliability: ${reliability.label}`}
                    className="mt-2 space-y-1 rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs text-warning-soft-foreground"
                  >
                    <p>{reliability.description}</p>
                    <p>
                      The county percentile uses the estimate above, so treat that comparison with the same caution.
                    </p>
                    <p>
                      <strong>Planning tip:</strong> Compare nearby tracts and confirm with local data and residents before making a plan.
                    </p>
                  </div>
                ) : null}
                {item.nearestResource ? (
                  <p className="text-xs">
                    Nearest approved grocery: <strong>{item.nearestResource.name}</strong>
                    {item.nearestResource.address ? `, ${item.nearestResource.address}` : ""}
                  </p>
                ) : null}
                {item.limitation ? <p className="text-xs text-muted">{item.limitation}</p> : null}
              </Card.Content>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

export function TractProfileContent({idPrefix, profile}: TractProfileContentProps) {
  const complete = profile.tract.qualityStatus === "complete";
  const neighborhoodContext = profile.neighborhoodContext
    ?? {state: "unavailable" as const, reason: "snapshot_not_configured" as const};

  return (
    <div className="space-y-6" data-profile-tract={profile.tract.geoid}>
      <TractSummary idPrefix={`${idPrefix}-profile`} tract={profile.tract} />

      <section aria-labelledby={`${idPrefix}-meaning`} className="space-y-2">
        <h2 className="text-base font-semibold" id={`${idPrefix}-meaning`}>What this means</h2>
        <p className="text-sm leading-relaxed">{profile.explanation}</p>
        <p className="text-xs text-muted">
          The result compares this tract with other Milwaukee County tracts that had enough data to score. It does not describe every resident or recommend a specific action.
        </p>
      </section>

      <section aria-labelledby={`${idPrefix}-location`} className="space-y-2">
        <h2 className="text-base font-semibold" id={`${idPrefix}-location`}>
          Where this tract is
        </h2>
        {neighborhoodContext.state === "available" ? (
          neighborhoodContext.labelKind === "no_reference" ? (
            <p className="text-sm">No City of Milwaukee neighborhood reference is available for this tract.</p>
          ) : (
            <>
              <p className="text-sm">
                {neighborhoodContext.labelKind === "mostly_in"
                  ? `Mostly in ${neighborhoodContext.overlaps[0]?.name}.`
                  : neighborhoodContext.labelKind === "spans"
                    ? `This tract spans ${neighborhoodContext.overlaps.map((overlap) => overlap.name).join(", ")}.`
                    : "Only part of this tract is covered by the City neighborhood reference."}
              </p>
              <p className="text-xs text-muted">
                City reference coverage: {formatAreaShare(neighborhoodContext.cityReferenceCoverage)} of the tract area.
              </p>
              <ul className="list-disc space-y-1 ps-5 text-sm">
                {neighborhoodContext.overlaps.map((overlap) => (
                  <li key={overlap.sourceNeighborhoodId}>
                    {overlap.name}: {formatAreaShare(overlap.coveredAreaShare)} of the covered area
                  </li>
                ))}
                {neighborhoodContext.otherBoundarySliversShare > 0 ? (
                  <li>
                    Other boundary slivers: {formatAreaShare(neighborhoodContext.otherBoundarySliversShare)}
                  </li>
                ) : null}
              </ul>
            </>
          )
        ) : (
          <p className="text-sm">Neighborhood context is not available for this data version.</p>
        )}
        {neighborhoodContext.state === "available" ? (
          <p className="text-xs text-muted">
            {neighborhoodContext.limitation}{" "}
            <a
              className="font-medium text-foreground underline underline-offset-2"
              href={neighborhoodContext.source.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              View the City source
            </a>
          </p>
        ) : null}
      </section>

      {complete ? (
        <>
          <section aria-labelledby={`${idPrefix}-why`} className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold" id={`${idPrefix}-why`}>Why this result</h2>
              <p className="text-sm">
                These thirteen measures make up the Equity Baseline. Percentile shows where this tract falls among other county tracts. Plus or minus points show how much each measure moves the combined score above or below the county midpoint.
              </p>
              <p className="text-xs text-muted">
                These numbers are not raw percentages, changes over time, causes, or recommendations.
              </p>
            </div>
            <EvidenceList items={profile.equityDrivers} scoreName="Equity Baseline" />
          </section>

          <section aria-labelledby={`${idPrefix}-food`} className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold" id={`${idPrefix}-food`}>Food access evidence</h2>
              <p className="text-sm">
                These four measures make up Food Access Need. Percentile shows where this tract falls among other county tracts. Higher need and fewer access options increase this score.
              </p>
            </div>
            <EvidenceList items={profile.foodComponents} scoreName="Food Access Need" />
          </section>
        </>
      ) : (
        <section aria-labelledby={`${idPrefix}-not-scored`} className="space-y-2">
          <h2 className="text-base font-semibold" id={`${idPrefix}-not-scored`}>Why there is no score</h2>
          <p className="text-sm">{profile.explanation}</p>
        </section>
      )}

      <section aria-labelledby={`${idPrefix}-context`} className="space-y-2">
        <h2 className="text-base font-semibold" id={`${idPrefix}-context`}>Community context</h2>
        {profile.context.state === "available" ? (
          <p className="text-sm">Verified non-scoring context is available for this tract.</p>
        ) : (
          <p className="text-sm">
            Food resources and nearby opportunities are not shown yet because we cannot confirm that those details came from the same data version as this score. This does not mean the tract has no resources.
          </p>
        )}
      </section>

      <section aria-labelledby={`${idPrefix}-quality`} className="space-y-2">
        <h2 className="text-base font-semibold" id={`${idPrefix}-quality`}>Data quality</h2>
        <p className="text-sm">
          “Verified data” means the source and data checks passed. It does not mean a survey estimate is exact. Census measures also show whether the estimate is more stable, should be used with caution, or has high uncertainty. The likely range shows how much the estimate could reasonably move. Missing information is not counted as zero.
        </p>
        <p className="text-sm">
          A smaller margin of error usually requires more survey responses. A larger local survey can help. Looking at a larger combined area can also provide supporting context, but it does not replace this tract’s estimate. Rounding or hiding the margin of error does not make the data more precise.
        </p>
        <ul className="list-disc space-y-1 ps-5 text-sm">
          {profile.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
        </ul>
      </section>

      <section aria-labelledby={`${idPrefix}-sources`} className="space-y-2">
        <h2 className="text-base font-semibold" id={`${idPrefix}-sources`}>Data and sources</h2>
        {profile.provenance.length > 0 ? (
          <Accordion allowsMultipleExpanded variant="surface">
            {profile.provenance.map((source, index) => (
              <Accordion.Item
                key={`${source.publisher}-${source.sourceName}-${source.datasetVersion}-${source.retrievedAt}-${index}`}
              >
                <Accordion.Heading>
                  <Accordion.Trigger>
                    <span className="min-w-0 text-left">
                      <span className="block font-medium">{source.sourceName}</span>
                      <span className="block text-xs text-muted">{source.publisher}</span>
                    </span>
                    <Accordion.Indicator />
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body className="space-y-2 text-sm">
                    <p>Data version: {source.datasetVersion}</p>
                    <p>Accessed: {new Date(source.retrievedAt).toLocaleDateString("en-US")}</p>
                    <a className="font-medium text-accent underline" href={source.sourceUrl} rel="noreferrer" target="_blank">
                      View source data
                    </a>
                    {source.methodologyUrl ? (
                      <a className="block font-medium text-accent underline" href={source.methodologyUrl} rel="noreferrer" target="_blank">
                        Read the source methodology
                      </a>
                    ) : null}
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        ) : (
          <p className="text-sm">Source details are unavailable because this tract was not scored.</p>
        )}
      </section>
    </div>
  );
}
