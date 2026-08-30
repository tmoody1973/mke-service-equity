import {
  atlasRunSummarySchema,
  type AtlasMode,
  type AtlasRunSummary,
  type AtlasUnavailableReason,
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

export type SelectedAtlasRun = {
  state: "selected";
  mode: AtlasMode;
  run: AtlasRunSummary;
  equityBaselineRunId: string;
  foodOutputHash: string;
  equityBaselineOutputHash: string;
};

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
    run: parsedRun.data,
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

  // MOO-768 will replace this branch with the governed current-publication selector.
  // A validated run is never an implicit public fallback.
  if (dataMode.mode === "published") {
    return unavailable("no_published_run");
  }

  let client: AtlasRunSelectionClient;
  try {
    client = createClient(readRuntimeDatabaseUrl(environment));
  } catch {
    return unavailable("data_incomplete");
  }

  try {
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
