"use client";

import type {OpportunityFilterState} from "@mke/contracts";
import {Button, Chip, CloseButton} from "@heroui/react";
import {useRouter} from "next/navigation";

import {
  countOpportunityFilters,
  EMPTY_OPPORTUNITY_FILTERS,
  OPPORTUNITY_BANDS,
} from "./opportunity-filter-state";
import {buildOpportunitySearchParams, opportunityHref} from "./opportunity-url-state";

type AppliedFilterItem = {
  key: string;
  label: string;
  nextFilters: OpportunityFilterState;
};

const bandLabel = new Map(OPPORTUNITY_BANDS.map(({label, value}) => [value, label]));

function withFilterRemoved(
  filters: OpportunityFilterState,
  key: string,
): OpportunityFilterState {
  if (key.startsWith("priority:")) {
    const removed = Number(key.slice("priority:".length));
    return {...filters, priorities: filters.priorities.filter((value) => value !== removed)};
  }
  if (key.startsWith("equity-band:")) {
    const removed = key.slice("equity-band:".length);
    return {...filters, equityBands: filters.equityBands.filter((value) => value !== removed)};
  }
  if (key.startsWith("food-band:")) {
    const removed = key.slice("food-band:".length);
    return {...filters, foodNeedBands: filters.foodNeedBands.filter((value) => value !== removed)};
  }
  switch (key) {
    case "equity-percentile":
      return {...filters, equityPercentileMinimum: null};
    case "food-percentile":
      return {...filters, foodNeedPercentileMinimum: null};
    case "no-vehicle":
      return {...filters, noVehicleMinimumPercent: null};
    case "snap-low-access":
      return {...filters, snapLowAccessMinimumPercent: null};
    case "grocery-walk":
      return {...filters, groceryWalkMinimumMinutes: null};
    case "grocery-unreachable":
      return {...filters, includeUnreachableGrocery: false};
    case "transit":
      return {...filters, transitMaximumTripsPerHour: null};
    default:
      return filters;
  }
}

function item(
  filters: OpportunityFilterState,
  key: string,
  label: string,
): AppliedFilterItem {
  return {key, label, nextFilters: withFilterRemoved(filters, key)};
}

function appliedFilterItems(filters: OpportunityFilterState): Array<AppliedFilterItem> {
  const items: Array<AppliedFilterItem> = [
    ...filters.priorities.map((priority) => item(
      filters,
      `priority:${priority}`,
      `Priority ${priority}`,
    )),
    ...filters.equityBands.map((band) => item(
      filters,
      `equity-band:${band}`,
      `Equity Baseline: ${bandLabel.get(band) ?? band}`,
    )),
  ];
  if (filters.equityPercentileMinimum !== null) {
    items.push(item(
      filters,
      "equity-percentile",
      `Equity Baseline percentile: at least ${filters.equityPercentileMinimum}`,
    ));
  }
  items.push(...filters.foodNeedBands.map((band) => item(
    filters,
    `food-band:${band}`,
    `Food Access Need: ${bandLabel.get(band) ?? band}`,
  )));
  if (filters.foodNeedPercentileMinimum !== null) {
    items.push(item(
      filters,
      "food-percentile",
      `Food Access Need percentile: at least ${filters.foodNeedPercentileMinimum}`,
    ));
  }
  if (filters.noVehicleMinimumPercent !== null) {
    items.push(item(
      filters,
      "no-vehicle",
      `No vehicle: at least ${filters.noVehicleMinimumPercent}%`,
    ));
  }
  if (filters.snapLowAccessMinimumPercent !== null) {
    items.push(item(
      filters,
      "snap-low-access",
      `SNAP low access: at least ${filters.snapLowAccessMinimumPercent}%`,
    ));
  }
  if (filters.groceryWalkMinimumMinutes !== null) {
    items.push(item(
      filters,
      "grocery-walk",
      `Grocery walk: at least ${filters.groceryWalkMinimumMinutes} minutes`,
    ));
  }
  if (filters.includeUnreachableGrocery) {
    items.push(item(filters, "grocery-unreachable", "Grocery walk: no route found"));
  }
  if (filters.transitMaximumTripsPerHour !== null) {
    items.push(item(
      filters,
      "transit",
      `Scheduled transit: at most ${filters.transitMaximumTripsPerHour} trips per hour`,
    ));
  }
  return items;
}

export function AppliedFilterChips({
  currentSearchParams,
  filters,
  idPrefix = "opportunity-filter",
}: {
  currentSearchParams: string;
  filters: OpportunityFilterState;
  idPrefix?: string;
}) {
  const router = useRouter();
  const items = appliedFilterItems(filters);
  const navigate = (nextFilters: OpportunityFilterState) => {
    const next = buildOpportunitySearchParams(
      new URLSearchParams(currentSearchParams),
      nextFilters,
    );
    router.push(opportunityHref("/analyze/opportunity", next), {scroll: false});
  };

  return (
    <section aria-labelledby={`${idPrefix}-applied-heading`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            className="text-sm font-semibold text-foreground"
            id={`${idPrefix}-applied-heading`}
          >
            Applied filters
          </h3>
          <p className="text-xs leading-5 text-muted">
            These conditions are changing the matching areas now.
          </p>
        </div>
        {countOpportunityFilters(filters) > 0 ? (
          <Button
            aria-label="Clear all applied filters"
            className="min-h-11"
            size="sm"
            variant="ghost"
            onPress={() => navigate(EMPTY_OPPORTUNITY_FILTERS)}
          >
            Clear all
          </Button>
        ) : null}
      </div>
      {items.length > 0 ? (
        <ul aria-label="Applied filter list" className="flex flex-wrap gap-2">
          {items.map((filter) => (
            <li key={filter.key}>
              <Chip className="min-h-11 gap-1 pl-3" variant="soft">
                <Chip.Label>{filter.label}</Chip.Label>
                <CloseButton
                  aria-label={`Remove applied filter ${filter.label}`}
                  className="size-11 shrink-0"
                  onPress={() => navigate(filter.nextFilters)}
                />
              </Chip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-divider bg-default p-3 text-sm text-muted">
          No filters applied
        </p>
      )}
    </section>
  );
}
