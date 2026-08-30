import {describe, expect, it} from "vitest";
import {
  buildNeighborhoodContext,
  NeighborhoodContextIntegrityError,
} from "../src/atlas/neighborhood-context";

const contextRow = {
  city_reference_coverage: "0.999",
  validation_status: "valid",
  source_name: "Milwaukee Neighborhood Identification Project",
  source_publisher: "City of Milwaukee Department of City Development",
  dataset_version: "2000_reference_january_2007_catalog_update",
  source_url: "https://milwaukeemaps.milwaukee.gov/arcgis/rest/services/AGO/neighborhoods/MapServer/0",
  retrieved_at: new Date("2026-08-30T17:40:52Z"),
  methodology_url: "https://city.milwaukee.gov/mapmilwaukee/DownloadMapData3497",
};

describe("buildNeighborhoodContext", () => {
  it("uses spans when coverage is high and no neighborhood has a majority", () => {
    const context = buildNeighborhoodContext([contextRow], [
      {source_neighborhood_id: 1, name: "NORTHRIDGE", covered_area_share: "0.428"},
      {source_neighborhood_id: 2, name: "NORTHRIDGE LAKES", covered_area_share: "0.334"},
      {source_neighborhood_id: 3, name: "RIDGEVIEW", covered_area_share: "0.156"},
      {source_neighborhood_id: 4, name: "HILLTOP PARISH", covered_area_share: "0.074"},
      {source_neighborhood_id: 5, name: "BOUNDARY", covered_area_share: "0.008"},
    ]);

    expect(context).toMatchObject({
      state: "available",
      labelKind: "spans",
      cityReferenceCoverage: 0.999,
      otherBoundarySliversShare: 0.008,
    });
    if (context.state === "available") {
      expect(context.overlaps.map((overlap) => overlap.name)).toEqual([
        "NORTHRIDGE",
        "NORTHRIDGE LAKES",
        "RIDGEVIEW",
        "HILLTOP PARISH",
      ]);
    }
  });

  it("does not force a neighborhood when the City reference has no coverage", () => {
    expect(buildNeighborhoodContext([
      {...contextRow, city_reference_coverage: "0"},
    ], [])).toMatchObject({state: "available", labelKind: "no_reference", overlaps: []});
  });

  it("rejects out-of-order or incomplete overlap lineage", () => {
    expect(() => buildNeighborhoodContext([contextRow], [
      {source_neighborhood_id: 2, name: "SMALL", covered_area_share: "0.4"},
      {source_neighborhood_id: 1, name: "LARGE", covered_area_share: "0.6"},
    ])).toThrow(NeighborhoodContextIntegrityError);
    expect(() => buildNeighborhoodContext([contextRow], [
      {source_neighborhood_id: 1, name: "ONLY", covered_area_share: "0.8"},
    ])).toThrow(/sum_mismatch/);
  });
});
