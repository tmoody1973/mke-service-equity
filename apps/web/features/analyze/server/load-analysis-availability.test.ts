import type {AtlasRunSelection} from "@mke/database/server";
import {describe, expect, it, vi} from "vitest";
import {
  loadAnalysisAvailability,
  type LoadAnalysisAvailabilityDependencies,
} from "./load-analysis-availability";

const previewRun = {
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
} satisfies AtlasRunSelection;

function dependencies(
  selection: AtlasRunSelection,
): LoadAnalysisAvailabilityDependencies {
  return {
    markRequestTime: vi.fn(() => Promise.resolve()),
    selectRun: vi.fn(() => Promise.resolve(selection)),
  };
}

describe("loadAnalysisAvailability", () => {
  it("returns only the safe mode for an available validated preview", async () => {
    const deps = dependencies(previewRun);
    await expect(loadAnalysisAvailability({}, deps)).resolves.toEqual({
      state: "available",
      mode: "validated_preview",
    });
    expect(deps.selectRun).toHaveBeenCalledOnce();
  });

  it("preserves the public fail-closed reason without exposing a run", async () => {
    await expect(loadAnalysisAvailability({}, dependencies({
      state: "unavailable",
      reason: "no_published_run",
    }))).resolves.toEqual({state: "unavailable", reason: "no_published_run"});
  });

  it("redacts unexpected failures", async () => {
    const deps = dependencies(previewRun);
    deps.selectRun = vi.fn(() => Promise.reject(new Error("secret database path")));
    await expect(loadAnalysisAvailability({}, deps)).resolves.toEqual({
      state: "unavailable",
      reason: "data_incomplete",
    });
  });
});
