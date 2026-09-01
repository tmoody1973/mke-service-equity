import {
  atlasRunSummarySchema,
  type AtlasRunSummary,
  type AtlasUnavailableReason,
  type CurrentAtlasPublication,
} from "@mke/contracts";
import type {SQL} from "drizzle-orm";
import {sql} from "drizzle-orm";
import {createDatabaseClient} from "../client";
import {readRuntimeDatabaseUrl} from "../env";
import {readAtlasDataMode} from "./data-mode";

type AtlasEnvironment = Record<string, string | undefined>;

export interface AtlasRunSelectionClient {
  execute(query: SQL): PromiseLike<{rows: Array<Record<string, unknown>>}>;
}

type AtlasRunSelectionClientFactory = (databaseUrl: string) => AtlasRunSelectionClient;

type SelectedAtlasRunBase = {
  state: "selected";
  equityBaselineRunId: string;
  foodOutputHash: string;
  equityBaselineOutputHash: string;
};

export type SelectedAtlasRun = SelectedAtlasRunBase & (
  | {
    mode: "published";
    run: AtlasRunSummary & {publication: CurrentAtlasPublication};
  }
  | {
    mode: "validated_preview";
    run: AtlasRunSummary & {publication: null};
  }
);

export type UnavailableAtlasRun = {
  state: "unavailable";
  reason: AtlasUnavailableReason;
};

export type AtlasRunSelection = SelectedAtlasRun | UnavailableAtlasRun;

const hashPattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDate(value: unknown): string | null {
  const date = value instanceof Date
    ? value
    : typeof value === "string"
      ? new Date(value)
      : null;

  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function readStringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) {
    return null;
  }

  const entries = Object.entries(value);
  if (entries.some(([key, entry]) => key.trim().length === 0
    || typeof entry !== "string"
    || entry.trim().length === 0)) {
    return null;
  }

  return Object.fromEntries(entries.map(([key, entry]) => [key, (entry as string).trim()]));
}

function unavailable(reason: AtlasUnavailableReason): UnavailableAtlasRun {
  return {state: "unavailable", reason};
}

function readCount(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function readPublicationCounts(value: unknown): {
  scoreCount: number;
  equityComponentCount: number;
  foodComponentCount: number;
  sourceSnapshotCount: number;
  resourceVersionCount: number;
} | null {
  if (!isRecord(value)) {
    return null;
  }
  const keys = [
    "scoreCount",
    "equityComponentCount",
    "foodComponentCount",
    "sourceSnapshotCount",
    "resourceVersionCount",
  ] as const;
  if (Object.keys(value).length !== keys.length) {
    return null;
  }
  const counts = Object.fromEntries(keys.map((key) => [key, readCount(value[key])]));
  if (Object.values(counts).some((count) => count === null)) {
    return null;
  }
  return counts as Record<typeof keys[number], number>;
}

function validatePreviewRow(row: Record<string, unknown>): AtlasRunSelection {
  if (row.food_status !== "validated") {
    return unavailable("run_not_validated");
  }

  if (row.baseline_status !== "validated" && row.baseline_status !== "published") {
    return unavailable("data_incomplete");
  }

  const foodOutputHash = row.food_output_hash;
  const pinnedBaselineOutputHash = row.pinned_equity_baseline_output_hash;
  const baselineOutputHash = row.baseline_output_hash;
  const equityBaselineRunId = row.equity_baseline_run_id;
  const completedAt = readDate(row.food_completed_at);
  const dataVintages = readStringRecord(row.food_data_vintages);

  if (
    typeof foodOutputHash !== "string"
    || !hashPattern.test(foodOutputHash)
    || typeof pinnedBaselineOutputHash !== "string"
    || !hashPattern.test(pinnedBaselineOutputHash)
    || typeof baselineOutputHash !== "string"
    || !hashPattern.test(baselineOutputHash)
    || pinnedBaselineOutputHash !== baselineOutputHash
    || typeof equityBaselineRunId !== "string"
    || !uuidPattern.test(equityBaselineRunId)
    || !completedAt
    || !dataVintages
    || !isRecord(row.food_validation_result)
    || !isRecord(row.baseline_validation_result)
  ) {
    return unavailable("data_incomplete");
  }

  const parsedRun = atlasRunSummarySchema.safeParse({
    id: row.food_run_id,
    methodologyVersion: row.food_methodology_version,
    equityBaselineMethodologyVersion: row.baseline_methodology_version,
    completedAt,
    dataVintages,
  });

  if (!parsedRun.success) {
    return unavailable("data_incomplete");
  }

  return {
    state: "selected",
    mode: "validated_preview",
    run: {...parsedRun.data, publication: null},
    equityBaselineRunId,
    foodOutputHash,
    equityBaselineOutputHash: baselineOutputHash,
  };
}

function validatePublishedRow(row: Record<string, unknown>): AtlasRunSelection {
  if (
    row.publication_state !== "published"
    || row.food_status !== "published"
    || row.baseline_status !== "published"
  ) {
    return unavailable("data_incomplete");
  }

  const foodRunId = row.food_run_id;
  const publicationFoodRunId = row.publication_food_run_id;
  const equityBaselineRunId = row.equity_baseline_run_id;
  const publicationBaselineRunId = row.publication_equity_baseline_run_id;
  const foodOutputHash = row.food_output_hash;
  const publicationFoodOutputHash = row.publication_food_output_hash;
  const baselineOutputHash = row.baseline_output_hash;
  const pinnedBaselineOutputHash = row.pinned_equity_baseline_output_hash;
  const publicationBaselineOutputHash = row.publication_equity_baseline_output_hash;
  const publishedAt = readDate(row.publication_published_at);
  const completedAt = readDate(row.food_completed_at);
  const dataVintages = readStringRecord(row.food_data_vintages);
  const validationCounts = readPublicationCounts(row.publication_validation_summary);

  const counts = {
    score: readCount(row.publication_score_member_count),
    foodScore: readCount(row.food_score_count),
    baselineScore: readCount(row.baseline_score_count),
    equityComponent: readCount(row.publication_equity_component_member_count),
    baselineComponent: readCount(row.baseline_component_count),
    foodComponent: readCount(row.publication_food_component_member_count),
    runFoodComponent: readCount(row.food_component_count),
    snapshot: readCount(row.publication_source_snapshot_member_count),
    resource: readCount(row.publication_resource_version_member_count),
    scoreMismatch: readCount(row.score_pair_mismatch_count),
    equityComponentMismatch: readCount(row.equity_component_mismatch_count),
    foodComponentMismatch: readCount(row.food_component_mismatch_count),
    invalidPolicy: readCount(row.invalid_policy_member_count),
  };

  if (
    typeof foodRunId !== "string"
    || !uuidPattern.test(foodRunId)
    || publicationFoodRunId !== foodRunId
    || typeof equityBaselineRunId !== "string"
    || !uuidPattern.test(equityBaselineRunId)
    || publicationBaselineRunId !== equityBaselineRunId
    || typeof foodOutputHash !== "string"
    || !hashPattern.test(foodOutputHash)
    || publicationFoodOutputHash !== foodOutputHash
    || typeof baselineOutputHash !== "string"
    || !hashPattern.test(baselineOutputHash)
    || pinnedBaselineOutputHash !== baselineOutputHash
    || publicationBaselineOutputHash !== baselineOutputHash
    || !publishedAt
    || !completedAt
    || !dataVintages
    || !validationCounts
    || !isRecord(row.food_validation_result)
    || !isRecord(row.baseline_validation_result)
    || Object.values(counts).some((count) => count === null)
    || counts.score !== counts.foodScore
    || counts.score !== counts.baselineScore
    || counts.equityComponent !== counts.baselineComponent
    || counts.foodComponent !== counts.runFoodComponent
    || counts.score !== validationCounts.scoreCount
    || counts.equityComponent !== validationCounts.equityComponentCount
    || counts.foodComponent !== validationCounts.foodComponentCount
    || counts.snapshot !== validationCounts.sourceSnapshotCount
    || counts.resource !== validationCounts.resourceVersionCount
    || counts.scoreMismatch !== 0
    || counts.equityComponentMismatch !== 0
    || counts.foodComponentMismatch !== 0
    || counts.invalidPolicy !== 0
  ) {
    return unavailable("data_incomplete");
  }

  const parsedRun = atlasRunSummarySchema.safeParse({
    id: foodRunId,
    methodologyVersion: row.food_methodology_version,
    equityBaselineMethodologyVersion: row.baseline_methodology_version,
    completedAt,
    dataVintages,
    publication: {
      id: row.publication_id,
      publishedAt,
      bundleFingerprint: row.publication_bundle_fingerprint,
    },
  });
  if (!parsedRun.success || parsedRun.data.publication === null) {
    return unavailable("data_incomplete");
  }

  return {
    state: "selected",
    mode: "published",
    run: {...parsedRun.data, publication: parsedRun.data.publication},
    equityBaselineRunId,
    foodOutputHash,
    equityBaselineOutputHash: baselineOutputHash,
  };
}

export async function selectAtlasRun(
  environment: AtlasEnvironment = process.env,
  createClient: AtlasRunSelectionClientFactory = createDatabaseClient,
): Promise<AtlasRunSelection> {
  const dataMode = readAtlasDataMode(environment);

  if (dataMode.state === "unavailable") {
    return dataMode;
  }

  let client: AtlasRunSelectionClient;
  try {
    client = createClient(readRuntimeDatabaseUrl(environment));
  } catch {
    return unavailable("data_incomplete");
  }

  try {
    if (dataMode.mode === "published") {
      const result = await client.execute(sql`
        select
          publication.id as publication_id,
          publication.state::text as publication_state,
          publication.published_at as publication_published_at,
          publication.bundle_fingerprint as publication_bundle_fingerprint,
          publication.food_score_run_id as publication_food_run_id,
          publication.equity_baseline_run_id as publication_equity_baseline_run_id,
          publication.food_output_hash as publication_food_output_hash,
          publication.equity_baseline_output_hash as publication_equity_baseline_output_hash,
          publication.validation_summary as publication_validation_summary,
          food.id as food_run_id,
          food.methodology_version as food_methodology_version,
          food.status::text as food_status,
          food.completed_at as food_completed_at,
          food.data_vintages as food_data_vintages,
          food.validation_result as food_validation_result,
          food.output_hash as food_output_hash,
          food.equity_baseline_run_id as equity_baseline_run_id,
          food.equity_baseline_output_hash as pinned_equity_baseline_output_hash,
          baseline.methodology_version as baseline_methodology_version,
          baseline.status::text as baseline_status,
          baseline.validation_result as baseline_validation_result,
          baseline.output_hash as baseline_output_hash,
          (select count(*) from atlas_publication_score_members member
            where member.publication_id = publication.id) as publication_score_member_count,
          (select count(*) from food_scores score
            where score.food_score_run_id = food.id) as food_score_count,
          (select count(*) from scores score
            where score.score_run_id = baseline.id) as baseline_score_count,
          (select count(*) from atlas_publication_equity_component_members member
            where member.publication_id = publication.id)
            as publication_equity_component_member_count,
          (select count(*) from score_components component
            where component.score_run_id = baseline.id) as baseline_component_count,
          (select count(*) from atlas_publication_food_component_members member
            where member.publication_id = publication.id)
            as publication_food_component_member_count,
          (select count(*) from food_score_components component
            where component.food_score_run_id = food.id) as food_component_count,
          (select count(*) from atlas_publication_source_snapshot_members member
            where member.publication_id = publication.id)
            as publication_source_snapshot_member_count,
          (select count(*) from atlas_publication_resource_version_members member
            where member.publication_id = publication.id)
            as publication_resource_version_member_count,
          (select count(*)
            from atlas_publication_score_members member
            left join food_scores food_score on food_score.id = member.food_score_id
            left join scores equity_score on equity_score.id = member.equity_score_id
            where member.publication_id = publication.id
              and (
                food_score.food_score_run_id is distinct from food.id
                or equity_score.score_run_id is distinct from baseline.id
                or food_score.geography_id is distinct from member.geography_id
                or equity_score.geography_id is distinct from member.geography_id
                or food_score.equity_baseline_score_id is distinct from member.equity_score_id
              )) as score_pair_mismatch_count,
          (select count(*)
            from atlas_publication_equity_component_members member
            left join score_components component on component.id = member.component_id
            where member.publication_id = publication.id
              and (
                component.score_run_id is distinct from baseline.id
                or component.indicator_value_id is distinct from member.indicator_value_id
              )) as equity_component_mismatch_count,
          (select count(*)
            from atlas_publication_food_component_members member
            left join food_score_components component on component.id = member.component_id
            where member.publication_id = publication.id
              and (
                component.food_score_run_id is distinct from food.id
                or component.access_metric_value_id is distinct from member.access_metric_value_id
              )) as food_component_mismatch_count,
          (
            (select count(*) from atlas_publication_source_snapshot_members member
              where member.publication_id = publication.id
                and (
                  member.redistribution_decision = 'prohibited_public_use'
                  or btrim(member.attribution) = ''
                  or (
                    member.redistribution_decision in (
                      'public_derived_results',
                      'public_direct_display'
                    ) and member.terms_url is null
                  )
                ))
            +
            (select count(*) from atlas_publication_resource_version_members member
              where member.publication_id = publication.id
                and (
                  member.redistribution_decision = 'prohibited_public_use'
                  or btrim(member.attribution) = ''
                  or (member.role = 'scoring_inventory'
                    and member.redistribution_decision = 'public_direct_display')
                  or (member.role = 'public_display'
                    and (
                      member.redistribution_decision <> 'public_direct_display'
                      or member.terms_url is null
                    ))
                ))
          ) as invalid_policy_member_count
        from atlas_publications publication
        join food_score_runs food on food.id = publication.food_score_run_id
        join score_runs baseline on baseline.id = publication.equity_baseline_run_id
        where publication.state = 'published'
        limit 2
      `);
      if (result.rows.length === 0) {
        return unavailable("no_published_run");
      }
      if (result.rows.length !== 1) {
        return unavailable("data_incomplete");
      }
      return validatePublishedRow(result.rows[0] as Record<string, unknown>);
    }

    const result = await client.execute(sql`
      select
        food.id as food_run_id,
        food.methodology_version as food_methodology_version,
        food.status as food_status,
        food.completed_at as food_completed_at,
        food.data_vintages as food_data_vintages,
        food.validation_result as food_validation_result,
        food.output_hash as food_output_hash,
        food.equity_baseline_run_id as equity_baseline_run_id,
        food.equity_baseline_output_hash as pinned_equity_baseline_output_hash,
        baseline.methodology_version as baseline_methodology_version,
        baseline.status as baseline_status,
        baseline.validation_result as baseline_validation_result,
        baseline.output_hash as baseline_output_hash
      from food_score_runs as food
      join score_runs as baseline on baseline.id = food.equity_baseline_run_id
      where food.id = ${dataMode.runId}::uuid
      limit 2
    `);

    if (result.rows.length === 0) {
      return unavailable("run_not_found");
    }
    if (result.rows.length !== 1) {
      return unavailable("data_incomplete");
    }

    return validatePreviewRow(result.rows[0] as Record<string, unknown>);
  } catch {
    return unavailable("data_incomplete");
  }
}
