import type {AtlasTractFeatureCollection} from "@mke/contracts";
import type {AtlasRunSelection} from "@mke/database/server";
import {describe, expect, it, vi} from "vitest";
import {loadAtlas, type LoadAtlasDependencies} from "./load-atlas";

const selectedRun: AtlasRunSelection = {
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
};

const tracts: AtlasTractFeatureCollection = {
  type: "FeatureCollection" as const,
  features: [{
    type: "Feature" as const,
    id: "55079000101",
    geometry: {
      type: "MultiPolygon" as const,
      coordinates: [[[[-87.95, 43.03], [-87.94, 43.03], [-87.94, 43.04], [-87.95, 43.03]]]],
    },
    properties: {
      geoid: "55079000101",
      name: "Census Tract 1.01",
      population: 2_430,
      geographyVintage: "2020",
      foodEquityPriority: 1 as const,
      foodAccessNeedBand: "very_high" as const,
      equityBaselineBand: "high" as const,
      qualityStatus: "complete" as const,
      exclusionReasons: [],
    },
  }],
};

function dependencies(overrides: Partial<LoadAtlasDependencies> = {}): LoadAtlasDependencies {
  return {
    selectRun: vi.fn(() => Promise.resolve(selectedRun)),
    loadTracts: vi.fn(() => Promise.resolve(tracts)),
    loadFoodSites: vi.fn(() => Promise.resolve({
      state: "unavailable" as const,
      reason: "snapshot_not_configured" as const,
    })),
    ...overrides,
  };
}

describe("loadAtlas", () => {
  it("returns the validated preview contract after server-side selection and query", async () => {
    await expect(loadAtlas({}, dependencies())).resolves.toEqual({
      state: "available",
      mode: "validated_preview",
      run: selectedRun.state === "selected" ? selectedRun.run : undefined,
      tracts,
      contextLayers: {
        foodSites: {state: "unavailable", reason: "snapshot_not_configured"},
      },
    });
  });

  it.each([
    "no_published_run",
    "preview_not_allowed",
    "run_not_found",
    "run_not_validated",
    "data_incomplete",
  ] as const)("preserves the safe unavailable reason %s", async (reason) => {
    const loadTracts = vi.fn();
    const result = await loadAtlas({}, dependencies({
      selectRun: vi.fn(() => Promise.resolve({state: "unavailable" as const, reason})),
      loadTracts,
    }));

    expect(result).toEqual({state: "unavailable", reason});
    expect(loadTracts).not.toHaveBeenCalled();
  });

  it("redacts database errors into data_incomplete", async () => {
    await expect(loadAtlas({}, dependencies({
      loadTracts: vi.fn(() => Promise.reject(new Error("postgresql://user:secret@example/mke"))),
    }))).resolves.toEqual({state: "unavailable", reason: "data_incomplete"});
  });

  it("loads the approved immutable food-site display snapshot with its exact checksum", async () => {
    const {loadApprovedFoodSitesSnapshot} = await import("./load-atlas");
    const layer = loadApprovedFoodSitesSnapshot();

    expect(layer.state).toBe("available");
    if (layer.state === "available") {
      expect(layer.features.features).toHaveLength(89);
      expect(layer.affectsScores).toBe(false);
      expect(layer.source.sourceSnapshotSha256)
        .toBe("5b86d359dd55e008836dfba4f4bde45d0561567bcce9d346882392a744e77f94");
    }
  });

  it("fails closed when a dependency violates the outbound browser contract", async () => {
    await expect(loadAtlas({}, dependencies({
      loadTracts: vi.fn(() => Promise.resolve({
        ...tracts,
        features: [{...tracts.features[0], storageUri: "s3://private/source.zip"}],
      } as never)),
    }))).resolves.toEqual({state: "unavailable", reason: "data_incomplete"});
  });
});
