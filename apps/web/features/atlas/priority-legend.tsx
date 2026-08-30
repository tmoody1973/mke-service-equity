"use client";

import {Button} from "@heroui/react";
import {
  INSUFFICIENT_DATA_COLOR,
  PRIORITY_COLORS,
  ZERO_POPULATION_COLOR,
} from "../map/tract-layers";

type PriorityLegendProps = {
  activePriorities: Array<number>;
  idPrefix?: string;
  onChange: (priorities: Array<number>) => void;
};

const priorityLabels = {
  1: "1 — Highest",
  2: "2 — High",
  3: "3 — Moderate",
  4: "4 — Lower",
  5: "5 — Lowest",
} as const;
const priorities = [1, 2, 3, 4, 5] as const;

export function PriorityLegend({activePriorities, idPrefix = "atlas", onChange}: PriorityLegendProps) {
  const togglePriority = (priority: number) => {
    const next = activePriorities.includes(priority)
      ? activePriorities.filter((candidate) => candidate !== priority)
      : [...activePriorities, priority].sort((left, right) => left - right);
    onChange(next);
  };

  return (
    <section aria-labelledby={`${idPrefix}-priority-legend-title`} className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold" id={`${idPrefix}-priority-legend-title`}>
          Food Equity Priority
        </h2>
        <p className="text-xs text-muted">
          Compares each tract with other Milwaukee County tracts in this data version.
        </p>
      </div>
      <div aria-label="Food Equity Priority filter" className="grid gap-1" role="group">
        <Button
          aria-pressed={activePriorities.length === 0}
          className="h-9 justify-start px-2"
          onPress={() => onChange([])}
          size="sm"
          variant={activePriorities.length === 0 ? "secondary" : "ghost"}
        >
          Show all tracts
        </Button>
        {priorities.map(
          (priority) => (
            <Button
              aria-label={`Show or hide Priority ${priority} tracts`}
              aria-pressed={activePriorities.includes(priority)}
              className="h-9 justify-start gap-2 px-2"
              key={priority}
              onPress={() => togglePriority(priority)}
              size="sm"
              variant={activePriorities.includes(priority) ? "secondary" : "ghost"}
            >
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-sm border border-black/20"
                style={{backgroundColor: PRIORITY_COLORS[priority]}}
              />
              {priorityLabels[priority]}
            </Button>
          ),
        )}
      </div>
      <ul aria-label="Other tract states" className="grid gap-2 text-xs text-muted">
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-3 rounded-sm border-2 border-dashed border-slate-600"
            style={{backgroundColor: INSUFFICIENT_DATA_COLOR}}
          />
          Insufficient data
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-3 rounded-sm border-2 border-dashed border-slate-600"
            style={{backgroundColor: ZERO_POPULATION_COLOR}}
          />
          No recorded population — not scored
        </li>
      </ul>
    </section>
  );
}
