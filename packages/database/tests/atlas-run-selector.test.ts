import {describe, expect, it, vi} from "vitest";
import {selectAtlasRun, type AtlasRunSelectionClient} from "../src/atlas/run-selector";

const environment = {
  DATABASE_URL: "postgresql://pooled.example/mke",
  MKE_ATLAS_DATA_MODE: "validated_preview",
  MKE_ATLAS_PREVIEW_RUN_ID: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
  MKE_PIPELINE_ENV: "development",
  NODE_ENV: "development",
};

const hash = "a".repeat(64);
const baselineHash = "b".repeat(64);

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    food_run_id: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
    food_methodology_version: "food-equity-v1",
    food_status: "validated",
    food_completed_at: new Date("2026-08-30T12:00:00.000Z"),
    food_data_vintages: {acs: "2020-2024", foodRetail: "2025"},
    food_validation_result: {status: "valid"},
    food_output_hash: hash,
    equity_baseline_run_id: "502e2a04-b013-53cd-8b09-c9144862701a",
    pinned_equity_baseline_output_hash: baselineHash,
    baseline_methodology_version: "equity-baseline-v1",
    baseline_status: "validated",
    baseline_validation_result: {status: "valid"},
    baseline_output_hash: baselineHash,
    ...overrides,
  };
}

function clientWith(rows: Array<Record<string, unknown>>): AtlasRunSelectionClient {
  return {execute: vi.fn(() => Promise.resolve({rows}))};
}

describe("selectAtlasRun", () => {
  it("returns no published run without querying a validated fallback", async () => {
    const createClient = vi.fn();

    await expect(selectAtlasRun({}, createClient)).resolves.toEqual({
      state: "unavailable",
      reason: "no_published_run",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("selects the exact validated run and its pinned validated baseline", async () => {
    const client = clientWith([validRow()]);

    const result = await selectAtlasRun(environment, () => client);

    expect(result).toEqual({
      state: "selected",
      mode: "validated_preview",
      run: {
        id: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
        methodologyVersion: "food-equity-v1",
        equityBaselineMethodologyVersion: "equity-baseline-v1",
        completedAt: "2026-08-30T12:00:00.000Z",
        dataVintages: {acs: "2020-2024", foodRetail: "2025"},
        publication: null,
      },
      equityBaselineRunId: "502e2a04-b013-53cd-8b09-c9144862701a",
      foodOutputHash: hash,
      equityBaselineOutputHash: baselineHash,
    });
    expect(client.execute).toHaveBeenCalledOnce();
  });

  it("does not accept another run when the exact id is absent", async () => {
    await expect(selectAtlasRun(environment, () => clientWith([]))).resolves.toEqual({
      state: "unavailable",
      reason: "run_not_found",
    });
  });

  it.each([
    ["draft Food run", {food_status: "draft"}, "run_not_validated"],
    ["failed Food run", {food_status: "failed"}, "run_not_validated"],
    ["draft baseline", {baseline_status: "draft"}, "data_incomplete"],
    ["missing Food output hash", {food_output_hash: null}, "data_incomplete"],
    ["missing validation result", {food_validation_result: null}, "data_incomplete"],
    ["mismatched baseline output hash", {baseline_output_hash: "c".repeat(64)}, "data_incomplete"],
    ["nested data vintage", {food_data_vintages: {source: {year: 2025}}}, "data_incomplete"],
  ] as const)("fails closed for %s", async (_name, overrides, reason) => {
    await expect(selectAtlasRun(
      environment,
      () => clientWith([validRow(overrides)]),
    )).resolves.toEqual({state: "unavailable", reason});
  });

  it("fails closed on duplicate rows", async () => {
    await expect(selectAtlasRun(
      environment,
      () => clientWith([validRow(), validRow()]),
    )).resolves.toEqual({state: "unavailable", reason: "data_incomplete"});
  });

  it("redacts client and query failures into a safe unavailable state", async () => {
    const createClient = vi.fn(() => {
      throw new Error("postgresql://user:secret@example/mke");
    });

    await expect(selectAtlasRun(environment, createClient)).resolves.toEqual({
      state: "unavailable",
      reason: "data_incomplete",
    });
  });
});
