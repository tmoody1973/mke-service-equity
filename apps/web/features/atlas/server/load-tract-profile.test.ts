import type {AtlasTractProfile} from "@mke/contracts";
import type {AtlasRunSelection} from "@mke/database/server";
import {describe, expect, it, vi} from "vitest";
import {
  loadTractProfile,
  type LoadTractProfileDependencies,
} from "./load-tract-profile";

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

const source = {
  sourceName: "American Community Survey 5-year estimates",
  publisher: "U.S. Census Bureau",
  datasetVersion: "2024 ACS 5-year",
  sourceUrl: "https://api.census.gov/data/2024/acs/acs5",
  retrievedAt: "2026-08-29T12:00:00.000Z",
  validFrom: null,
  validTo: null,
  methodologyUrl: "https://www.census.gov/programs-surveys/acs/methodology.html",
  limitation: null,
} as const;

function evidence(slug: string, index: number) {
  return {
    slug,
    name: `Measure ${index}`,
    definition: "A scored measure.",
    domain: "retail_access",
    dataYear: null,
    measurement: {
      state: "observed" as const,
      value: index,
      unit: "percent",
      qualityStatus: "verified" as const,
      marginOfError: null,
      confidenceLow: null,
      confidenceHigh: null,
    },
    countyPercentile: 50,
    effectiveWeight: 0.25,
    contribution: 0,
    higherIsWorse: true,
    provenance: [source],
    nearestResource: null,
    limitation: null,
  };
}

const profile: AtlasTractProfile = {
  runId: selectedRun.state === "selected" ? selectedRun.run.id : "",
  tract: {
    geoid: "55079000101",
    name: "Census Tract 1.01",
    population: 2_430,
    geographyVintage: "2020 TIGER/Line",
    foodEquityPriority: 1,
    foodAccessNeedBand: "very_high",
    equityBaselineBand: "high",
    qualityStatus: "complete",
    exclusionReasons: [],
  },
  explanation: "Priority 1 reflects high measured need and access barriers.",
  scores: {
    foodAccessNeedPercentile: 84,
    equityBaselinePercentile: 74,
    retailAccessScore: 80,
    transportationConstraintScore: 70,
  },
  foodComponents: Array.from({length: 4}, (_, index) => evidence(`food-${index}`, index)),
  equityDrivers: Array.from({length: 13}, (_, index) => ({
    ...evidence(`equity-${index}`, index),
    domain: "demographic",
  })),
  context: {state: "unavailable", reason: "not_pinned_to_run"},
  provenance: [source],
  limitations: ["Tract measures do not describe every person."],
};

function dependencies(
  overrides: Partial<LoadTractProfileDependencies> = {},
): LoadTractProfileDependencies {
  return {
    selectRun: vi.fn(() => Promise.resolve(selectedRun)),
    loadProfile: vi.fn(() => Promise.resolve(profile)),
    ...overrides,
  };
}

describe("loadTractProfile", () => {
  it("returns the exact selected run and tract through the browser-safe contract", async () => {
    await expect(loadTractProfile("55079000101", {}, dependencies())).resolves.toEqual({
      state: "available",
      profile,
    });
  });

  it("rejects malformed GEOIDs before run selection", async () => {
    const selectRun = vi.fn();
    await expect(loadTractProfile("not-a-tract", {}, dependencies({selectRun}))).resolves.toEqual({
      state: "unavailable",
      reason: "invalid_tract",
    });
    expect(selectRun).not.toHaveBeenCalled();
  });

  it("preserves safe Atlas run-selection failures", async () => {
    await expect(loadTractProfile("55079000101", {}, dependencies({
      selectRun: vi.fn(() => Promise.resolve({
        state: "unavailable" as const,
        reason: "no_published_run" as const,
      })),
    }))).resolves.toEqual({state: "unavailable", reason: "no_published_run"});
  });

  it("fails closed when the profile does not match the selected run or tract", async () => {
    await expect(loadTractProfile("55079000101", {}, dependencies({
      loadProfile: vi.fn(() => Promise.resolve({
        ...profile,
        tract: {...profile.tract, geoid: "55079000102"},
      })),
    }))).resolves.toEqual({state: "unavailable", reason: "profile_incomplete"});
  });

  it("redacts repository errors", async () => {
    await expect(loadTractProfile("55079000101", {}, dependencies({
      loadProfile: vi.fn(() => Promise.reject(new Error("postgresql://secret"))),
    }))).resolves.toEqual({state: "unavailable", reason: "profile_incomplete"});
  });
});
