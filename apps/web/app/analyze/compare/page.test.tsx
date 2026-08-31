import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  loadAnalysisAvailability: vi.fn(),
  loadComparison: vi.fn(),
}));

vi.mock("../../../features/analyze/server/load-analysis-availability", () => ({
  loadAnalysisAvailability: mocks.loadAnalysisAvailability,
}));
vi.mock("../../../features/compare/server/load-comparison", () => ({
  loadComparison: mocks.loadComparison,
}));

import CompareRoute, {metadata} from "./page";

describe("CompareRoute", () => {
  beforeEach(() => {
    mocks.loadAnalysisAvailability.mockReset();
    mocks.loadComparison.mockReset();
    mocks.loadAnalysisAvailability.mockResolvedValue({
      state: "unavailable",
      reason: "no_published_run",
    });
    mocks.loadComparison.mockResolvedValue({
      state: "unavailable",
      reason: "no_published_run",
    });
  });

  it("uses the publication gate for empty setup without querying a comparison", async () => {
    await CompareRoute({searchParams: Promise.resolve({})});

    expect(mocks.loadAnalysisAvailability).toHaveBeenCalledOnce();
    expect(mocks.loadComparison).not.toHaveBeenCalled();
  });

  it("loads two valid tracts once and preserves their selected order", async () => {
    await CompareRoute({searchParams: Promise.resolve({
      tract: ["55079000300", "55079000101"],
    })});

    expect(mocks.loadComparison).toHaveBeenCalledOnce();
    expect(mocks.loadComparison).toHaveBeenCalledWith([
      "55079000300",
      "55079000101",
    ]);
    expect(mocks.loadAnalysisAvailability).not.toHaveBeenCalled();
  });

  it("does not load data for an invalid duplicate URL", async () => {
    await CompareRoute({searchParams: Promise.resolve({
      tract: ["55079000101", "55079000101"],
    })});

    expect(mocks.loadAnalysisAvailability).not.toHaveBeenCalled();
    expect(mocks.loadComparison).not.toHaveBeenCalled();
  });

  it("defines the route-specific document title", () => {
    expect(metadata.title).toBe("Compare Areas | MKE Service Equity");
  });
});
