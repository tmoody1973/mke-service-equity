import {sql} from "drizzle-orm";
import {
  char,
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  geographies,
  indicatorValues,
  scoreComponents,
  scoreRuns,
  scores,
  sourceSnapshots,
} from "./equity-baseline";
import {
  foodAccessMetricValues,
  foodResourceVersions,
  foodScoreComponents,
  foodScoreRuns,
  foodScores,
} from "./food-equity";

export const atlasPublicationStateEnum = pgEnum("atlas_publication_state", [
  "published",
  "superseded",
]);

export const publicationRedistributionDecisionEnum = pgEnum(
  "publication_redistribution_decision",
  [
    "public_derived_results",
    "public_direct_display",
    "internal_reproduction_only",
    "prohibited_public_use",
  ],
);

export const publicationSourceRoleEnum = pgEnum("publication_source_role", [
  "canonical_geography",
  "equity_input",
  "food_scoring_input",
  "food_context_input",
]);

export const publicationResourceRoleEnum = pgEnum("publication_resource_role", [
  "scoring_inventory",
  "public_display",
]);

export const publicationAuditActionEnum = pgEnum("publication_audit_action", [
  "dry_run",
  "publish",
  "reconcile",
  "withdraw",
]);

export const publicationAuditOutcomeEnum = pgEnum("publication_audit_outcome", [
  "attempted",
  "succeeded",
  "rejected",
  "failed",
]);

export const publicationEnvironmentEnum = pgEnum("publication_environment", [
  "development",
  "production",
]);

export const atlasPublications = pgTable(
  "atlas_publications",
  {
    id: uuid("id").primaryKey(),
    foodScoreRunId: uuid("food_score_run_id").notNull(),
    equityBaselineRunId: uuid("equity_baseline_run_id").notNull(),
    foodOutputHash: char("food_output_hash", {length: 64}).notNull(),
    equityBaselineOutputHash: char("equity_baseline_output_hash", {length: 64}).notNull(),
    bundleFingerprint: char("bundle_fingerprint", {length: 64}).notNull(),
    dryRunHash: char("dry_run_hash", {length: 64}).notNull(),
    state: atlasPublicationStateEnum("state").notNull(),
    publishedAt: timestamp("published_at", {withTimezone: true}).notNull(),
    publishedBy: text("published_by").notNull(),
    approvalId: text("approval_id").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    publicationProcess: text("publication_process").notNull(),
    commandVersion: text("command_version").notNull(),
    gitCommit: text("git_commit").notNull(),
    reason: text("reason").notNull(),
    validationSummary: jsonb("validation_summary").notNull(),
    supersededAt: timestamp("superseded_at", {withTimezone: true}),
    supersededBy: text("superseded_by"),
    supersededReason: text("superseded_reason"),
    supersededByPublicationId: uuid("superseded_by_publication_id"),
    createdAt: timestamp("created_at", {withTimezone: true}).notNull(),
  },
  (table) => [
    foreignKey({
      name: "atlas_publications_food_run_fk",
      columns: [table.foodScoreRunId],
      foreignColumns: [foodScoreRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "atlas_publications_equity_run_fk",
      columns: [table.equityBaselineRunId],
      foreignColumns: [scoreRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "atlas_publications_superseded_by_fk",
      columns: [table.supersededByPublicationId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    unique("atlas_publications_food_run_unique").on(table.foodScoreRunId),
    unique("atlas_publications_bundle_fingerprint_unique").on(table.bundleFingerprint),
    unique("atlas_publications_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("atlas_publications_one_current_idx")
      .on(table.state)
      .where(sql`${table.state} = 'published'`),
    check(
      "atlas_publications_hashes_check",
      sql`${table.foodOutputHash} ~ '^[0-9a-f]{64}$'
        AND ${table.equityBaselineOutputHash} ~ '^[0-9a-f]{64}$'
        AND ${table.bundleFingerprint} ~ '^[0-9a-f]{64}$'
        AND ${table.dryRunHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "atlas_publications_text_check",
      sql`btrim(${table.publishedBy}) <> ''
        AND btrim(${table.approvalId}) <> ''
        AND btrim(${table.publicationProcess}) <> ''
        AND btrim(${table.commandVersion}) <> ''
        AND btrim(${table.gitCommit}) <> ''
        AND btrim(${table.reason}) <> ''`,
    ),
    check(
      "atlas_publications_state_metadata_check",
      sql`(
        ${table.state} = 'published'
        AND ${table.supersededAt} IS NULL
        AND ${table.supersededBy} IS NULL
        AND ${table.supersededReason} IS NULL
        AND ${table.supersededByPublicationId} IS NULL
      ) OR (
        ${table.state} = 'superseded'
        AND ${table.supersededAt} IS NOT NULL
        AND btrim(${table.supersededBy}) <> ''
        AND btrim(${table.supersededReason}) <> ''
      )`,
    ),
    index("atlas_publications_food_run_idx").on(table.foodScoreRunId),
    index("atlas_publications_equity_run_idx").on(table.equityBaselineRunId),
  ],
);

export const atlasPublicationScoreMembers = pgTable(
  "atlas_publication_score_members",
  {
    publicationId: uuid("publication_id").notNull(),
    geographyId: uuid("geography_id").notNull(),
    foodScoreId: uuid("food_score_id").notNull(),
    equityScoreId: uuid("equity_score_id").notNull(),
  },
  (table) => [
    foreignKey({
      name: "atlas_publication_score_members_publication_fk",
      columns: [table.publicationId],
      foreignColumns: [atlasPublications.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "atlas_publication_score_members_geography_fk",
      columns: [table.geographyId],
      foreignColumns: [geographies.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "atlas_publication_score_members_food_score_fk",
      columns: [table.foodScoreId],
      foreignColumns: [foodScores.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "atlas_publication_score_members_equity_score_fk",
      columns: [table.equityScoreId],
      foreignColumns: [scores.id],
    }).onDelete("restrict"),
    primaryKey({
      name: "atlas_publication_score_members_pk",
      columns: [table.publicationId, table.geographyId],
    }),
    unique("atlas_publication_score_members_food_unique").on(
      table.publicationId,
      table.foodScoreId,
    ),
    unique("atlas_publication_score_members_equity_unique").on(
      table.publicationId,
      table.equityScoreId,
    ),
  ],
);

export const atlasPublicationEquityComponentMembers = pgTable(
  "atlas_publication_equity_component_members",
  {
    publicationId: uuid("publication_id").notNull(),
    componentId: uuid("component_id").notNull(),
    indicatorValueId: uuid("indicator_value_id").notNull(),
  },
  (table) => [
    foreignKey({
      name: "atlas_publication_equity_component_members_publication_fk",
      columns: [table.publicationId],
      foreignColumns: [atlasPublications.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "atlas_publication_equity_component_members_component_fk",
      columns: [table.componentId],
      foreignColumns: [scoreComponents.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "atlas_publication_equity_component_members_value_fk",
      columns: [table.indicatorValueId],
      foreignColumns: [indicatorValues.id],
    }).onDelete("restrict"),
    primaryKey({
      name: "atlas_publication_equity_component_members_pk",
      columns: [table.publicationId, table.componentId],
    }),
  ],
);

export const atlasPublicationFoodComponentMembers = pgTable(
  "atlas_publication_food_component_members",
  {
    publicationId: uuid("publication_id").notNull(),
    componentId: uuid("component_id").notNull(),
    accessMetricValueId: uuid("access_metric_value_id").notNull(),
  },
  (table) => [
    foreignKey({
      name: "atlas_publication_food_component_members_publication_fk",
      columns: [table.publicationId],
      foreignColumns: [atlasPublications.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "atlas_publication_food_component_members_component_fk",
      columns: [table.componentId],
      foreignColumns: [foodScoreComponents.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "atlas_publication_food_component_members_value_fk",
      columns: [table.accessMetricValueId],
      foreignColumns: [foodAccessMetricValues.id],
    }).onDelete("restrict"),
    primaryKey({
      name: "atlas_publication_food_component_members_pk",
      columns: [table.publicationId, table.componentId],
    }),
  ],
);

export const atlasPublicationSourceSnapshotMembers = pgTable(
  "atlas_publication_source_snapshot_members",
  {
    publicationId: uuid("publication_id").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
    role: publicationSourceRoleEnum("role").notNull(),
    redistributionDecision: publicationRedistributionDecisionEnum(
      "redistribution_decision",
    ).notNull(),
    termsUrl: text("terms_url"),
    attribution: text("attribution").notNull(),
    warning: text("warning"),
  },
  (table) => [
    foreignKey({
      name: "atlas_publication_source_snapshot_members_publication_fk",
      columns: [table.publicationId],
      foreignColumns: [atlasPublications.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "atlas_publication_source_snapshot_members_snapshot_fk",
      columns: [table.snapshotId],
      foreignColumns: [sourceSnapshots.id],
    }).onDelete("restrict"),
    primaryKey({
      name: "atlas_publication_source_snapshot_members_pk",
      columns: [table.publicationId, table.snapshotId],
    }),
    check(
      "atlas_publication_source_snapshot_members_public_terms_check",
      sql`${table.redistributionDecision} NOT IN ('public_derived_results', 'public_direct_display')
        OR (${table.termsUrl} IS NOT NULL AND btrim(${table.attribution}) <> '')`,
    ),
  ],
);

export const atlasPublicationResourceVersionMembers = pgTable(
  "atlas_publication_resource_version_members",
  {
    publicationId: uuid("publication_id").notNull(),
    resourceVersionId: uuid("resource_version_id").notNull(),
    role: publicationResourceRoleEnum("role").notNull(),
    redistributionDecision: publicationRedistributionDecisionEnum(
      "redistribution_decision",
    ).notNull(),
    termsUrl: text("terms_url"),
    attribution: text("attribution").notNull(),
    warning: text("warning"),
  },
  (table) => [
    foreignKey({
      name: "atlas_publication_resource_version_members_publication_fk",
      columns: [table.publicationId],
      foreignColumns: [atlasPublications.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "atlas_publication_resource_version_members_version_fk",
      columns: [table.resourceVersionId],
      foreignColumns: [foodResourceVersions.id],
    }).onDelete("restrict"),
    primaryKey({
      name: "atlas_publication_resource_version_members_pk",
      columns: [table.publicationId, table.resourceVersionId],
    }),
    check(
      "atlas_publication_resource_version_members_policy_check",
      sql`(
        ${table.role} = 'public_display'
        AND ${table.redistributionDecision} = 'public_direct_display'
        AND ${table.termsUrl} IS NOT NULL
        AND btrim(${table.attribution}) <> ''
      ) OR (
        ${table.role} = 'scoring_inventory'
        AND ${table.redistributionDecision} <> 'public_direct_display'
        AND btrim(${table.attribution}) <> ''
      )`,
    ),
  ],
);

export const atlasPublicationAuditEvents = pgTable(
  "atlas_publication_audit_events",
  {
    id: uuid("id").primaryKey(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    action: publicationAuditActionEnum("action").notNull(),
    outcome: publicationAuditOutcomeEnum("outcome").notNull(),
    environment: publicationEnvironmentEnum("environment").notNull(),
    requestHash: char("request_hash", {length: 64}).notNull(),
    publicationId: uuid("publication_id"),
    actor: text("actor").notNull(),
    approvalId: text("approval_id").notNull(),
    eventAt: timestamp("event_at", {withTimezone: true}).notNull(),
    errorCode: text("error_code"),
    metadata: jsonb("metadata").notNull(),
  },
  (table) => [
    foreignKey({
      name: "atlas_publication_audit_events_publication_fk",
      columns: [table.publicationId],
      foreignColumns: [atlasPublications.id],
    }).onDelete("restrict"),
    unique("atlas_publication_audit_events_idempotency_outcome_unique").on(
      table.idempotencyKey,
      table.outcome,
    ),
    check(
      "atlas_publication_audit_events_request_hash_check",
      sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "atlas_publication_audit_events_text_check",
      sql`btrim(${table.actor}) <> '' AND btrim(${table.approvalId}) <> ''`,
    ),
    check(
      "atlas_publication_audit_events_error_check",
      sql`(${table.outcome} IN ('rejected', 'failed') AND btrim(${table.errorCode}) <> '')
        OR (${table.outcome} IN ('attempted', 'succeeded') AND ${table.errorCode} IS NULL)`,
    ),
    index("atlas_publication_audit_events_idempotency_idx").on(table.idempotencyKey),
    index("atlas_publication_audit_events_publication_idx").on(table.publicationId),
  ],
);
