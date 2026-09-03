import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({loadAvailability: vi.fn()}));

vi.mock("../../features/data/server/load-tract-export", () => ({
  loadTractEvidenceExportAvailability: mocks.loadAvailability,
}));

import DataRoute, {metadata} from "./page";

describe("DataRoute", () => {
  beforeEach(() => {
    mocks.loadAvailability.mockReset();
    mocks.loadAvailability.mockResolvedValue({state: "unavailable", reason: "no_published_run"});
  });

  it("loads only public export availability", async () => {
    await DataRoute();
    expect(mocks.loadAvailability).toHaveBeenCalledOnce();
  });

  it("defines a plain-language page title", () => {
    expect(metadata.title).toBe("Download Data | MKE Service Equity");
  });
});
