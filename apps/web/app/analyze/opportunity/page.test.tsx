import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({loadOpportunityWorkspace: vi.fn()}));

vi.mock("../../../features/opportunity/server/load-opportunity-workspace", () => ({
  loadOpportunityWorkspace: mocks.loadOpportunityWorkspace,
}));

import OpportunityRoute, {metadata} from "./page";

describe("OpportunityRoute", () => {
  beforeEach(() => {
    mocks.loadOpportunityWorkspace.mockReset();
    mocks.loadOpportunityWorkspace.mockResolvedValue({
      response: {state: "unavailable", reason: "no_published_run"},
      tracts: null,
    });
  });

  it("loads the real no-filter result instead of a fabricated setup state", async () => {
    await OpportunityRoute({searchParams: Promise.resolve({})});

    expect(mocks.loadOpportunityWorkspace).toHaveBeenCalledOnce();
    expect(mocks.loadOpportunityWorkspace).toHaveBeenCalledWith({
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
  });

  it("does not run a partial query for invalid filter values", async () => {
    await OpportunityRoute({searchParams: Promise.resolve({
      priorities: ["1", "9"],
      utm_source: "partner",
    })});

    expect(mocks.loadOpportunityWorkspace).not.toHaveBeenCalled();
  });

  it("defines the route-specific document title", () => {
    expect(metadata.title).toBe("Opportunity Explorer | MKE Service Equity");
  });
});
