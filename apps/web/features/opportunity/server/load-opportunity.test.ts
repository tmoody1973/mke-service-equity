import type {
  OpportunityAvailableResponse,
  OpportunityFilterState,
} from "@mke/contracts";
import {
  OpportunityDataIntegrityError,
  type AtlasRunSelection,
} from "@mke/database/server";
import {describe, expect, it, vi} from "vitest";
import {
  loadOpportunity,
  type LoadOpportunityDependencies,
} from "./load-opportunity";

const previewRun = {
  state: "selected",
  mode: "validated_preview",
  run: {
    id: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
    methodologyVersion: "food-equity-v1",
    equityBaselineMethodologyVersion: "equity-baseline-v1",
    completedAt: "2026-08-30T12:00:00.000Z",
    dataVintages: {acs: "2020-2024"},
  },
  equityBaselineRunId: "502e2a04-b013-53cd-8b09-c9144862701a",
  foodOutputHash: "a".repeat(64),
  equityBaselineOutputHash: "b".repeat(64),
} satisfies AtlasRunSelection;

const publishedRun = {...previewRun, mode: "published"} satisfies AtlasRunSelection;

const filters: OpportunityFilterState = {
  priorities: [1, 2],
  equityBands: [],
  equityPercentileMinimum: null,
  foodNeedBands: [],
  foodNeedPercentileMinimum: null,
  noVehicleMinimumPercent: null,
  snapLowAccessMinimumPercent: null,
  groceryWalkMinimumMinutes: null,
  includeUnreachableGrocery: false,
  transitMaximumTripsPerHour: null,
};

const matchingArea = {
  runId: previewRun.run.id,
  tract: {
    geoid: "55079990000",
    name: "Census Tract 9900",
    population: 0,
    geographyVintage: "2020",
    foodEquityPriority: null,
    foodAccessNeedBand: null,
    equityBaselineBand: null,
    qualityStatus: "ineligible_zero_population" as const,
    exclusionReasons: ["zero_population"],
  },
  scores: {
    foodAccessNeedPercentile: null,
    equityBaselinePercentile: null,
    retailAccessScore: null,
    transportationConstraintScore: null,
  },
};

const availableResponse: OpportunityAvailableResponse = {
  state: "available",
  mode: "validated_preview",
  run: previewRun.run,
  filters,
  summary: {
    matchingTractCount: 1,
    knownPopulationLivingInMatchingTracts: 0,
    matchingTractsMissingPopulation: 0,
    excludedForMissingFilterData: 0,
  },
  matchingAreas: [matchingArea],
};

function dependencies(
  overrides: Partial<LoadOpportunityDependencies> = {},
): LoadOpportunityDependencies {
  return {
    markRequestTime: vi.fn(() => Promise.resolve()),
    selectRun: vi.fn(() => Promise.resolve(previewRun)),
    loadValidatedPreview: vi.fn(() => Promise.resolve(availableResponse)),
    loadImmutablePublished: vi.fn(() => Promise.resolve({
      ...availableResponse,
      mode: "published" as const,
    })),
    reportFailure: vi.fn(),
    ...overrides,
  };
}

describe("loadOpportunity", () => {
  it("rejects invalid filters before run selection", async () => {
    const deps = dependencies();

    await expect(loadOpportunity({priorities: [9]}, {}, deps)).resolves.toEqual({
      state: "unavailable",
      reason: "invalid_filters",
    });
    expect(deps.markRequestTime).not.toHaveBeenCalled();
    expect(deps.selectRun).not.toHaveBeenCalled();
  });

  it("preserves public fail-closed selection without querying results", async () => {
    const deps = dependencies({
      selectRun: vi.fn(() => Promise.resolve({
        state: "unavailable" as const,
        reason: "no_published_run" as const,
      })),
    });

    await expect(loadOpportunity(filters, {}, deps)).resolves.toEqual({
      state: "unavailable",
      reason: "no_published_run",
    });
    expect(deps.markRequestTime).toHaveBeenCalledOnce();
    expect(deps.loadValidatedPreview).not.toHaveBeenCalled();
    expect(deps.loadImmutablePublished).not.toHaveBeenCalled();
  });

  it("passes one exact selected preview run and normalized filters to the uncached loader", async () => {
    const environment = {MKE_ATLAS_DATA_MODE: "validated_preview"};
    const deps = dependencies();

    await expect(loadOpportunity(filters, environment, deps)).resolves.toEqual(availableResponse);
    expect(deps.selectRun).toHaveBeenCalledOnce();
    expect(deps.loadValidatedPreview).toHaveBeenCalledWith(previewRun, filters, environment);
    expect(vi.mocked(deps.loadValidatedPreview).mock.calls[0]?.[0]).toBe(previewRun);
    expect(deps.loadImmutablePublished).not.toHaveBeenCalled();
  });

  it("loads validated preview data again for every request", async () => {
    const environment = {MKE_ATLAS_DATA_MODE: "validated_preview"};
    const deps = dependencies();

    await loadOpportunity(filters, environment, deps);
    await loadOpportunity(filters, environment, deps);

    expect(deps.markRequestTime).toHaveBeenCalledTimes(2);
    expect(deps.selectRun).toHaveBeenCalledTimes(2);
    expect(deps.loadValidatedPreview).toHaveBeenCalledTimes(2);
    expect(deps.loadImmutablePublished).not.toHaveBeenCalled();
  });

  it("keeps immutable published loading behind its own cache seam", async () => {
    const publishedResponse = {...availableResponse, mode: "published" as const};
    const deps = dependencies({
      selectRun: vi.fn(() => Promise.resolve(publishedRun)),
      loadImmutablePublished: vi.fn(() => Promise.resolve(publishedResponse)),
    });

    await expect(loadOpportunity(filters, {}, deps)).resolves.toEqual(publishedResponse);
    expect(deps.loadImmutablePublished).toHaveBeenCalledWith(publishedRun, filters, {});
    expect(deps.loadValidatedPreview).not.toHaveBeenCalled();
  });

  it("redacts integrity and database failures while preserving their diagnostic class", async () => {
    const integrityDependencies = dependencies({
      loadValidatedPreview: vi.fn(() => Promise.reject(
        new OpportunityDataIntegrityError("mixed_run_evidence"),
      )),
    });
    const databaseDependencies = dependencies({
      loadValidatedPreview: vi.fn(() => Promise.reject(
        new Error("postgresql://user:secret@example.test/mke"),
      )),
    });

    await expect(loadOpportunity(filters, {}, integrityDependencies)).resolves.toEqual({
      state: "unavailable",
      reason: "results_incomplete",
    });
    await expect(loadOpportunity(filters, {}, databaseDependencies)).resolves.toEqual({
      state: "unavailable",
      reason: "results_incomplete",
    });
    expect(integrityDependencies.reportFailure).toHaveBeenCalledWith(expect.objectContaining({
      scope: "opportunity",
      kind: "integrity",
    }));
    expect(databaseDependencies.reportFailure).toHaveBeenCalledWith(expect.objectContaining({
      scope: "opportunity",
      kind: "database",
    }));
  });

  it("revalidates repository output and exact filters at the server boundary", async () => {
    const deps = dependencies({
      loadValidatedPreview: vi.fn(() => Promise.resolve({
        ...availableResponse,
        filters: {...filters, priorities: [5]},
      })),
    });

    await expect(loadOpportunity(filters, {}, deps)).resolves.toEqual({
      state: "unavailable",
      reason: "results_incomplete",
    });
    expect(deps.reportFailure).toHaveBeenCalledWith(expect.objectContaining({kind: "integrity"}));
  });
});
