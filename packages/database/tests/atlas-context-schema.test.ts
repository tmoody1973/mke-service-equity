import {getTableConfig, type PgTable} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";
import {
  neighborhoods,
  neighborhoodVersions,
  tractNeighborhoodContexts,
  tractNeighborhoodOverlaps,
} from "../src/schema";

function config(table: PgTable) {
  return getTableConfig(table);
}

describe("Atlas neighborhood context schema", () => {
  it("declares four snapshot-versioned context tables with application-assigned ids", () => {
    const tables = [
      neighborhoods,
      neighborhoodVersions,
      tractNeighborhoodContexts,
      tractNeighborhoodOverlaps,
    ] as const;

    expect(tables.map((table) => config(table).name)).toEqual([
      "neighborhoods",
      "neighborhood_versions",
      "tract_neighborhood_contexts",
      "tract_neighborhood_overlaps",
    ]);
    for (const table of tables) {
      expect(table.id.getSQLType()).toBe("uuid");
      expect(table.id.primary).toBe(true);
      expect(table.id.hasDefault).toBe(false);
    }
  });

  it("pins every version and tract result to one immutable source snapshot", () => {
    expect(config(neighborhoods).foreignKeys).toHaveLength(1);
    expect(config(neighborhoodVersions).foreignKeys).toHaveLength(2);
    expect(config(tractNeighborhoodContexts).foreignKeys).toHaveLength(2);
    expect(config(tractNeighborhoodOverlaps).foreignKeys).toHaveLength(2);

    expect(config(neighborhoodVersions).uniqueConstraints.map((item) => item.getName()))
      .toEqual(expect.arrayContaining([
        "neighborhood_versions_neighborhood_snapshot_unique",
        "neighborhood_versions_snapshot_object_unique",
        "neighborhood_versions_id_snapshot_unique",
      ]));
    expect(config(tractNeighborhoodContexts).uniqueConstraints.map((item) => item.getName()))
      .toContain("tract_neighborhood_contexts_geography_snapshot_unique");
  });

  it("requires valid WGS84 multipolygons and indexed source geometry", () => {
    expect(neighborhoodVersions.geometry.getSQLType()).toBe("geometry(MultiPolygon,4326)");
    expect(config(neighborhoodVersions).indexes.map((item) => [
      item.config.name,
      item.config.method,
    ])).toContainEqual(["neighborhood_versions_geometry_gist", "gist"]);
    expect(config(neighborhoodVersions).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "neighborhood_versions_geometry_srid_check",
        "neighborhood_versions_geometry_not_empty_check",
        "neighborhood_versions_geometry_valid_check",
      ]),
    );
  });

  it("retains positive overlap areas and bounded coverage ratios", () => {
    expect(tractNeighborhoodContexts.tractAreaSqM.getSQLType()).toBe("numeric(20, 6)");
    expect(tractNeighborhoodContexts.cityReferenceCoverage.getSQLType())
      .toBe("numeric(18, 15)");
    expect(tractNeighborhoodOverlaps.coveredAreaShare.getSQLType())
      .toBe("numeric(18, 15)");
    expect(config(tractNeighborhoodContexts).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "tract_neighborhood_contexts_tract_area_check",
        "tract_neighborhood_contexts_covered_area_check",
        "tract_neighborhood_contexts_coverage_check",
      ]),
    );
    expect(config(tractNeighborhoodOverlaps).checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "tract_neighborhood_overlaps_area_check",
        "tract_neighborhood_overlaps_share_check",
      ]),
    );
  });
});
