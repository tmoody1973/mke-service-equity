"use client";

import {EmptyState} from "@heroui-pro/react";
import {Alert, Card} from "@heroui/react";

import type {DifferencesSummary} from "./differences";

type DifferencesViewProps = {
  summary: DifferencesSummary;
};

function availableValueLabel(count: number): string {
  return `${count} ${count === 1 ? "tract has" : "tracts have"} a usable value`;
}

export function DifferencesView({summary}: DifferencesViewProps) {
  return (
    <section aria-labelledby="comparison-differences-heading" className="space-y-4">
      <div className="space-y-2">
        <h2
          className="text-xl font-semibold text-foreground"
          id="comparison-differences-heading"
        >
          Differences
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted">
          These are the clearest contrasts in this comparison. We show a measure when its
          county-percentile range is at least 20 points. This is not a ranking, a judgment
          about residents, or a recommendation about what to do.
        </p>
      </div>

      {summary.items.length > 0 ? (
        <ol className="grid gap-3 lg:grid-cols-2">
          {summary.items.map((item) => {
            const titleId = `comparison-difference-${item.id.replaceAll(":", "-")}`;
            return (
              <li key={item.id}>
                <Card aria-labelledby={titleId} className="h-full gap-3" role="article">
                  <Card.Header>
                    <Card.Title id={titleId}>{item.title}</Card.Title>
                  </Card.Header>
                  <Card.Content className="space-y-3 text-sm leading-6">
                    <p>{item.statement}</p>
                    {item.missingEvidence ? (
                      <p className="rounded-lg border border-divider bg-default p-3 text-muted">
                        <span className="font-semibold text-foreground">Missing information: </span>
                        {item.missingEvidence}
                      </p>
                    ) : null}
                    {item.uncertaintyCaution ? (
                      <Alert status="warning">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Title>Survey uncertainty</Alert.Title>
                          <Alert.Description>{item.uncertaintyCaution}</Alert.Description>
                        </Alert.Content>
                      </Alert>
                    ) : null}
                  </Card.Content>
                </Card>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState className="rounded-[var(--mke-radius-panel)] border border-divider bg-background p-6">
          <EmptyState.Header>
            <EmptyState.Title>No large differences found</EmptyState.Title>
          </EmptyState.Header>
          <EmptyState.Content className="mt-2">
            <EmptyState.Description>{summary.emptyStatement}</EmptyState.Description>
          </EmptyState.Content>
        </EmptyState>
      )}

      {summary.insufficientComparisons.length > 0 ? (
        <Alert status="default">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Some measures could not be compared</Alert.Title>
            <Alert.Description>
              <span>
                Each measure needs usable values for at least two tracts. Missing information
                was not counted as zero.
              </span>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {summary.insufficientComparisons.map((comparison) => (
                  <li key={comparison.id}>
                    {comparison.label}: {availableValueLabel(comparison.availableTractCount)}.
                  </li>
                ))}
              </ul>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </section>
  );
}
