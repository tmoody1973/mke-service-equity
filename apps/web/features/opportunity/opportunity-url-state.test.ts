import {describe, expect, it} from "vitest";
import {
  buildOpportunitySearchParams,
  parseOpportunityUrlState,
} from "./opportunity-url-state";

describe("parseOpportunityUrlState", () => {
  it("parses, sorts, deduplicates, and numerically normalizes every supported filter", () => {
    const result = parseOpportunityUrlState(new URLSearchParams([
      "priorities=5",
      "priorities=1",
      "priorities=5",
      "equity-bands=high",
      "equity-bands=very_low",
      "equity-percentile-minimum=050.00",
      "food-need-bands=very_high",
      "food-need-bands=moderate",
      "food-need-percentile-minimum=25.50",
      "no-vehicle-minimum-percent=0",
      "snap-low-access-minimum-percent=10.00",
      "grocery-walk-minimum-minutes=15.250",
      "include-unreachable-grocery=true",
      "transit-maximum-trips-per-hour=06.5",
    ].join("&")));

    expect(result).toMatchObject({
      state: "valid",
      hadInvalidValues: false,
      needsCanonicalization: true,
      filters: {
        priorities: [1, 5],
        equityBands: ["very_low", "high"],
        equityPercentileMinimum: 50,
        foodNeedBands: ["moderate", "very_high"],
        foodNeedPercentileMinimum: 25.5,
        noVehicleMinimumPercent: 0,
        snapLowAccessMinimumPercent: 10,
        groceryWalkMinimumMinutes: 15.25,
        includeUnreachableGrocery: true,
        transitMaximumTripsPerHour: 6.5,
      },
    });
    expect(result.canonicalSearchParams.toString()).toBe([
      "priorities=1",
      "priorities=5",
      "equity-bands=very_low",
      "equity-bands=high",
      "equity-percentile-minimum=50",
      "food-need-bands=moderate",
      "food-need-bands=very_high",
      "food-need-percentile-minimum=25.5",
      "no-vehicle-minimum-percent=0",
      "snap-low-access-minimum-percent=10",
      "grocery-walk-minimum-minutes=15.25",
      "include-unreachable-grocery=true",
      "transit-maximum-trips-per-hour=6.5",
    ].join("&"));
  });

  it("returns an invalid recovery state and removes bad owned values without changing campaign parameters", () => {
    const result = parseOpportunityUrlState(new URLSearchParams(
      "utm_source=partner&priorities=1&priorities=9&campaign=spring&equity-bands=unknown&transit-maximum-trips-per-hour=-1",
    ));

    expect(result).toMatchObject({
      state: "invalid",
      hadInvalidValues: true,
      invalidParameters: [
        "priorities",
        "equity-bands",
        "transit-maximum-trips-per-hour",
      ],
      filters: {
        priorities: [1],
        equityBands: [],
        transitMaximumTripsPerHour: null,
      },
    });
    expect(result.canonicalSearchParams.toString()).toBe(
      "utm_source=partner&campaign=spring&priorities=1",
    );
  });

  it("treats duplicate scalar parameters as invalid instead of choosing one", () => {
    const result = parseOpportunityUrlState(new URLSearchParams(
      "no-vehicle-minimum-percent=10&no-vehicle-minimum-percent=20&utm_medium=email",
    ));

    expect(result).toMatchObject({
      state: "invalid",
      filters: {noVehicleMinimumPercent: null},
      invalidParameters: ["no-vehicle-minimum-percent"],
    });
    expect(result.canonicalSearchParams.toString()).toBe("utm_medium=email");
  });

  it("uses the strict contract defaults for an empty query", () => {
    expect(parseOpportunityUrlState(new URLSearchParams())).toMatchObject({
      state: "valid",
      hadInvalidValues: false,
      needsCanonicalization: false,
      filters: {
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
      },
    });
  });
});

describe("buildOpportunitySearchParams", () => {
  it("emits one fixed managed order and removes empty state while preserving unrelated values", () => {
    const result = buildOpportunitySearchParams(
      new URLSearchParams(
        "utm_source=partner&priorities=9&campaign=spring&include-unreachable-grocery=true",
      ),
      {
        priorities: [2, 1],
        equityBands: [],
        equityPercentileMinimum: null,
        foodNeedBands: ["high"],
        foodNeedPercentileMinimum: null,
        noVehicleMinimumPercent: 0,
        snapLowAccessMinimumPercent: null,
        groceryWalkMinimumMinutes: null,
        includeUnreachableGrocery: false,
        transitMaximumTripsPerHour: 4,
      },
    );

    expect(result.toString()).toBe(
      "utm_source=partner&campaign=spring&priorities=1&priorities=2&food-need-bands=high&no-vehicle-minimum-percent=0&transit-maximum-trips-per-hour=4",
    );
  });
});
