import {
  opportunityFilterStateSchema,
  type OpportunityFilterState,
} from "@mke/contracts";

type SearchParamsReader = {
  getAll(name: string): Array<string>;
  toString(): string;
};

export const OPPORTUNITY_PARAMETER_ORDER = [
  "priorities",
  "equity-bands",
  "equity-percentile-minimum",
  "food-need-bands",
  "food-need-percentile-minimum",
  "no-vehicle-minimum-percent",
  "snap-low-access-minimum-percent",
  "grocery-walk-minimum-minutes",
  "include-unreachable-grocery",
  "transit-maximum-trips-per-hour",
] as const;

type OpportunityParameter = (typeof OPPORTUNITY_PARAMETER_ORDER)[number];

export type OpportunityUrlParseResult = {
  state: "valid" | "invalid";
  filters: OpportunityFilterState;
  hadInvalidValues: boolean;
  invalidParameters: Array<OpportunityParameter>;
  canonicalSearchParams: URLSearchParams;
  needsCanonicalization: boolean;
};

const BAND_ORDER = ["very_low", "low", "moderate", "high", "very_high"] as const;
const bandSet = new Set<string>(BAND_ORDER);

function readPriorities(
  searchParams: SearchParamsReader,
  invalid: Set<OpportunityParameter>,
): Array<number> {
  const values: Array<number> = [];
  for (const raw of searchParams.getAll("priorities")) {
    const value = Number(raw.trim());
    if (!/^\d+$/.test(raw.trim()) || !Number.isInteger(value) || value < 1 || value > 5) {
      invalid.add("priorities");
    } else {
      values.push(value);
    }
  }
  return values;
}

function readBands(
  searchParams: SearchParamsReader,
  parameter: "equity-bands" | "food-need-bands",
  invalid: Set<OpportunityParameter>,
): Array<(typeof BAND_ORDER)[number]> {
  const values: Array<(typeof BAND_ORDER)[number]> = [];
  for (const raw of searchParams.getAll(parameter)) {
    const value = raw.trim();
    if (!bandSet.has(value)) {
      invalid.add(parameter);
    } else {
      values.push(value as (typeof BAND_ORDER)[number]);
    }
  }
  return values;
}

function readNumber(
  searchParams: SearchParamsReader,
  parameter: Exclude<OpportunityParameter,
    "priorities" | "equity-bands" | "food-need-bands" | "include-unreachable-grocery">,
  invalid: Set<OpportunityParameter>,
  maximum: number | null,
): number | null {
  const rawValues = searchParams.getAll(parameter);
  if (rawValues.length === 0) {
    return null;
  }
  if (rawValues.length !== 1) {
    invalid.add(parameter);
    return null;
  }

  const raw = rawValues[0]?.trim() ?? "";
  const value = Number(raw);
  if (
    !/^\d+(?:\.\d+)?$/.test(raw)
    || !Number.isFinite(value)
    || value < 0
    || (maximum !== null && value > maximum)
  ) {
    invalid.add(parameter);
    return null;
  }
  return value;
}

function readUnreachable(
  searchParams: SearchParamsReader,
  invalid: Set<OpportunityParameter>,
): boolean {
  const values = searchParams.getAll("include-unreachable-grocery");
  if (values.length === 0) {
    return false;
  }
  if (values.length !== 1 || values[0] !== "true") {
    invalid.add("include-unreachable-grocery");
    return false;
  }
  return true;
}

export function buildOpportunitySearchParams(
  current: SearchParamsReader,
  filtersInput: unknown,
): URLSearchParams {
  const filters = opportunityFilterStateSchema.safeParse(filtersInput);
  if (!filters.success) {
    throw new Error("Invalid Opportunity URL state");
  }

  const next = new URLSearchParams(current.toString());
  for (const parameter of OPPORTUNITY_PARAMETER_ORDER) {
    next.delete(parameter);
  }

  for (const priority of filters.data.priorities) {
    next.append("priorities", String(priority));
  }
  for (const band of filters.data.equityBands) {
    next.append("equity-bands", band);
  }
  if (filters.data.equityPercentileMinimum !== null) {
    next.set("equity-percentile-minimum", String(filters.data.equityPercentileMinimum));
  }
  for (const band of filters.data.foodNeedBands) {
    next.append("food-need-bands", band);
  }
  if (filters.data.foodNeedPercentileMinimum !== null) {
    next.set("food-need-percentile-minimum", String(filters.data.foodNeedPercentileMinimum));
  }
  if (filters.data.noVehicleMinimumPercent !== null) {
    next.set("no-vehicle-minimum-percent", String(filters.data.noVehicleMinimumPercent));
  }
  if (filters.data.snapLowAccessMinimumPercent !== null) {
    next.set("snap-low-access-minimum-percent", String(filters.data.snapLowAccessMinimumPercent));
  }
  if (filters.data.groceryWalkMinimumMinutes !== null) {
    next.set("grocery-walk-minimum-minutes", String(filters.data.groceryWalkMinimumMinutes));
  }
  if (filters.data.includeUnreachableGrocery) {
    next.set("include-unreachable-grocery", "true");
  }
  if (filters.data.transitMaximumTripsPerHour !== null) {
    next.set("transit-maximum-trips-per-hour", String(
      filters.data.transitMaximumTripsPerHour,
    ));
  }

  return next;
}

export function parseOpportunityUrlState(
  searchParams: SearchParamsReader,
): OpportunityUrlParseResult {
  const invalid = new Set<OpportunityParameter>();
  const filters = opportunityFilterStateSchema.parse({
    priorities: readPriorities(searchParams, invalid),
    equityBands: readBands(searchParams, "equity-bands", invalid),
    equityPercentileMinimum: readNumber(
      searchParams,
      "equity-percentile-minimum",
      invalid,
      100,
    ),
    foodNeedBands: readBands(searchParams, "food-need-bands", invalid),
    foodNeedPercentileMinimum: readNumber(
      searchParams,
      "food-need-percentile-minimum",
      invalid,
      100,
    ),
    noVehicleMinimumPercent: readNumber(
      searchParams,
      "no-vehicle-minimum-percent",
      invalid,
      100,
    ),
    snapLowAccessMinimumPercent: readNumber(
      searchParams,
      "snap-low-access-minimum-percent",
      invalid,
      100,
    ),
    groceryWalkMinimumMinutes: readNumber(
      searchParams,
      "grocery-walk-minimum-minutes",
      invalid,
      null,
    ),
    includeUnreachableGrocery: readUnreachable(searchParams, invalid),
    transitMaximumTripsPerHour: readNumber(
      searchParams,
      "transit-maximum-trips-per-hour",
      invalid,
      null,
    ),
  });
  const canonicalSearchParams = buildOpportunitySearchParams(searchParams, filters);
  const invalidParameters = OPPORTUNITY_PARAMETER_ORDER.filter((parameter) => (
    invalid.has(parameter)
  ));

  return {
    state: invalidParameters.length === 0 ? "valid" : "invalid",
    filters,
    hadInvalidValues: invalidParameters.length > 0,
    invalidParameters,
    canonicalSearchParams,
    needsCanonicalization: canonicalSearchParams.toString() !== searchParams.toString(),
  };
}

export function opportunityHref(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
