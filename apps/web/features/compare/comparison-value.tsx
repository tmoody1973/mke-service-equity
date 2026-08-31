import {Chip} from "@heroui/react";

import type {ComparisonSummaryCell} from "./comparison-presentation";

function reliabilityColor(label: string): "default" | "warning" | "danger" {
  if (label === "High uncertainty") {
    return "danger";
  }
  if (label === "Use with caution") {
    return "warning";
  }
  return "default";
}

export function ComparisonValue({cell}: {cell: ComparisonSummaryCell}) {
  return (
    <div className="space-y-1.5">
      <p className="font-semibold leading-5 tabular-nums text-foreground">{cell.primary}</p>
      {cell.secondary ? (
        <p className="text-xs leading-5 tabular-nums text-muted">{cell.secondary}</p>
      ) : null}
      {cell.qualityLabel || cell.reliabilityLabel ? (
        <div className="flex flex-wrap gap-1.5">
          {cell.qualityLabel ? (
            <Chip size="sm" variant="soft">{cell.qualityLabel}</Chip>
          ) : null}
          {cell.reliabilityLabel ? (
            <Chip
              color={reliabilityColor(cell.reliabilityLabel)}
              size="sm"
              variant="soft"
            >
              {cell.reliabilityLabel}
            </Chip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
