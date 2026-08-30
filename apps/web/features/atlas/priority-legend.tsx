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
const priorityDescriptions = {
  1: "Strongest overlap of food-access need and other barriers.",
  2: "Strong overlap, but not as strong as Priority 1.",
  3: "Middle or mixed overlap.",
  4: "Smaller overlap.",
  5: "Weakest overlap in this data version.",
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
    <section
      aria-labelledby={`${idPrefix}-priority-legend-title`}
      className="space-y-3"
      data-priority-guide
    >
      <div>
        <h2 className="text-sm font-semibold" id={`${idPrefix}-priority-legend-title`}>
          Food Equity Priority
        </h2>
        <p className="text-xs text-muted">
          This number combines two questions: Is food harder to reach? Are there other barriers,
          such as housing, income, or health pressures?
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
              aria-label={`Show or hide Priority ${priority} tracts. ${priorityDescriptions[priority]}`}
              aria-pressed={activePriorities.includes(priority)}
              className="h-auto min-h-11 justify-start gap-2 px-2 py-2 text-left"
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
              <span>
                <span className="block font-medium">{priorityLabels[priority]}</span>
                <span className="block text-xs font-normal text-muted">
                  {priorityDescriptions[priority]}
                </span>
              </span>
            </Button>
          ),
        )}
      </div>
      <aside className="space-y-1 rounded-lg border border-divider bg-default p-3 text-xs" role="note">
        <p className="font-semibold">How to use this for planning</p>
        <p>
          Priority 1 and 2 tracts are places to learn more about first. Read the tract details,
          compare nearby areas, and talk with residents and local groups before choosing an action.
        </p>
        <p className="text-muted">
          The number does not choose a project, prove why a problem exists, or automatically decide funding.
        </p>
      </aside>
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
