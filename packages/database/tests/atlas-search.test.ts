import {describe, expect, it, vi} from "vitest";
import {
  AtlasSearchIntegrityError,
  buildAtlasSearchResponse,
  loadAtlasSearchResults,
} from "../src/atlas/search-repository";

const selectedRun = {
  state: "selected" as const,
  mode: "validated_preview" as const,
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

describe("buildAtlasSearchResponse", () => {
  it("builds browser-safe tract and neighborhood results", () => {
    const response = buildAtlasSearchResponse("Northridge", [
      {
        kind: "neighborhood",
        geoid: "55079185700",
        title: "Northridge",
        tract_name: "Census Tract 1857",
        source_neighborhood_id: 117,
        covered_area_share: "0.428",
      },
      {
        kind: "tract",
        geoid: "55079185700",
        title: "Census Tract 1857",
        tract_name: "Census Tract 1857",
      },
    ], "available");

    expect(response.results).toEqual([
      expect.objectContaining({
        id: "neighborhood:117:55079185700",
        geoid: "55079185700",
        subtitle: "Census Tract 1857 · 42.8% of its City-covered area",
      }),
      expect.objectContaining({id: "tract:55079185700"}),
    ]);
  });

  it("fails closed on duplicate or malformed results", () => {
    const duplicate = {
      kind: "tract",
      geoid: "55079185700",
      title: "Census Tract 1857",
      tract_name: "Census Tract 1857",
    };
    expect(() => buildAtlasSearchResponse("1857", [duplicate, duplicate], "available"))
      .toThrowError(new AtlasSearchIntegrityError("duplicate_search_result"));
    expect(() => buildAtlasSearchResponse("1857", [{...duplicate, geoid: "1857"}], "available"))
      .toThrowError(new AtlasSearchIntegrityError("invalid_search_contract"));
  });
});

describe("loadAtlasSearchResults", () => {
  it("uses the exact run and snapshot in parameterized server-side queries", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({rows: [{validation_status: "valid"}]})
      .mockResolvedValueOnce({rows: [{
        kind: "neighborhood",
        geoid: "55079185700",
        title: "Northridge",
        tract_name: "Census Tract 1857",
        source_neighborhood_id: 117,
        covered_area_share: 0.428,
      }]});
    const response = await loadAtlasSearchResults(selectedRun, "Northridge", {
      DATABASE_URL: "postgresql://example.test/database",
      MKE_ATLAS_NEIGHBORHOOD_SNAPSHOT_ID: "f3da2bdf-27db-5f41-9338-f95264be0301",
    }, () => ({execute}));

    expect(response.neighborhoodReferenceStatus).toBe("available");
    expect(response.results).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(2);
    const searchQuery = execute.mock.calls[1]?.[0] as {
      queryChunks: Array<string | {value?: Array<string>}>;
    };
    const boundValues = searchQuery.queryChunks.filter(
      (chunk): chunk is string => typeof chunk === "string",
    );
    const sqlText = searchQuery.queryChunks.flatMap(
      (chunk) => typeof chunk === "string" ? [] : chunk.value ?? [],
    ).join(" ");
    expect(boundValues).toContain("Northridge");
    expect(boundValues).toContain(selectedRun.run.id);
    expect(sqlText).not.toContain("Northridge");
    expect(sqlText).not.toContain(selectedRun.run.id);
  });

  it("returns tract results but removes neighborhood rows when no valid snapshot is pinned", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({rows: []})
      .mockResolvedValueOnce({rows: [
        {
          kind: "tract",
          geoid: "55079185700",
          title: "Census Tract 1857",
          tract_name: "Census Tract 1857",
        },
        {
          kind: "neighborhood",
          geoid: "55079185700",
          title: "Northridge",
          tract_name: "Census Tract 1857",
          source_neighborhood_id: 117,
          covered_area_share: 0.428,
        },
      ]});
    const response = await loadAtlasSearchResults(selectedRun, "1857", {
      DATABASE_URL: "postgresql://example.test/database",
    }, () => ({execute}));

    expect(response.neighborhoodReferenceStatus).toBe("unavailable");
    expect(response.results).toEqual([expect.objectContaining({kind: "tract"})]);
  });
});
