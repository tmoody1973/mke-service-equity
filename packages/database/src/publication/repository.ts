import {
  publicationCommandRequestSchema,
  type AtlasPublicationManifest,
  type PublicationCommandRequest,
} from "@mke/contracts";
import type {SQL} from "drizzle-orm";
import {sql} from "drizzle-orm";
import type {PublicationReconciliationEvidence} from "./reconciliation";

export interface PublicationOperationClient {
  execute(query: SQL): PromiseLike<{rows: Array<Record<string, unknown>>}>;
}

export class PublicationOperationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PublicationOperationError";
  }
}

type PublishRequest = Extract<PublicationCommandRequest, {action: "publish"}>;
type WithdrawRequest = Extract<PublicationCommandRequest, {action: "withdraw"}>;

type PublishMetadata = {
  publicationId: string;
  auditEventId: string;
  bundleFingerprint: string;
  publicationProcess: string;
  commandVersion: string;
  gitCommit: string;
  validationSummary: Record<string, unknown>;
  requestHash: string;
};

export async function readSuccessfulPublicationRetry(
  client: PublicationOperationClient,
  input: {
    action: "publish" | "withdraw";
    idempotencyKey: string;
    requestHash: string;
  },
): Promise<{publicationId: string; bundleFingerprint: string} | null> {
  try {
    const result = await client.execute(sql`
      select
        audit.action::text,
        audit.outcome::text,
        audit.request_hash,
        audit.publication_id,
        publication.bundle_fingerprint
      from atlas_publication_audit_events audit
      join atlas_publications publication on publication.id = audit.publication_id
      where audit.idempotency_key = ${input.idempotencyKey}::uuid
    `);
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0]!;
    if (
      result.rows.length !== 1
      || row.action !== input.action
      || row.outcome !== "succeeded"
      || row.request_hash !== input.requestHash
    ) {
      throw new PublicationOperationError("idempotency_key_reused");
    }
    return {
      publicationId: requiredString(row, "publication_id"),
      bundleFingerprint: requiredString(row, "bundle_fingerprint"),
    };
  } catch (error) {
    if (error instanceof PublicationOperationError) {
      throw error;
    }
    throw new PublicationOperationError("publication_retry_read_failed");
  }
}

function asDatabaseMembers(manifest: AtlasPublicationManifest) {
  return {
    scores: manifest.scoreMembers.map((member) => ({
      geography_id: member.geographyId,
      food_score_id: member.foodScoreId,
      equity_score_id: member.equityScoreId,
    })),
    equityComponents: manifest.equityComponentMembers.map((member) => ({
      component_id: member.componentId,
      indicator_value_id: member.indicatorValueId,
    })),
    foodComponents: manifest.foodComponentMembers.map((member) => ({
      component_id: member.componentId,
      access_metric_value_id: member.accessMetricValueId,
    })),
    snapshots: manifest.sourceSnapshotMembers.map((member) => ({
      snapshot_id: member.snapshotId,
      role: member.role,
      redistribution_decision: member.redistributionDecision,
      terms_url: member.termsUrl,
      attribution: member.attribution,
      warning: member.warning,
    })),
    resources: manifest.resourceVersionMembers.map((member) => ({
      resource_version_id: member.resourceVersionId,
      role: member.role,
      redistribution_decision: member.redistributionDecision,
      terms_url: member.termsUrl,
      attribution: member.attribution,
      warning: member.warning,
    })),
  };
}

function readPublicationId(
  rows: Array<Record<string, unknown>>,
  failureCode: string,
): string {
  const publicationId = rows[0]?.publication_id;
  if (rows.length !== 1 || typeof publicationId !== "string") {
    throw new PublicationOperationError(failureCode);
  }
  return publicationId;
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new PublicationOperationError("candidate_evidence_invalid");
  }
  return value;
}

function requiredBoolean(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") {
    throw new PublicationOperationError("candidate_evidence_invalid");
  }
  return value;
}

function uuidList(values: ReadonlyArray<string>): SQL {
  return sql.join(values.map((value) => sql`${value}::uuid`), sql`, `);
}

export async function readPublicationReconciliationEvidence(
  client: PublicationOperationClient,
  manifest: AtlasPublicationManifest,
): Promise<PublicationReconciliationEvidence> {
  try {
    const [runResult, scoreResult, equityComponentResult, foodComponentResult] = await Promise.all([
      client.execute(sql`
        select
          food.id as food_run_id,
          food.status::text as food_status,
          food.output_hash as food_output_hash,
          food.run_fingerprint as food_run_fingerprint,
          (food.validation_result is not null) as food_has_validation_result,
          food.equity_baseline_run_id,
          food.equity_baseline_output_hash,
          baseline.status::text as baseline_status,
          baseline.output_hash as baseline_output_hash,
          baseline.run_fingerprint as baseline_run_fingerprint,
          (baseline.validation_result is not null) as baseline_has_validation_result
        from food_score_runs food
        join score_runs baseline on baseline.id = food.equity_baseline_run_id
        where food.id = ${manifest.foodRun.id}::uuid
      `),
      client.execute(sql`
        select
          food.geography_id,
          food.id as food_score_id,
          food.food_score_run_id as food_run_id,
          equity.id as equity_score_id,
          equity.score_run_id as equity_run_id,
          food.equity_baseline_score_id as food_pinned_equity_score_id
        from food_scores food
        join scores equity on equity.id = food.equity_baseline_score_id
        where food.food_score_run_id = ${manifest.foodRun.id}::uuid
        order by food.geography_id
      `),
      client.execute(sql`
        select
          component.id as component_id,
          component.score_run_id as run_id,
          component.indicator_value_id
        from score_components component
        where component.score_run_id = ${manifest.equityBaselineRun.id}::uuid
        order by component.id
      `),
      client.execute(sql`
        select
          component.id as component_id,
          component.food_score_run_id as run_id,
          component.access_metric_value_id
        from food_score_components component
        where component.food_score_run_id = ${manifest.foodRun.id}::uuid
        order by component.id
      `),
    ]);

    if (runResult.rows.length !== 1) {
      throw new PublicationOperationError("candidate_run_missing");
    }

    const [snapshotResult, resourceResult] = await Promise.all([
      client.execute(sql`
        select snapshot.id
        from source_snapshots snapshot
        where snapshot.id in (${uuidList(
          manifest.sourceSnapshotMembers.map((member) => member.snapshotId),
        )})
          and snapshot.validation_status = 'valid'
        order by snapshot.id
      `),
      client.execute(sql`
        select version.id
        from food_resource_versions version
        where version.id in (${uuidList(
          manifest.resourceVersionMembers.map((member) => member.resourceVersionId),
        )})
        order by version.id
      `),
    ]);

    const run = runResult.rows[0]!;
    return {
      foodRun: {
        id: requiredString(run, "food_run_id"),
        status: requiredString(run, "food_status"),
        outputHash: requiredString(run, "food_output_hash"),
        runFingerprint: requiredString(run, "food_run_fingerprint"),
        hasValidationResult: requiredBoolean(run, "food_has_validation_result"),
        equityBaselineRunId: requiredString(run, "equity_baseline_run_id"),
        equityBaselineOutputHash: requiredString(run, "equity_baseline_output_hash"),
      },
      equityBaselineRun: {
        id: requiredString(run, "equity_baseline_run_id"),
        status: requiredString(run, "baseline_status"),
        outputHash: requiredString(run, "baseline_output_hash"),
        runFingerprint: requiredString(run, "baseline_run_fingerprint"),
        hasValidationResult: requiredBoolean(run, "baseline_has_validation_result"),
      },
      scores: scoreResult.rows.map((row) => ({
        geographyId: requiredString(row, "geography_id"),
        foodScoreId: requiredString(row, "food_score_id"),
        foodRunId: requiredString(row, "food_run_id"),
        equityScoreId: requiredString(row, "equity_score_id"),
        equityRunId: requiredString(row, "equity_run_id"),
        foodPinnedEquityScoreId: requiredString(row, "food_pinned_equity_score_id"),
      })),
      equityComponents: equityComponentResult.rows.map((row) => ({
        componentId: requiredString(row, "component_id"),
        runId: requiredString(row, "run_id"),
        indicatorValueId: requiredString(row, "indicator_value_id"),
      })),
      foodComponents: foodComponentResult.rows.map((row) => ({
        componentId: requiredString(row, "component_id"),
        runId: requiredString(row, "run_id"),
        accessMetricValueId: requiredString(row, "access_metric_value_id"),
      })),
      requiredSnapshotIds: snapshotResult.rows.map((row) => requiredString(row, "id")),
      requiredResourceVersionIds: resourceResult.rows.map((row) => requiredString(row, "id")),
    };
  } catch (error) {
    if (error instanceof PublicationOperationError) {
      throw error;
    }
    throw new PublicationOperationError("candidate_evidence_read_failed");
  }
}

export async function readCurrentPublicationIdentity(
  client: PublicationOperationClient,
): Promise<{
  id: string;
  foodRunId: string;
  equityBaselineRunId: string;
  bundleFingerprint: string;
} | null> {
  try {
    const result = await client.execute(sql`
      select
        publication.id,
        publication.food_score_run_id,
        publication.equity_baseline_run_id,
        publication.bundle_fingerprint
      from atlas_publications publication
      where publication.state = 'published'
    `);
    if (result.rows.length === 0) {
      return null;
    }
    if (result.rows.length !== 1) {
      throw new PublicationOperationError("multiple_current_publications");
    }
    const row = result.rows[0]!;
    return {
      id: requiredString(row, "id"),
      foodRunId: requiredString(row, "food_score_run_id"),
      equityBaselineRunId: requiredString(row, "equity_baseline_run_id"),
      bundleFingerprint: requiredString(row, "bundle_fingerprint"),
    };
  } catch (error) {
    if (error instanceof PublicationOperationError) {
      throw error;
    }
    throw new PublicationOperationError("current_publication_read_failed");
  }
}

export async function publishAtlasRelease(
  client: PublicationOperationClient,
  rawRequest: PublishRequest,
  manifest: AtlasPublicationManifest,
  metadata: PublishMetadata,
) {
  const request = publicationCommandRequestSchema.parse(rawRequest);
  if (request.action !== "publish" || request.candidateFoodRunId !== manifest.foodRun.id) {
    throw new PublicationOperationError("candidate_manifest_mismatch");
  }
  const members = asDatabaseMembers(manifest);

  try {
    const result = await client.execute(sql`
      select publish_atlas_release(
        ${metadata.publicationId}::uuid,
        ${request.candidateFoodRunId}::uuid,
        ${request.expectedCurrentPublicationId}::uuid,
        ${metadata.bundleFingerprint}::char(64),
        ${request.dryRunHash}::char(64),
        ${request.approvalId},
        ${request.idempotencyKey}::uuid,
        ${request.actor},
        ${metadata.publicationProcess},
        ${metadata.commandVersion},
        ${metadata.gitCommit},
        ${request.reason},
        ${JSON.stringify(metadata.validationSummary)}::jsonb,
        ${JSON.stringify(members.scores)}::jsonb,
        ${JSON.stringify(members.equityComponents)}::jsonb,
        ${JSON.stringify(members.foodComponents)}::jsonb,
        ${JSON.stringify(members.snapshots)}::jsonb,
        ${JSON.stringify(members.resources)}::jsonb,
        ${metadata.auditEventId}::uuid,
        ${request.environment}::publication_environment,
        ${metadata.requestHash}::char(64)
      ) as publication_id
    `);
    const publicationId = readPublicationId(result.rows, "publish_failed");
    return {publicationId, reused: publicationId !== metadata.publicationId};
  } catch (error) {
    if (error instanceof PublicationOperationError) {
      throw error;
    }
    throw new PublicationOperationError("publish_rejected");
  }
}

export async function withdrawAtlasRelease(
  client: PublicationOperationClient,
  rawRequest: WithdrawRequest,
  metadata: {auditEventId: string; requestHash: string},
) {
  const request = publicationCommandRequestSchema.parse(rawRequest);
  if (request.action !== "withdraw") {
    throw new PublicationOperationError("withdraw_request_invalid");
  }

  try {
    const result = await client.execute(sql`
      select withdraw_atlas_release(
        ${request.expectedCurrentPublicationId}::uuid,
        ${request.approvalId},
        ${request.idempotencyKey}::uuid,
        ${request.actor},
        ${request.reason},
        ${metadata.auditEventId}::uuid,
        ${request.environment}::publication_environment,
        ${metadata.requestHash}::char(64)
      ) as publication_id
    `);
    return {publicationId: readPublicationId(result.rows, "withdraw_failed")};
  } catch (error) {
    if (error instanceof PublicationOperationError) {
      throw error;
    }
    throw new PublicationOperationError("withdraw_rejected");
  }
}
