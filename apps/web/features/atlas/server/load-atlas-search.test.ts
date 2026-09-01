import type {AtlasRunSelection, SelectedAtlasRun} from "@mke/database/server";
import {describe, expect, it, vi} from "vitest";
import {loadAtlasSearch, type LoadAtlasSearchDependencies} from "./load-atlas-search";

const selectedRun: SelectedAtlasRun = {
  state: "selected",
  mode: "validated_preview",
  run: {
    id: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
    methodologyVersion: "food-equity-v1",
    equityBaselineMethodologyVersion: "equity-baseline-v1",
    completedAt: "2026-08-30T12:00:00.000Z",
    dataVintages: {acs: "2020-2024"},
    publication: null,
  },
  equityBaselineRunId: "502e2a04-b013-53cd-8b09-c9144862701a",
  foodOutputHash: "a".repeat(64),
  equityBaselineOutputHash: "b".repeat(64),
};

function dependencies(selection: AtlasRunSelection = selectedRun): LoadAtlasSearchDependencies {
  return {
    selectRun: vi.fn(() => Promise.resolve(selection)),
    search: vi.fn((_run, query) => Promise.resolve({
      state: "available" as const,
      query,
      neighborhoodReferenceStatus: "available" as const,
      results: [{
        id: "tract:55079185700",
        kind: "tract" as const,
        geoid: "55079185700",
        title: "Census Tract 1857",
        subtitle: "Census tract ID 55079185700",
      }],
    })),
  };
}

describe("loadAtlasSearch", () => {
  it("rejects short or overlong queries before database access", async () => {
    const mocks = dependencies();

    await expect(loadAtlasSearch("n", {}, mocks)).resolves.toEqual({
      state: "unavailable",
      reason: "invalid_query",
    });
    await expect(loadAtlasSearch("x".repeat(81), {}, mocks)).resolves.toEqual({
      state: "unavailable",
      reason: "invalid_query",
    });
    expect(mocks.selectRun).not.toHaveBeenCalled();
  });

  it("returns bounded results for the exact selected run", async () => {
    const mocks = dependencies();
    const response = await loadAtlasSearch(" 1857 ", {}, mocks);

    expect(response).toEqual(expect.objectContaining({state: "available", query: "1857"}));
    expect(mocks.search).toHaveBeenCalledWith(selectedRun, "1857", {});
  });

  it("preserves public fail-closed state and redacts failures", async () => {
    await expect(loadAtlasSearch("1857", {}, dependencies({
      state: "unavailable",
      reason: "no_published_run",
    }))).resolves.toEqual({state: "unavailable", reason: "no_published_run"});

    const mocks = dependencies();
    mocks.search = vi.fn(() => Promise.reject(new Error("postgresql://secret")));
    await expect(loadAtlasSearch("1857", {}, mocks)).resolves.toEqual({
      state: "unavailable",
      reason: "search_incomplete",
    });
  });
});
