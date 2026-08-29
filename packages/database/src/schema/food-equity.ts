import {sql} from "drizzle-orm";
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  dataQualityStatusEnum,
  dataSources,
  equityBaselineBandEnum,
  geographies,
  postgisGeometry,
  scoreQualityStatusEnum,
  scoreRuns,
  scores,
  sourceSnapshots,
} from "./equity-baseline";

const analyticalNumeric = {precision: 15, scale: 12} as const;

export const foodResourceCategoryEnum = pgEnum("food_resource_category", [
  "full_service_grocery",
  "candidate_full_service",
  "grocery_other",
  "convenience",
  "combination_grocery_other",
  "specialty_bakery",
  "specialty_produce",
  "specialty_meat",
  "specialty_seafood",
  "seasonal_or_direct",
  "restricted_access",
  "non_fixed_or_online",
  "emergency_food_bank",
  "emergency_food_pantry",
  "emergency_pantry_recovery",
  "emergency_meal_program",
  "unverified",
]);

export const foodResourceCoordinateStatusEnum = pgEnum("food_resource_coordinate_status", [
  "source_coordinate",
  "authoritative_geocode",
  "manually_verified",
  "invalid",
  "missing",
]);

export const foodResourceVerificationStatusEnum = pgEnum("food_resource_verification_status", [
  "verified",
  "override_verified",
  "unverified",
  "verified_context",
  "stale_unverified_context",
  "unroutable_context",
]);

export const foodMetricStateEnum = pgEnum("food_metric_state", [
  "observed",
  "unreachable",
  "missing",
  "suppressed",
  "conflicting",
]);

export const foodAccessNeedBandEnum = pgEnum("food_access_need_band", [
  "very_low",
  "low",
  "moderate",
  "high",
  "very_high",
]);

export const foodScoreRunStatusEnum = pgEnum("food_score_run_status", [
  "draft",
  "validated",
  "failed",
]);

export const foodResources = pgTable(
  "food_resources",
  {
    id: uuid("id").primaryKey(),
    sourceId: uuid("source_id").notNull(),
    sourceRecordId: text("source_record_id").notNull(),
    canonicalResourceKey: char("canonical_resource_key", {length: 64}).notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "food_resources_source_id_data_sources_id_fk",
      columns: [table.sourceId],
      foreignColumns: [dataSources.id],
    }).onDelete("restrict"),
    unique("food_resources_source_record_unique").on(table.sourceId, table.sourceRecordId),
    unique("food_resources_canonical_key_unique").on(table.canonicalResourceKey),
    check(
      "food_resources_canonical_key_check",
      sql`${table.canonicalResourceKey} ~ '^[0-9a-f]{64}$'`,
    ),
    check("food_resources_source_record_id_check", sql`btrim(${table.sourceRecordId}) <> ''`),
    index("food_resources_source_idx").on(table.sourceId),
  ],
);

export const foodResourceVersions = pgTable(
  "food_resource_versions",
  {
    id: uuid("id").primaryKey(),
    resourceId: uuid("resource_id").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
    versionFingerprint: char("version_fingerprint", {length: 64}).notNull(),
    category: foodResourceCategoryEnum("category").notNull(),
    name: text("name").notNull(),
    subtype: text("subtype"),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    website: text("website"),
    phone: text("phone"),
    hours: jsonb("hours"),
    geometry: postgisGeometry("geometry", {type: "Point", srid: 4326}),
    coordinateStatus: foodResourceCoordinateStatusEnum("coordinate_status").notNull(),
    verificationStatus: foodResourceVerificationStatusEnum("verification_status").notNull(),
    classificationEvidence: jsonb("classification_evidence").notNull(),
    fullServiceGrocery: boolean("full_service_grocery").notNull(),
    snapAuthorized: boolean("snap_authorized"),
    active: boolean("active").notNull(),
    validFrom: timestamp("valid_from", {withTimezone: true}),
    validTo: timestamp("valid_to", {withTimezone: true}),
    verifiedAt: timestamp("verified_at", {withTimezone: true}),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "food_resource_versions_resource_id_food_resources_id_fk",
      columns: [table.resourceId],
      foreignColumns: [foodResources.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "food_resource_versions_snapshot_id_source_snapshots_id_fk",
      columns: [table.snapshotId],
      foreignColumns: [sourceSnapshots.id],
    }).onDelete("restrict"),
    unique("food_resource_versions_fingerprint_unique").on(table.versionFingerprint),
    unique("food_resource_versions_resource_snapshot_unique").on(
      table.resourceId,
      table.snapshotId,
    ),
    check(
      "food_resource_versions_hash_check",
      sql`${table.versionFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check("food_resource_versions_name_check", sql`btrim(${table.name}) <> ''`),
    check(
      "food_resource_versions_coordinate_check",
      sql`(
        ${table.coordinateStatus} IN ('source_coordinate', 'authoritative_geocode', 'manually_verified')
        AND ${table.geometry} IS NOT NULL
      ) OR (
        ${table.coordinateStatus} IN ('invalid', 'missing')
        AND ${table.geometry} IS NULL
      )`,
    ),
    check(
      "food_resource_versions_classification_check",
      sql`(
        ${table.fullServiceGrocery} = true
        AND ${table.category} = 'full_service_grocery'
        AND ${table.verificationStatus} IN ('verified', 'override_verified')
      ) OR (
        ${table.fullServiceGrocery} = false
        AND ${table.category} <> 'full_service_grocery'
      )`,
    ),
    check(
      "food_resource_versions_valid_dates_check",
      sql`${table.validTo} IS NULL OR ${table.validFrom} IS NULL OR ${table.validTo} >= ${table.validFrom}`,
    ),
    check(
      "food_resource_versions_verified_at_check",
      sql`${table.verificationStatus} NOT IN ('verified', 'override_verified', 'verified_context') OR ${table.verifiedAt} IS NOT NULL`,
    ),
    index("food_resource_versions_geometry_gist").using("gist", table.geometry),
    index("food_resource_versions_resource_idx").on(table.resourceId),
    index("food_resource_versions_snapshot_idx").on(table.snapshotId),
    index("food_resource_versions_category_active_idx").on(table.category, table.active),
  ],
);

export const foodAccessMetricValues = pgTable(
  "food_access_metric_values",
  {
    id: uuid("id").primaryKey(),
    geographyId: uuid("geography_id").notNull(),
    primarySnapshotId: uuid("primary_snapshot_id").notNull(),
    nearestResourceVersionId: uuid("nearest_resource_version_id"),
    metricSlug: text("metric_slug").notNull(),
    value: numeric("value", analyticalNumeric),
    state: foodMetricStateEnum("state").notNull(),
    unit: text("unit").notNull(),
    calculationVersion: text("calculation_version").notNull(),
    calculationFingerprint: char("calculation_fingerprint", {length: 64}).notNull(),
    qualityStatus: dataQualityStatusEnum("quality_status").notNull(),
    qualityMetadata: jsonb("quality_metadata").notNull(),
    calculatedAt: timestamp("calculated_at", {withTimezone: true}).notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "food_access_metric_values_geography_id_geographies_id_fk",
      columns: [table.geographyId],
      foreignColumns: [geographies.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "food_access_metric_values_primary_snapshot_id_source_snapshots_id_fk",
      columns: [table.primarySnapshotId],
      foreignColumns: [sourceSnapshots.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "food_access_metric_values_nearest_resource_version_id_fk",
      columns: [table.nearestResourceVersionId],
      foreignColumns: [foodResourceVersions.id],
    }).onDelete("restrict"),
    unique("food_access_metric_values_calculation_unique").on(
      table.geographyId,
      table.metricSlug,
      table.calculationFingerprint,
    ),
    unique("food_access_metric_values_id_geography_unique").on(table.id, table.geographyId),
    check(
      "food_access_metric_values_hash_check",
      sql`${table.calculationFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check("food_access_metric_values_slug_check", sql`btrim(${table.metricSlug}) <> ''`),
    check(
      "food_access_metric_values_unit_check",
      sql`btrim(${table.unit}) <> '' AND btrim(${table.calculationVersion}) <> ''`,
    ),
    check(
      "food_access_metric_values_value_state_check",
      sql`(
        ${table.state} = 'observed' AND ${table.value} IS NOT NULL
      ) OR (
        ${table.state} IN ('unreachable', 'missing', 'suppressed', 'conflicting')
        AND ${table.value} IS NULL
      )`,
    ),
    check(
      "food_access_metric_values_quality_check",
      sql`(
        ${table.state} IN ('observed', 'unreachable')
        AND ${table.qualityStatus} IN ('verified', 'provisional', 'stale')
      ) OR (
        ${table.state} = 'missing' AND ${table.qualityStatus} = 'missing'
      ) OR (
        ${table.state} = 'suppressed' AND ${table.qualityStatus} = 'suppressed'
      ) OR (
        ${table.state} = 'conflicting' AND ${table.qualityStatus} = 'conflicting'
      )`,
    ),
    index("food_access_metric_values_geography_idx").on(table.geographyId),
    index("food_access_metric_values_metric_idx").on(table.metricSlug),
    index("food_access_metric_values_primary_snapshot_idx").on(table.primarySnapshotId),
  ],
);

export const foodAccessMetricSnapshots = pgTable(
  "food_access_metric_snapshots",
  {
    accessMetricValueId: uuid("access_metric_value_id").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
  },
  (table) => [
    foreignKey({
      name: "food_access_metric_snapshots_metric_value_id_fk",
      columns: [table.accessMetricValueId],
      foreignColumns: [foodAccessMetricValues.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "food_access_metric_snapshots_snapshot_id_source_snapshots_id_fk",
      columns: [table.snapshotId],
      foreignColumns: [sourceSnapshots.id],
    }).onDelete("restrict"),
    primaryKey({
      name: "food_access_metric_snapshots_pk",
      columns: [table.accessMetricValueId, table.snapshotId],
    }),
    index("food_access_metric_snapshots_snapshot_idx").on(table.snapshotId),
  ],
);

export const foodScoreRuns = pgTable(
  "food_score_runs",
  {
    id: uuid("id").primaryKey(),
    methodologyVersion: text("methodology_version").notNull(),
    registryHash: char("registry_hash", {length: 64}).notNull(),
    inputManifestHash: char("input_manifest_hash", {length: 64}).notNull(),
    runFingerprint: char("run_fingerprint", {length: 64}).notNull(),
    scoringImplementationVersion: text("scoring_implementation_version").notNull(),
    equityBaselineRunId: uuid("equity_baseline_run_id").notNull(),
    equityBaselineOutputHash: char("equity_baseline_output_hash", {length: 64}).notNull(),
    startedAt: timestamp("started_at", {withTimezone: true}).notNull(),
    completedAt: timestamp("completed_at", {withTimezone: true}),
    dataVintages: jsonb("data_vintages").notNull(),
    gitCommit: text("git_commit").notNull(),
    status: foodScoreRunStatusEnum("status").notNull(),
    validationResult: jsonb("validation_result"),
    failureMetadata: jsonb("failure_metadata"),
    outputHash: char("output_hash", {length: 64}),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "food_score_runs_equity_baseline_run_id_score_runs_id_fk",
      columns: [table.equityBaselineRunId],
      foreignColumns: [scoreRuns.id],
    }).onDelete("restrict"),
    unique("food_score_runs_run_fingerprint_unique").on(table.runFingerprint),
    check("food_score_runs_registry_hash_check", sql`${table.registryHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "food_score_runs_input_manifest_hash_check",
      sql`${table.inputManifestHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "food_score_runs_run_fingerprint_check",
      sql`${table.runFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "food_score_runs_baseline_output_hash_check",
      sql`${table.equityBaselineOutputHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "food_score_runs_output_hash_check",
      sql`(
        ${table.status} = 'validated'
        AND ${table.outputHash} IS NOT NULL
        AND ${table.outputHash} ~ '^[0-9a-f]{64}$'
      ) OR (
        ${table.status} IN ('draft', 'failed')
        AND ${table.outputHash} IS NULL
      )`,
    ),
    check(
      "food_score_runs_completion_check",
      sql`(${table.status} = 'draft' AND ${table.completedAt} IS NULL) OR (${table.status} IN ('validated', 'failed') AND ${table.completedAt} IS NOT NULL)`,
    ),
    check(
      "food_score_runs_failure_metadata_check",
      sql`(${table.status} = 'failed' AND ${table.failureMetadata} IS NOT NULL) OR (${table.status} <> 'failed' AND ${table.failureMetadata} IS NULL)`,
    ),
    check(
      "food_score_runs_validation_result_check",
      sql`${table.status} <> 'validated' OR ${table.validationResult} IS NOT NULL`,
    ),
    index("food_score_runs_status_idx").on(table.status),
    index("food_score_runs_equity_baseline_idx").on(table.equityBaselineRunId),
  ],
);

export const foodScoreComponents = pgTable(
  "food_score_components",
  {
    id: uuid("id").primaryKey(),
    foodScoreRunId: uuid("food_score_run_id").notNull(),
    geographyId: uuid("geography_id").notNull(),
    accessMetricValueId: uuid("access_metric_value_id").notNull(),
    domain: text("domain").notNull(),
    indicatorPercentile: numeric("indicator_percentile", analyticalNumeric).notNull(),
    effectiveWeight: numeric("effective_weight", analyticalNumeric).notNull(),
    qualityStatus: dataQualityStatusEnum("quality_status").notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "food_score_components_food_score_run_id_fk",
      columns: [table.foodScoreRunId],
      foreignColumns: [foodScoreRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "food_score_components_geography_id_geographies_id_fk",
      columns: [table.geographyId],
      foreignColumns: [geographies.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "food_score_components_metric_value_geography_fk",
      columns: [table.accessMetricValueId, table.geographyId],
      foreignColumns: [foodAccessMetricValues.id, foodAccessMetricValues.geographyId],
    }).onDelete("restrict"),
    unique("food_score_components_run_geography_metric_unique").on(
      table.foodScoreRunId,
      table.geographyId,
      table.accessMetricValueId,
    ),
    check(
      "food_score_components_domain_check",
      sql`${table.domain} IN ('retail_access', 'transportation_constraint')`,
    ),
    check(
      "food_score_components_percentile_check",
      sql`${table.indicatorPercentile} BETWEEN 0 AND 100`,
    ),
    check(
      "food_score_components_weight_check",
      sql`${table.effectiveWeight} > 0 AND ${table.effectiveWeight} <= 1`,
    ),
    check(
      "food_score_components_quality_check",
      sql`${table.qualityStatus} IN ('verified', 'provisional', 'stale')`,
    ),
    index("food_score_components_run_geography_idx").on(
      table.foodScoreRunId,
      table.geographyId,
    ),
  ],
);

export const foodScores = pgTable(
  "food_scores",
  {
    id: uuid("id").primaryKey(),
    foodScoreRunId: uuid("food_score_run_id").notNull(),
    geographyId: uuid("geography_id").notNull(),
    equityBaselineScoreId: uuid("equity_baseline_score_id").notNull(),
    retailAccessScore: numeric("retail_access_score", analyticalNumeric),
    transportationConstraintScore: numeric("transportation_constraint_score", analyticalNumeric),
    rawFoodAccessNeed: numeric("raw_food_access_need", analyticalNumeric),
    foodAccessNeedPercentile: numeric("food_access_need_percentile", analyticalNumeric),
    foodAccessNeedBand: foodAccessNeedBandEnum("food_access_need_band"),
    equityBaselineBand: equityBaselineBandEnum("equity_baseline_band"),
    priority: integer("priority"),
    qualityStatus: scoreQualityStatusEnum("quality_status").notNull(),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "food_scores_food_score_run_id_food_score_runs_id_fk",
      columns: [table.foodScoreRunId],
      foreignColumns: [foodScoreRuns.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "food_scores_geography_id_geographies_id_fk",
      columns: [table.geographyId],
      foreignColumns: [geographies.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "food_scores_equity_baseline_score_geography_fk",
      columns: [table.equityBaselineScoreId, table.geographyId],
      foreignColumns: [scores.id, scores.geographyId],
    }).onDelete("restrict"),
    unique("food_scores_run_geography_unique").on(table.foodScoreRunId, table.geographyId),
    check(
      "food_scores_numeric_range_check",
      sql`(${table.retailAccessScore} IS NULL OR ${table.retailAccessScore} BETWEEN 0 AND 100)
        AND (${table.transportationConstraintScore} IS NULL OR ${table.transportationConstraintScore} BETWEEN 0 AND 100)
        AND (${table.rawFoodAccessNeed} IS NULL OR ${table.rawFoodAccessNeed} BETWEEN 0 AND 100)
        AND (${table.foodAccessNeedPercentile} IS NULL OR ${table.foodAccessNeedPercentile} BETWEEN 0 AND 100)`,
    ),
    check(
      "food_scores_priority_check",
      sql`${table.priority} IS NULL OR ${table.priority} BETWEEN 1 AND 5`,
    ),
    check(
      "food_scores_output_quality_check",
      sql`(
        ${table.qualityStatus} = 'complete'
        AND ${table.retailAccessScore} IS NOT NULL
        AND ${table.transportationConstraintScore} IS NOT NULL
        AND ${table.rawFoodAccessNeed} IS NOT NULL
        AND ${table.foodAccessNeedPercentile} IS NOT NULL
        AND ${table.foodAccessNeedBand} IS NOT NULL
        AND ${table.equityBaselineBand} IS NOT NULL
        AND ${table.priority} IS NOT NULL
      ) OR (
        ${table.qualityStatus} = 'insufficient_data'
        AND ${table.retailAccessScore} IS NULL
        AND ${table.transportationConstraintScore} IS NULL
        AND ${table.rawFoodAccessNeed} IS NULL
        AND ${table.foodAccessNeedPercentile} IS NULL
        AND ${table.foodAccessNeedBand} IS NULL
        AND ${table.priority} IS NULL
      ) OR (
        ${table.qualityStatus} = 'ineligible_zero_population'
        AND ${table.retailAccessScore} IS NULL
        AND ${table.transportationConstraintScore} IS NULL
        AND ${table.rawFoodAccessNeed} IS NULL
        AND ${table.foodAccessNeedPercentile} IS NULL
        AND ${table.foodAccessNeedBand} IS NULL
        AND ${table.equityBaselineBand} IS NULL
        AND ${table.priority} IS NULL
      )`,
    ),
    index("food_scores_run_quality_idx").on(table.foodScoreRunId, table.qualityStatus),
  ],
);
