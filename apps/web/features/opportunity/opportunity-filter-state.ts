import {
  opportunityFilterStateSchema,
  type OpportunityFilterState,
} from "@mke/contracts";

export const EMPTY_OPPORTUNITY_FILTERS: OpportunityFilterState = Object.freeze({
  priorities: [],
  equityBands: [],
  equityPercentileMinimum: null,
  foodNeedBands: [],
  foodNeedPercentileMinimum: null,
  noVehicleMinimumPercent: null,
  snapLowAccessMinimumPercent: null,
  groceryWalkMinimumMinutes: null,
  includeUnreachableGrocery: false,
  transitMaximumTripsPerHour: null,
});

export const OPPORTUNITY_BANDS = [
  {label: "Very low", value: "very_low"},
  {label: "Low", value: "low"},
  {label: "Moderate", value: "moderate"},
  {label: "High", value: "high"},
  {label: "Very high", value: "very_high"},
] as const;

export const OPPORTUNITY_PRIORITIES = [1, 2, 3, 4, 5] as const;

export const NUMERIC_FILTER_KEYS = [
  "equityPercentileMinimum",
  "foodNeedPercentileMinimum",
  "noVehicleMinimumPercent",
  "snapLowAccessMinimumPercent",
  "groceryWalkMinimumMinutes",
  "transitMaximumTripsPerHour",
] as const;

export type NumericFilterKey = (typeof NUMERIC_FILTER_KEYS)[number];

export type OpportunityFilterDraft = {
  priorities: Array<string>;
  equityBands: Array<string>;
  foodNeedBands: Array<string>;
  includeUnreachableGrocery: boolean;
} & Record<NumericFilterKey, string>;

export type OpportunityFilterErrors = Partial<Record<NumericFilterKey | "form", string>>;

export function draftFromOpportunityFilters(
  filters: OpportunityFilterState,
): OpportunityFilterDraft {
  return {
    priorities: filters.priorities.map(String),
    equityBands: [...filters.equityBands],
    equityPercentileMinimum: filters.equityPercentileMinimum?.toString() ?? "",
    foodNeedBands: [...filters.foodNeedBands],
    foodNeedPercentileMinimum: filters.foodNeedPercentileMinimum?.toString() ?? "",
    noVehicleMinimumPercent: filters.noVehicleMinimumPercent?.toString() ?? "",
    snapLowAccessMinimumPercent: filters.snapLowAccessMinimumPercent?.toString() ?? "",
    groceryWalkMinimumMinutes: filters.groceryWalkMinimumMinutes?.toString() ?? "",
    includeUnreachableGrocery: filters.includeUnreachableGrocery,
    transitMaximumTripsPerHour: filters.transitMaximumTripsPerHour?.toString() ?? "",
  };
}

const twoDecimalNumber = /^\d+(?:\.\d{1,2})?$/;

function parseNumericDraft(
  raw: string,
  maximum: number | null,
): {error?: string; value: number | null} {
  const value = raw.trim();
  if (value === "") {
    return {value: null};
  }
  const numericValue = Number(value);
  const rangeIsValid = numericValue >= 0 && (maximum === null || numericValue <= maximum);
  if (!twoDecimalNumber.test(value) || !Number.isFinite(numericValue) || !rangeIsValid) {
    return {
      error: maximum === 100
        ? "Use a number from 0 through 100 with no more than two decimal places."
        : "Use zero or a positive number with no more than two decimal places.",
      value: null,
    };
  }
  return {value: numericValue};
}

export type OpportunityDraftValidation =
  | {errors: OpportunityFilterErrors; success: false}
  | {errors: OpportunityFilterErrors; filters: OpportunityFilterState; success: true};

export function validateOpportunityFilterDraft(
  draft: OpportunityFilterDraft,
): OpportunityDraftValidation {
  const errors: OpportunityFilterErrors = {};
  const allowedPriorities = new Set(OPPORTUNITY_PRIORITIES.map(String));
  const allowedBands = new Set<string>(OPPORTUNITY_BANDS.map(({value}) => value));
  if (
    draft.priorities.some((value) => !allowedPriorities.has(value))
    || draft.equityBands.some((value) => !allowedBands.has(value))
    || draft.foodNeedBands.some((value) => !allowedBands.has(value))
  ) {
    errors.form = "One or more choices are not recognized. Review the selected filters.";
  }

  const parsed = Object.fromEntries(NUMERIC_FILTER_KEYS.map((key) => {
    const result = parseNumericDraft(
      draft[key],
      key === "groceryWalkMinimumMinutes" || key === "transitMaximumTripsPerHour"
        ? null
        : 100,
    );
    if (result.error) {
      errors[key] = result.error;
    }
    return [key, result.value];
  })) as Record<NumericFilterKey, number | null>;

  if (Object.keys(errors).length > 0) {
    return {errors, success: false};
  }

  const filters = opportunityFilterStateSchema.safeParse({
    priorities: draft.priorities.map(Number),
    equityBands: draft.equityBands,
    equityPercentileMinimum: parsed.equityPercentileMinimum,
    foodNeedBands: draft.foodNeedBands,
    foodNeedPercentileMinimum: parsed.foodNeedPercentileMinimum,
    noVehicleMinimumPercent: parsed.noVehicleMinimumPercent,
    snapLowAccessMinimumPercent: parsed.snapLowAccessMinimumPercent,
    groceryWalkMinimumMinutes: parsed.groceryWalkMinimumMinutes,
    includeUnreachableGrocery: draft.includeUnreachableGrocery,
    transitMaximumTripsPerHour: parsed.transitMaximumTripsPerHour,
  });
  if (!filters.success) {
    return {
      errors: {form: "These filters could not be applied safely. Review every choice."},
      success: false,
    };
  }
  return {errors, filters: filters.data, success: true};
}

export function countOpportunityFilters(filters: OpportunityFilterState): number {
  return filters.priorities.length
    + filters.equityBands.length
    + filters.foodNeedBands.length
    + NUMERIC_FILTER_KEYS.filter((key) => filters[key] !== null).length
    + Number(filters.includeUnreachableGrocery);
}
