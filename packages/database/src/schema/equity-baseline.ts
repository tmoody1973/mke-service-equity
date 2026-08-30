import {sql} from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const analyticalNumeric = {precision: 15, scale: 12} as const;

export const postgisGeometry = customType<{
  data: string;
  driverData: string;
  config: {type: "MultiPolygon" | "Point"; srid: 4326};
  configRequired: true;
}>({
  dataType(config) {
    return `geometry(${config.type},${config.srid})`;
  },
});

export const dataSourceStatusEnum = pgEnum("data_source_status", [
  "active",
  "stale",
  "unavailable",
  "deprecated",
]);

export const snapshotValidationStatusEnum = pgEnum("snapshot_validation_status", [
  "pending",
  "valid",
  "invalid",
]);

export const indicatorDomainEnum = pgEnum("indicator_domain", [
  "demographic",
  "socioeconomic",
  "health",
]);

export const dataQualityStatusEnum = pgEnum("data_quality_status", [
  "verified",
  "provisional",
  "stale",
  "missing",
  "suppressed",
  "conflicting",
]);

export const scoreRunStatusEnum = pgEnum("score_run_status", [
  "draft",
  "validated",
  "published",
  "superseded",
  "failed",
]);

export const scoreQualityStatusEnum = pgEnum("score_quality_status", [
  "complete",
  "insufficient_data",
  "ineligible_zero_population",
]);

export const equityBaselineBandEnum = pgEnum("equity_baseline_band", [
  "very_low",
  "low",
  "moderate",
  "high",
  "very_high",
]);

export const dataSources = pgTable(
  "data_sources",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    publisher: text("publisher").notNull(),
    sourceUrl: text("source_url").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    geography: text("geography").notNull(),
    retrievedAt: timestamp("retrieved_at", {withTimezone: true}).notNull(),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    updateFrequency: text("update_frequency"),
    license: text("license").notNull(),
    methodologyUrl: text("methodology_url"),
    status: dataSourceStatusEnum("status").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    unique("data_sources_publisher_name_version_unique").on(
      table.publisher,
      table.name,
      table.datasetVersion,
    ),
    check("data_sources_valid_dates_check", sql`${table.validTo} IS NULL OR ${table.validFrom} IS NULL OR ${table.validTo} >= ${table.validFrom}`),
    index("data_sources_status_idx").on(table.status),
  ],
);

export const geographies = pgTable(
  "geographies",
  {
    id: uuid("id").primaryKey(),
    geoid: char("geoid", {length: 11}).notNull(),
    geographyType: text("geography_type").notNull(),
    name: text("name").notNull(),
    stateFips: char("state_fips", {length: 2}).notNull(),
    countyFips: char("county_fips", {length: 3}).notNull(),
    geometry: postgisGeometry("geometry", {type: "MultiPolygon", srid: 4326}).notNull(),
    centroid: postgisGeometry("centroid", {type: "Point", srid: 4326}).notNull(),
    population: integer("population"),
    vintage: text("vintage").notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    unique("geographies_type_geoid_vintage_unique").on(
      table.geographyType,
      table.geoid,
      table.vintage,
    ),
    check("geographies_type_check", sql`${table.geographyType} = 'tract'`),
    check("geographies_geoid_check", sql`${table.geoid} ~ '^[0-9]{11}$'`),
    check("geographies_state_fips_check", sql`${table.stateFips} ~ '^[0-9]{2}$'`),
    check("geographies_county_fips_check", sql`${table.countyFips} ~ '^[0-9]{3}$'`),
    check(
      "geographies_geoid_fips_check",
      sql`left(${table.geoid}, 2) = ${table.stateFips} AND substring(${table.geoid} from 3 for 3) = ${table.countyFips}`,
    ),
    check("geographies_population_check", sql`${table.population} IS NULL OR ${table.population} >= 0`),
    index("geographies_geometry_gist").using("gist", table.geometry),
    index("geographies_centroid_gist").using("gist", table.centroid),
  ],
);

export const indicatorDefinitions = pgTable(
  "indicator_definitions",
  {
    id: uuid("id").primaryKey(),
    methodologyVersion: text("methodology_version").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    domain: indicatorDomainEnum("domain").notNull(),
    unit: text("unit").notNull(),
    sourceId: uuid("source_id").notNull(),
    higherIsWorse: boolean("higher_is_worse").notNull(),
    baselineIncluded: boolean("baseline_included").notNull(),
    weight: numeric("weight", analyticalNumeric).notNull(),
    vintage: text("vintage").notNull(),
    methodologyNotes: text("methodology_notes").notNull(),
    formulaDefinition: jsonb("formula_definition").notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "indicator_definitions_source_id_data_sources_id_fk",
      columns: [table.sourceId],
      foreignColumns: [dataSources.id],
    }).onDelete("restrict"),
    unique("indicator_definitions_methodology_slug_unique").on(
      table.methodologyVersion,
      table.slug,
    ),
    check("indicator_definitions_weight_check", sql`${table.weight} > 0 AND ${table.weight} <= 1`),
    index("indicator_definitions_source_idx").on(table.sourceId),
    index("indicator_definitions_domain_idx").on(table.domain),
  ],
);

export const scoreRuns = pgTable(
  "score_runs",
  {
    id: uuid("id").primaryKey(),
    methodologyVersion: text("methodology_version").notNull(),
    registryHash: char("registry_hash", {length: 64}).notNull(),
    inputManifestHash: char("input_manifest_hash", {length: 64}).notNull(),
    runFingerprint: char("run_fingerprint", {length: 64}).notNull(),
    scoringImplementationVersion: text("scoring_implementation_version").notNull(),
    startedAt: timestamp("started_at", {withTimezone: true}).notNull(),
    completedAt: timestamp("completed_at", {withTimezone: true}),
    dataVintages: jsonb("data_vintages").notNull(),
    gitCommit: text("git_commit").notNull(),
    status: scoreRunStatusEnum("status").notNull(),
    validationResult: jsonb("validation_result"),
    failureMetadata: jsonb("failure_metadata"),
    outputHash: char("output_hash", {length: 64}),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    unique("score_runs_run_fingerprint_unique").on(table.runFingerprint),
    check("score_runs_registry_hash_check", sql`${table.registryHash} ~ '^[0-9a-f]{64}$'`),
    check("score_runs_input_manifest_hash_check", sql`${table.inputManifestHash} ~ '^[0-9a-f]{64}$'`),
    check("score_runs_run_fingerprint_check", sql`${table.runFingerprint} ~ '^[0-9a-f]{64}$'`),
    check(
      "score_runs_output_hash_check",
      sql`(
        ${table.status} IN ('validated', 'published', 'superseded')
        AND ${table.outputHash} IS NOT NULL
        AND ${table.outputHash} ~ '^[0-9a-f]{64}$'
      ) OR (
        ${table.status} IN ('draft', 'failed')
        AND ${table.outputHash} IS NULL
      )`,
    ),
    check(
      "score_runs_completion_check",
      sql`(${table.status} = 'draft' AND ${table.completedAt} IS NULL) OR (${table.status} <> 'draft' AND ${table.completedAt} IS NOT NULL)`,
    ),
    check(
      "score_runs_failure_metadata_check",
      sql`(${table.status} = 'failed' AND ${table.failureMetadata} IS NOT NULL) OR (${table.status} <> 'failed' AND ${table.failureMetadata} IS NULL)`,
    ),
    check(
      "score_runs_validation_result_check",
      sql`${table.status} NOT IN ('validated', 'published', 'superseded') OR ${table.validationResult} IS NOT NULL`,
    ),
    index("score_runs_status_idx").on(table.status),
    index("score_runs_methodology_version_idx").on(table.methodologyVersion),
  ],
);

export const sourceSnapshots = pgTable(
  "source_snapshots",
  {
    id: uuid("id").primaryKey(),
    sourceId: uuid("source_id").notNull(),
    datasetVersion: text("dataset_version").notNull(),
    retrievedAt: timestamp("retrieved_at", {withTimezone: true}).notNull(),
    checksumSha256: char("checksum_sha256", {length: 64}).notNull(),
    byteSize: bigint("byte_size", {mode: "number"}).notNull(),
    storageUri: text("storage_uri").notNull(),
    rowOrFeatureCount: bigint("row_or_feature_count", {mode: "number"}).notNull(),
    schemaFingerprint: char("schema_fingerprint", {length: 64}).notNull(),
    snapshotFingerprint: char("snapshot_fingerprint", {length: 64}).notNull(),
    requestMetadata: jsonb("request_metadata").notNull(),
    validationStatus: snapshotValidationStatusEnum("validation_status").notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "source_snapshots_source_id_data_sources_id_fk",
      columns: [table.sourceId],
      foreignColumns: [dataSources.id],
    }).onDelete("restrict"),
    unique("source_snapshots_source_version_checksum_unique").on(
      table.sourceId,
      table.datasetVersion,
      table.checksumSha256,
    ),
    unique("source_snapshots_snapshot_fingerprint_unique").on(table.snapshotFingerprint),
    check("source_snapshots_checksum_check", sql`${table.checksumSha256} ~ '^[0-9a-f]{64}$'`),
    check("source_snapshots_schema_fingerprint_check", sql`${table.schemaFingerprint} ~ '^[0-9a-f]{64}$'`),
    check("source_snapshots_snapshot_fingerprint_check", sql`${table.snapshotFingerprint} ~ '^[0-9a-f]{64}$'`),
    check("source_snapshots_byte_size_check", sql`${table.byteSize} >= 0`),
    check("source_snapshots_record_count_check", sql`${table.rowOrFeatureCount} >= 0`),
    index("source_snapshots_source_retrieved_idx").on(table.sourceId, table.retrievedAt),
  ],
);

export const indicatorValues = pgTable(
  "indicator_values",
  {
    id: uuid("id").primaryKey(),
    geographyId: uuid("geography_id").notNull(),
    indicatorId: uuid("indicator_id").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
    value: numeric("value", analyticalNumeric),
    marginOfError: numeric("margin_of_error", analyticalNumeric),
    confidenceLow: numeric("confidence_low", analyticalNumeric),
    confidenceHigh: numeric("confidence_high", analyticalNumeric),
    dataYear: text("data_year").notNull(),
    qualityStatus: dataQualityStatusEnum("quality_status").notNull(),
    qualityMetadata: jsonb("quality_metadata").notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "indicator_values_geography_id_geographies_id_fk",
      columns: [table.geographyId],
      foreignColumns: [geographies.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "indicator_values_indicator_id_indicator_definitions_id_fk",
      columns: [table.indicatorId],
      foreignColumns: [indicatorDefinitions.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "indicator_values_snapshot_id_source_snapshots_id_fk",
      columns: [table.snapshotId],
      foreignColumns: [sourceSnapshots.id],
    }).onDelete("restrict"),
    unique("indicator_values_geography_indicator_snapshot_unique").on(
      table.geographyId,
      table.indicatorId,
      table.snapshotId,
    ),
    unique("indicator_values_id_geography_unique").on(table.id, table.geographyId),
    check("indicator_values_value_range_check", sql`${table.value} IS NULL OR (${table.value} >= 0 AND ${table.value} <= 100)`),
    check(
      "indicator_values_value_quality_check",
      sql`(
        ${table.value} IS NOT NULL
        AND ${table.qualityStatus} IN ('verified', 'provisional', 'stale')
      ) OR (
        ${table.value} IS NULL
        AND ${table.qualityStatus} IN ('missing', 'suppressed', 'conflicting')
      )`,
    ),
    check("indicator_values_margin_of_error_check", sql`${table.marginOfError} IS NULL OR ${table.marginOfError} >= 0`),
    check(
      "indicator_values_confidence_check",
      sql`(
        ${table.confidenceLow} IS NULL AND ${table.confidenceHigh} IS NULL
      ) OR (
        ${table.confidenceLow} IS NOT NULL
        AND ${table.confidenceHigh} IS NOT NULL
        AND ${table.confidenceLow} >= 0
        AND ${table.confidenceLow} <= ${table.confidenceHigh}
        AND ${table.confidenceHigh} <= 100
      )`,
    ),
    index("indicator_values_geography_idx").on(table.geographyId),
    index("indicator_values_indicator_idx").on(table.indicatorId),
    index("indicator_values_snapshot_idx").on(table.snapshotId),
  ],
);

export const scoreComponents = pgTable(
  "score_components",
  {
    id: uuid("id").primaryKey(),
    scoreRunId: uuid("score_run_id").notNull(),
    geographyId: uuid("geography_id").notNull(),
    indicatorValueId: uuid("indicator_value_id").notNull(),
    indicatorPercentile: numeric("indicator_percentile", analyticalNumeric).notNull(),
    effectiveWeight: numeric("effective_weight", analyticalNumeric).notNull(),
    qualityStatus: dataQualityStatusEnum("quality_status").notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "score_components_score_run_id_score_runs_id_fk",
      columns: [table.scoreRunId],
      foreignColumns: [scoreRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "score_components_geography_id_geographies_id_fk",
      columns: [table.geographyId],
      foreignColumns: [geographies.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "score_components_indicator_value_geography_fk",
      columns: [table.indicatorValueId, table.geographyId],
      foreignColumns: [indicatorValues.id, indicatorValues.geographyId],
    }).onDelete("restrict"),
    unique("score_components_run_geography_indicator_value_unique").on(
      table.scoreRunId,
      table.geographyId,
      table.indicatorValueId,
    ),
    check("score_components_percentile_check", sql`${table.indicatorPercentile} >= 0 AND ${table.indicatorPercentile} <= 100`),
    check("score_components_weight_check", sql`${table.effectiveWeight} > 0 AND ${table.effectiveWeight} <= 1`),
    check(
      "score_components_quality_check",
      sql`${table.qualityStatus} IN ('verified', 'provisional', 'stale')`,
    ),
    index("score_components_run_geography_idx").on(table.scoreRunId, table.geographyId),
  ],
);

export const scores = pgTable(
  "scores",
  {
    id: uuid("id").primaryKey(),
    scoreRunId: uuid("score_run_id").notNull(),
    geographyId: uuid("geography_id").notNull(),
    demographicScore: numeric("demographic_score", analyticalNumeric),
    socioeconomicScore: numeric("socioeconomic_score", analyticalNumeric),
    healthScore: numeric("health_score", analyticalNumeric),
    compositeScore: numeric("composite_score", analyticalNumeric),
    equityBaselinePercentile: numeric("equity_baseline_percentile", analyticalNumeric),
    equityBaselineBand: equityBaselineBandEnum("equity_baseline_band"),
    qualityStatus: scoreQualityStatusEnum("quality_status").notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "scores_score_run_id_score_runs_id_fk",
      columns: [table.scoreRunId],
      foreignColumns: [scoreRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "scores_geography_id_geographies_id_fk",
      columns: [table.geographyId],
      foreignColumns: [geographies.id],
    }).onDelete("restrict"),
    unique("scores_run_geography_unique").on(table.scoreRunId, table.geographyId),
    unique("scores_id_geography_unique").on(table.id, table.geographyId),
    check(
      "scores_numeric_range_check",
      sql`(${table.demographicScore} IS NULL OR ${table.demographicScore} BETWEEN 0 AND 100)
        AND (${table.socioeconomicScore} IS NULL OR ${table.socioeconomicScore} BETWEEN 0 AND 100)
        AND (${table.healthScore} IS NULL OR ${table.healthScore} BETWEEN 0 AND 100)
        AND (${table.compositeScore} IS NULL OR ${table.compositeScore} BETWEEN 0 AND 100)
        AND (${table.equityBaselinePercentile} IS NULL OR ${table.equityBaselinePercentile} BETWEEN 0 AND 100)`,
    ),
    check(
      "scores_output_quality_check",
      sql`(
        ${table.qualityStatus} = 'complete'
        AND ${table.demographicScore} IS NOT NULL
        AND ${table.socioeconomicScore} IS NOT NULL
        AND ${table.healthScore} IS NOT NULL
        AND ${table.compositeScore} IS NOT NULL
        AND ${table.equityBaselinePercentile} IS NOT NULL
        AND ${table.equityBaselineBand} IS NOT NULL
      ) OR (
        ${table.qualityStatus} IN ('insufficient_data', 'ineligible_zero_population')
        AND ${table.demographicScore} IS NULL
        AND ${table.socioeconomicScore} IS NULL
        AND ${table.healthScore} IS NULL
        AND ${table.compositeScore} IS NULL
        AND ${table.equityBaselinePercentile} IS NULL
        AND ${table.equityBaselineBand} IS NULL
      )`,
    ),
    index("scores_run_quality_idx").on(table.scoreRunId, table.qualityStatus),
  ],
);
