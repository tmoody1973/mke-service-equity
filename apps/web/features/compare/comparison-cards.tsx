"use client";

import type {CompareAvailableResponse} from "@mke/contracts";
import {Card, Chip} from "@heroui/react";

import {buildComparisonSummaryRows} from "./comparison-presentation";
import {ComparisonValue} from "./comparison-value";

function tractQualityLabel(status: CompareAvailableResponse["tracts"][number]["tract"]["qualityStatus"]): string {
  if (status === "complete") {
    return "Complete data";
  }
  return status === "insufficient_data"
    ? "Insufficient data"
    : "Not scored — no recorded population";
}

export function ComparisonCards({comparison}: {comparison: CompareAvailableResponse}) {
  const rows = buildComparisonSummaryRows(comparison);

  return (
    <ul aria-label="Comparison summary by tract" className="grid gap-4" role="list">
      {comparison.tracts.map(({tract}, tractIndex) => {
        const titleId = `comparison-card-${tract.geoid}`;
        return (
          <li key={tract.geoid}>
            <Card aria-labelledby={titleId} className="gap-3" role="article">
              <Card.Header className="gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Card.Title id={titleId}>{tract.name}</Card.Title>
                    <Card.Description>Census tract ID {tract.geoid}</Card.Description>
                  </div>
                  <Chip size="sm" variant="soft">{tractQualityLabel(tract.qualityStatus)}</Chip>
                </div>
              </Card.Header>
              <Card.Content>
                <dl className="divide-y divide-divider">
                  {rows.map((row) => {
                    const cell = row.cells[tractIndex]!;
                    return (
                      <div className="grid gap-2 py-3 first:pt-0 last:pb-0" key={row.id}>
                        <dt className="text-xs font-medium text-muted">{row.label}</dt>
                        <dd><ComparisonValue cell={cell} /></dd>
                      </div>
                    );
                  })}
                </dl>
              </Card.Content>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
