import {sql} from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  dataSources,
  geographies,
  postgisGeometry,
  sourceSnapshots,
} from "./equity-baseline";

const areaNumeric = {precision: 20, scale: 6} as const;
const ratioNumeric = {precision: 18, scale: 15} as const;

export const neighborhoods = pgTable(
  "neighborhoods",
  {
    id: uuid("id").primaryKey(),
    sourceId: uuid("source_id").notNull(),
    sourceNeighborhoodId: integer("source_neighborhood_id").notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "neighborhoods_source_id_data_sources_id_fk",
      columns: [table.sourceId],
      foreignColumns: [dataSources.id],
    }).onDelete("restrict"),
    unique("neighborhoods_source_neighborhood_unique").on(
      table.sourceId,
      table.sourceNeighborhoodId,
    ),
    check(
      "neighborhoods_source_neighborhood_id_check",
      sql`${table.sourceNeighborhoodId} > 0`,
    ),
    index("neighborhoods_source_idx").on(table.sourceId),
  ],
);

export const neighborhoodVersions = pgTable(
  "neighborhood_versions",
  {
    id: uuid("id").primaryKey(),
    neighborhoodId: uuid("neighborhood_id").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
    sourceObjectId: integer("source_object_id").notNull(),
    name: text("name").notNull(),
    geometry: postgisGeometry("geometry", {type: "MultiPolygon", srid: 4326}).notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "neighborhood_versions_neighborhood_id_neighborhoods_id_fk",
      columns: [table.neighborhoodId],
      foreignColumns: [neighborhoods.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "neighborhood_versions_snapshot_id_source_snapshots_id_fk",
      columns: [table.snapshotId],
      foreignColumns: [sourceSnapshots.id],
    }).onDelete("restrict"),
    unique("neighborhood_versions_neighborhood_snapshot_unique").on(
      table.neighborhoodId,
      table.snapshotId,
    ),
    unique("neighborhood_versions_snapshot_object_unique").on(
      table.snapshotId,
      table.sourceObjectId,
    ),
    unique("neighborhood_versions_id_snapshot_unique").on(table.id, table.snapshotId),
    check("neighborhood_versions_object_id_check", sql`${table.sourceObjectId} > 0`),
    check("neighborhood_versions_name_check", sql`btrim(${table.name}) <> ''`),
    check("neighborhood_versions_geometry_srid_check", sql`ST_SRID(${table.geometry}) = 4326`),
    check("neighborhood_versions_geometry_not_empty_check", sql`NOT ST_IsEmpty(${table.geometry})`),
    check("neighborhood_versions_geometry_valid_check", sql`ST_IsValid(${table.geometry})`),
    index("neighborhood_versions_geometry_gist").using("gist", table.geometry),
    index("neighborhood_versions_snapshot_idx").on(table.snapshotId),
    index("neighborhood_versions_name_idx").on(table.name),
  ],
);

export const tractNeighborhoodContexts = pgTable(
  "tract_neighborhood_contexts",
  {
    id: uuid("id").primaryKey(),
    geographyId: uuid("geography_id").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
    tractAreaSqM: numeric("tract_area_sq_m", areaNumeric).notNull(),
    coveredAreaSqM: numeric("covered_area_sq_m", areaNumeric).notNull(),
    cityReferenceCoverage: numeric("city_reference_coverage", ratioNumeric).notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "tract_neighborhood_contexts_geography_id_geographies_id_fk",
      columns: [table.geographyId],
      foreignColumns: [geographies.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "tract_neighborhood_contexts_snapshot_id_source_snapshots_id_fk",
      columns: [table.snapshotId],
      foreignColumns: [sourceSnapshots.id],
    }).onDelete("restrict"),
    unique("tract_neighborhood_contexts_geography_snapshot_unique").on(
      table.geographyId,
      table.snapshotId,
    ),
    check("tract_neighborhood_contexts_tract_area_check", sql`${table.tractAreaSqM} > 0`),
    check(
      "tract_neighborhood_contexts_covered_area_check",
      sql`${table.coveredAreaSqM} >= 0 AND ${table.coveredAreaSqM} <= ${table.tractAreaSqM}`,
    ),
    check(
      "tract_neighborhood_contexts_coverage_check",
      sql`${table.cityReferenceCoverage} BETWEEN 0 AND 1`,
    ),
    index("tract_neighborhood_contexts_snapshot_idx").on(table.snapshotId),
  ],
);

export const tractNeighborhoodOverlaps = pgTable(
  "tract_neighborhood_overlaps",
  {
    id: uuid("id").primaryKey(),
    geographyId: uuid("geography_id").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
    neighborhoodVersionId: uuid("neighborhood_version_id").notNull(),
    overlapAreaSqM: numeric("overlap_area_sq_m", areaNumeric).notNull(),
    coveredAreaShare: numeric("covered_area_share", ratioNumeric).notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "tract_neighborhood_overlaps_context_fk",
      columns: [table.geographyId, table.snapshotId],
      foreignColumns: [
        tractNeighborhoodContexts.geographyId,
        tractNeighborhoodContexts.snapshotId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "tract_neighborhood_overlaps_version_snapshot_fk",
      columns: [table.neighborhoodVersionId, table.snapshotId],
      foreignColumns: [neighborhoodVersions.id, neighborhoodVersions.snapshotId],
    }).onDelete("restrict"),
    unique("tract_neighborhood_overlaps_identity_unique").on(
      table.geographyId,
      table.snapshotId,
      table.neighborhoodVersionId,
    ),
    check("tract_neighborhood_overlaps_area_check", sql`${table.overlapAreaSqM} > 0`),
    check(
      "tract_neighborhood_overlaps_share_check",
      sql`${table.coveredAreaShare} > 0 AND ${table.coveredAreaShare} <= 1`,
    ),
    index("tract_neighborhood_overlaps_geography_snapshot_idx").on(
      table.geographyId,
      table.snapshotId,
    ),
    index("tract_neighborhood_overlaps_version_idx").on(table.neighborhoodVersionId),
  ],
);
