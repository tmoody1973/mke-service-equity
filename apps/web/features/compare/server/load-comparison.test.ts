import type {CompareAvailableResponse} from "@mke/contracts";
import {
  ComparisonDataIntegrityError,
  type AtlasRunSelection,
} from "@mke/database/server";
import {describe, expect, it, vi} from "vitest";
import {
  loadComparison,
  type LoadComparisonDependencies,
} from "./load-comparison";

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

const publishedRun = {
  ...previewRun,
  mode: "published",
} satisfies AtlasRunSelection;

const tracts = ["55079990000", "55079990100"];

function emptyTract(geoid: string, name: string) {
  return {
    runId: previewRun.run.id,
    tract: {
      geoid,
      name,
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
    foodAccessMeasures: [],
    equityIndicators: [],
  };
}

const availableResponse: CompareAvailableResponse = {
  state: "available",
  mode: "validated_preview",
  run: previewRun.run,
  request: {tracts},
  tracts: [
    emptyTract(tracts[0] as string, "Census Tract 9900"),
    emptyTract(tracts[1] as string, "Census Tract 9901"),
  ],
  sources: [],
};

function dependencies(
  overrides: Partial<LoadComparisonDependencies> = {},
): LoadComparisonDependencies {
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

describe("loadComparison", () => {
  it("rejects a non-analytical setup request before run selection", async () => {
    const deps = dependencies();

    await expect(loadComparison([tracts[0] as string], {}, deps)).resolves.toEqual({
      state: "unavailable",
      reason: "invalid_request",
    });
    expect(deps.markRequestTime).not.toHaveBeenCalled();
    expect(deps.selectRun).not.toHaveBeenCalled();
  });

  it("preserves public fail-closed selection without querying comparison data", async () => {
    const deps = dependencies({
      selectRun: vi.fn(() => Promise.resolve({
        state: "unavailable" as const,
        reason: "no_published_run" as const,
      })),
    });

    await expect(loadComparison(tracts, {}, deps)).resolves.toEqual({
      state: "unavailable",
      reason: "no_published_run",
    });
    expect(deps.markRequestTime).toHaveBeenCalledOnce();
    expect(deps.loadValidatedPreview).not.toHaveBeenCalled();
    expect(deps.loadImmutablePublished).not.toHaveBeenCalled();
  });

  it("passes the one exact selected preview run and request to the uncached loader", async () => {
    const environment = {MKE_ATLAS_DATA_MODE: "validated_preview"};
    const deps = dependencies();

    await expect(loadComparison(tracts, environment, deps)).resolves.toEqual(availableResponse);
    expect(deps.selectRun).toHaveBeenCalledOnce();
    expect(deps.loadValidatedPreview).toHaveBeenCalledWith(previewRun, tracts, environment);
    expect(vi.mocked(deps.loadValidatedPreview).mock.calls[0]?.[0]).toBe(previewRun);
    expect(deps.loadImmutablePublished).not.toHaveBeenCalled();
  });

  it("loads validated preview data again for every request", async () => {
    const environment = {MKE_ATLAS_DATA_MODE: "validated_preview"};
    const deps = dependencies();

    await loadComparison(tracts, environment, deps);
    await loadComparison(tracts, environment, deps);

    expect(deps.markRequestTime).toHaveBeenCalledTimes(2);
    expect(deps.selectRun).toHaveBeenCalledTimes(2);
    expect(deps.loadValidatedPreview).toHaveBeenCalledTimes(2);
    expect(deps.loadImmutablePublished).not.toHaveBeenCalled();
  });

  it("keeps immutable published loading behind its own cache seam", async () => {
    const publishedResponse = {
      ...availableResponse,
      mode: "published" as const,
    };
    const deps = dependencies({
      selectRun: vi.fn(() => Promise.resolve(publishedRun)),
      loadImmutablePublished: vi.fn(() => Promise.resolve(publishedResponse)),
    });

    await expect(loadComparison(tracts, {}, deps)).resolves.toEqual(publishedResponse);
    expect(deps.loadImmutablePublished).toHaveBeenCalledWith(publishedRun, tracts, {});
    expect(deps.loadValidatedPreview).not.toHaveBeenCalled();
  });

  it("returns unknown_tract for an unavailable requested geography without a partial result", async () => {
    const deps = dependencies({
      loadValidatedPreview: vi.fn(() => Promise.reject(
        new ComparisonDataIntegrityError("comparison_requested_tract_unavailable"),
      )),
    });

    await expect(loadComparison(tracts, {}, deps)).resolves.toEqual({
      state: "unavailable",
      reason: "unknown_tract",
    });
    expect(deps.reportFailure).toHaveBeenCalledWith(expect.objectContaining({
      scope: "compare",
      kind: "unavailable_tract",
    }));
  });

  it("redacts integrity and database failures while preserving their diagnostic class", async () => {
    const integrityDependencies = dependencies({
      loadValidatedPreview: vi.fn(() => Promise.reject(
        new ComparisonDataIntegrityError("mixed_run_evidence"),
      )),
    });
    const databaseDependencies = dependencies({
      loadValidatedPreview: vi.fn(() => Promise.reject(
        new Error("postgresql://user:secret@example.test/mke"),
      )),
    });

    await expect(loadComparison(tracts, {}, integrityDependencies)).resolves.toEqual({
      state: "unavailable",
      reason: "comparison_incomplete",
    });
    await expect(loadComparison(tracts, {}, databaseDependencies)).resolves.toEqual({
      state: "unavailable",
      reason: "comparison_incomplete",
    });
    expect(integrityDependencies.reportFailure).toHaveBeenCalledWith(expect.objectContaining({
      kind: "integrity",
    }));
    expect(databaseDependencies.reportFailure).toHaveBeenCalledWith(expect.objectContaining({
      kind: "database",
    }));
  });

  it("revalidates repository output at the server boundary", async () => {
    const deps = dependencies({
      loadValidatedPreview: vi.fn(() => Promise.resolve({
        ...availableResponse,
        run: {...availableResponse.run, id: "11111111-1111-4111-8111-111111111111"},
      } as CompareAvailableResponse)),
    });

    await expect(loadComparison(tracts, {}, deps)).resolves.toEqual({
      state: "unavailable",
      reason: "comparison_incomplete",
    });
    expect(deps.reportFailure).toHaveBeenCalledWith(expect.objectContaining({kind: "integrity"}));
  });
});
