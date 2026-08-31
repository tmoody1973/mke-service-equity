"use client";

import type {
  CompareAvailableResponse,
  ComparisonMetric,
  ComparisonSource,
  ComparisonTract,
} from "@mke/contracts";
import {Accordion, Card, Chip} from "@heroui/react";
import {useState} from "react";

import {
  contributionLabel,
  formatMeasurement,
  ordinal,
  qualityLabel,
  RELIABILITY_PRESENTATION,
  uncertaintyLabel,
} from "../atlas/profile/evidence-presentation";
import {
  COMPARISON_EQUITY_GROUPS,
  COMPARISON_FOOD_METRICS,
} from "./comparison-metric-registry";
import {metricFor} from "./comparison-presentation";

type MetricCategory = "food_access" | "equity_baseline";

function unavailableExplanation(tract: ComparisonTract): string {
  return tract.tract.qualityStatus === "ineligible_zero_population"
    ? "No detailed evidence is shown because the approved Census data records no residents for this tract. This is not a value of zero."
    : "No detailed evidence is shown because this tract did not have enough approved data to score. Missing information was not counted as zero.";
}

function sourcesForMetric(
  metric: ComparisonMetric,
  sourceById: ReadonlyMap<string, ComparisonSource["source"]>,
): Array<ComparisonSource["source"]> {
  return metric.sourceIds.map((sourceId) => {
    const source = sourceById.get(sourceId);
    if (!source) {
      throw new Error(`Comparison source ${sourceId} is unavailable.`);
    }
    return source;
  });
}

function MetricTractEvidence({
  category,
  metric,
  sourceById,
  tract,
}: {
  category: MetricCategory;
  metric: ComparisonMetric | undefined;
  sourceById: ReadonlyMap<string, ComparisonSource["source"]>;
  tract: ComparisonTract;
}) {
  const titleId = `comparison-evidence-${category}-${metric?.slug ?? "missing"}-${tract.tract.geoid}`;
  if (!metric) {
    return (
      <Card aria-labelledby={titleId} className="gap-2" role="article" variant="secondary">
        <Card.Header>
          <Card.Title className="text-sm" id={titleId}>{tract.tract.name}</Card.Title>
          <Card.Description>Census tract ID {tract.tract.geoid}</Card.Description>
        </Card.Header>
        <Card.Content className="text-sm leading-6">
          <p>{unavailableExplanation(tract)}</p>
        </Card.Content>
      </Card>
    );
  }

  const reliability = metric.measurement.state === "observed"
    && metric.measurement.reliability !== null
    ? RELIABILITY_PRESENTATION[metric.measurement.reliability]
    : null;
  const uncertainty = uncertaintyLabel(metric.measurement);
  const sources = sourcesForMetric(metric, sourceById);
  return (
    <Card aria-labelledby={titleId} className="gap-2" role="article" variant="secondary">
      <Card.Header className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Card.Title className="text-sm" id={titleId}>{tract.tract.name}</Card.Title>
            <Card.Description>Census tract ID {tract.tract.geoid}</Card.Description>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Chip size="sm" variant="soft">{qualityLabel(metric.measurement.qualityStatus)}</Chip>
            {reliability ? (
              <Chip color={reliability.chipColor} size="sm" variant="soft">
                {reliability.label}
              </Chip>
            ) : null}
          </div>
        </div>
      </Card.Header>
      <Card.Content className="space-y-3 text-sm leading-6">
        <div className="space-y-1">
          <p className="font-semibold tabular-nums">{formatMeasurement(metric.measurement)}</p>
          {metric.measurement.state === "observed" ? (
            <p className="tabular-nums">County comparison: {ordinal(metric.countyPercentile)} percentile</p>
          ) : null}
          {metric.contribution !== null ? (
            <p className="tabular-nums">
              Effect on {category === "food_access" ? "Food Access Need" : "Equity Baseline"}: {contributionLabel(metric.contribution)} points
            </p>
          ) : null}
          <p>Data year: {metric.dataYear ?? "Not available"}</p>
        </div>
        {uncertainty ? <p className="text-xs text-muted">{uncertainty}</p> : null}
        {reliability?.needsPlanningCaution ? (
          <div
            aria-label={`Estimate reliability: ${reliability.label}`}
            className="space-y-1 rounded-xl border border-warning/30 bg-warning-soft p-3 text-xs text-warning-soft-foreground"
          >
            <p>{reliability.description}</p>
            <p>The county percentile uses this estimate, so read that comparison with the same caution.</p>
          </div>
        ) : null}
        {metric.limitation ? (
          <p className="text-xs text-muted"><strong>Measure limitation:</strong> {metric.limitation}</p>
        ) : null}
        <div className="space-y-3 border-t border-divider pt-3">
          {sources.map((source) => (
            <section
              aria-label={`Source: ${source.sourceName}`}
              className="space-y-1 text-xs"
              key={`${source.publisher}-${source.sourceName}-${source.datasetVersion}-${source.retrievedAt}`}
            >
              <p className="font-semibold text-foreground">{source.sourceName}</p>
              <p>{source.publisher}</p>
              <p>Data version: {source.datasetVersion}</p>
              <p>Accessed: {new Date(source.retrievedAt).toLocaleDateString("en-US")}</p>
              <a
                className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-2"
                href={source.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                View source data
              </a>
              {source.methodologyUrl ? (
                <a
                  className="flex min-h-11 items-center font-medium text-accent underline underline-offset-2"
                  href={source.methodologyUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Read source methodology
                </a>
              ) : null}
              {source.limitation ? <p><strong>Source limitation:</strong> {source.limitation}</p> : null}
            </section>
          ))}
        </div>
      </Card.Content>
    </Card>
  );
}

function MetricAccordionItem({
  category,
  comparison,
  label,
  slug,
  sourceById,
}: {
  category: MetricCategory;
  comparison: CompareAvailableResponse;
  label: string;
  slug: string;
  sourceById: ReadonlyMap<string, ComparisonSource["source"]>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const entries = comparison.tracts.map((tract) => ({
    metric: metricFor(tract, category, slug),
    tract,
  }));
  const definition = entries.find(({metric}) => metric)?.metric?.definition;
  return (
    <Accordion.Item
      id={`${category}:${slug}`}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      <Accordion.Heading>
        <Accordion.Trigger aria-label={`View evidence for ${label}`}>
          <span className="min-w-0 text-left">
            <span className="block font-medium text-foreground">{label}</span>
            <span className="block text-xs text-muted">View values, uncertainty, and sources</span>
          </span>
          <Accordion.Indicator />
        </Accordion.Trigger>
      </Accordion.Heading>
      <Accordion.Panel>
        {isExpanded ? (
          <Accordion.Body className="space-y-4">
            <p className="text-sm leading-6 text-muted">
              {definition ?? "The approved definition is unavailable because none of these tracts has detailed evidence for this measure."}
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              {entries.map(({metric, tract}) => (
                <MetricTractEvidence
                  category={category}
                  key={tract.tract.geoid}
                  metric={metric}
                  sourceById={sourceById}
                  tract={tract}
                />
              ))}
            </div>
          </Accordion.Body>
        ) : null}
      </Accordion.Panel>
    </Accordion.Item>
  );
}

export function ComparisonEvidence({comparison}: {comparison: CompareAvailableResponse}) {
  const sourceById = new Map(comparison.sources.map(({id, source}) => [id, source]));
  return (
    <section aria-labelledby="comparison-evidence-heading" className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground" id="comparison-evidence-heading">
          Measure details
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted">
          Open a measure to see each tract’s value, county comparison, data quality, uncertainty,
          definition, data year, limitations, and sources. Opening details does not change the data
          or the scores.
        </p>
      </div>

      <section aria-labelledby="comparison-food-details-heading" className="space-y-3">
        <h3 className="text-base font-semibold" id="comparison-food-details-heading">
          Food access measure details
        </h3>
        <Accordion allowsMultipleExpanded variant="surface">
          {COMPARISON_FOOD_METRICS.map(({label, slug}) => (
            <MetricAccordionItem
              category="food_access"
              comparison={comparison}
              key={slug}
              label={label}
              slug={slug}
              sourceById={sourceById}
            />
          ))}
        </Accordion>
      </section>

      <section aria-labelledby="comparison-equity-details-heading" className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold" id="comparison-equity-details-heading">
            Equity Baseline indicator details
          </h3>
          <p className="text-sm text-muted">
            These 13 indicators are grouped for easier reading. They keep the approved calculation order.
          </p>
        </div>
        {COMPARISON_EQUITY_GROUPS.map((group) => (
          <section aria-labelledby={`comparison-equity-${group.id}`} className="space-y-2" key={group.id}>
            <h4 className="text-sm font-semibold" id={`comparison-equity-${group.id}`}>
              {group.label}
            </h4>
            <Accordion allowsMultipleExpanded variant="surface">
              {group.metrics.map(({label, slug}) => (
                <MetricAccordionItem
                  category="equity_baseline"
                  comparison={comparison}
                  key={slug}
                  label={label}
                  slug={slug}
                  sourceById={sourceById}
                />
              ))}
            </Accordion>
          </section>
        ))}
      </section>
    </section>
  );
}
