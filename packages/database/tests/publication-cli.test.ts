import {describe, expect, it, vi} from "vitest";
import {
  parsePublicationCliArguments,
  runPublicationCli,
} from "../src/publication/cli";
import {PublicationCommandError} from "../src/publication/command";

const hash = (character: string) => character.repeat(64);
const foodRunId = "11111111-1111-4111-8111-111111111111";
const baselineRunId = "22222222-2222-4222-8222-222222222222";
const geographyId = "33333333-3333-4333-8333-333333333333";
const foodScoreId = "44444444-4444-4444-8444-444444444444";
const equityScoreId = "55555555-5555-4555-8555-555555555555";
const equityComponentId = "66666666-6666-4666-8666-666666666666";
const indicatorValueId = "77777777-7777-4777-8777-777777777777";
const foodComponentId = "88888888-8888-4888-8888-888888888888";
const accessMetricValueId = "99999999-9999-4999-8999-999999999999";
const snapshotId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const resourceVersionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const dryRequest = {
  action: "publish",
  environment: "development",
  candidateFoodRunId: foodRunId,
  expectedCurrentPublicationId: null,
  approvalId: "MOO-768-fixture",
  idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  confirmation: foodRunId,
  actor: "fixture-operator",
  reason: "Verify controlled publication.",
  gate3ApprovalId: null,
} as const;

const manifest = {
  schemaVersion: "atlas-publication-manifest-v1",
  foodRun: {id: foodRunId, outputHash: hash("a"), runFingerprint: hash("b")},
  equityBaselineRun: {
    id: baselineRunId,
    outputHash: hash("c"),
    runFingerprint: hash("d"),
  },
  scoreMembers: [{geographyId, foodScoreId, equityScoreId}],
  equityComponentMembers: [{componentId: equityComponentId, indicatorValueId}],
  foodComponentMembers: [{componentId: foodComponentId, accessMetricValueId}],
  sourceSnapshotMembers: [{
    snapshotId,
    role: "food_scoring_input",
    redistributionDecision: "public_derived_results",
    termsUrl: "https://example.gov/terms",
    attribution: "Example agency",
    warning: null,
  }],
  resourceVersionMembers: [{
    resourceVersionId,
    role: "scoring_inventory",
    redistributionDecision: "internal_reproduction_only",
    termsUrl: null,
    attribution: "USDA Food and Nutrition Service",
    warning: null,
  }],
} as const;

const evidence = {
  foodRun: {
    id: foodRunId,
    status: "validated",
    outputHash: hash("a"),
    runFingerprint: hash("b"),
    hasValidationResult: true,
    equityBaselineRunId: baselineRunId,
    equityBaselineOutputHash: hash("c"),
  },
  equityBaselineRun: {
    id: baselineRunId,
    status: "validated",
    outputHash: hash("c"),
    runFingerprint: hash("d"),
    hasValidationResult: true,
  },
  scores: [{
    geographyId,
    foodScoreId,
    foodRunId,
    equityScoreId,
    equityRunId: baselineRunId,
    foodPinnedEquityScoreId: equityScoreId,
  }],
  equityComponents: [{componentId: equityComponentId, runId: baselineRunId, indicatorValueId}],
  foodComponents: [{componentId: foodComponentId, runId: foodRunId, accessMetricValueId}],
  requiredSnapshotIds: [snapshotId],
  requiredResourceVersionIds: [resourceVersionId],
};

describe("publication CLI", () => {
  it("parses only the closed command and option vocabulary", () => {
    expect(parsePublicationCliArguments([
      "publish",
      "--request",
      "request.json",
      "--manifest",
      "manifest.json",
    ])).toMatchObject({command: "publish", requestPath: "request.json"});
    expect(() => parsePublicationCliArguments([
      "publish",
      "--request",
      "request.json",
      "--database-url",
      "secret",
    ])).toThrowError(new PublicationCommandError("arguments_invalid"));
  });

  it("performs a read-only dry run and emits its stable evidence hash", async () => {
    const publish = vi.fn();
    const withdraw = vi.fn();
    const writeReport = vi.fn().mockResolvedValue("/tmp/publication-report.json");
    const output = vi.fn();
    const result = await runPublicationCli([
      "dry-run",
      "--request",
      "request.json",
      "--manifest",
      "manifest.json",
    ], {
      environment: {
        DATABASE_URL_UNPOOLED: "postgresql://user:secret@ep-fixture.example.test/neondb",
        MKE_PIPELINE_ENV: "development",
        MKE_PUBLICATION_ENV: "development",
        MKE_PUBLICATION_EXPECTED_HOST: "ep-fixture.example.test",
        MKE_PUBLICATION_GIT_COMMIT: "abc1234",
      },
      readJson: async (path) => path === "request.json" ? dryRequest : manifest,
      createClient: () => ({execute: vi.fn()}),
      readCurrent: async () => null,
      readEvidence: async () => evidence,
      readRetry: async () => null,
      publish,
      withdraw,
      writeReport,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      writeOutput: output,
    });
    expect(result).toMatchObject({
      action: "dry_run",
      status: "succeeded",
      reportPath: "/tmp/publication-report.json",
    });
    expect(result.dryRunHash).toMatch(/^[0-9a-f]{64}$/);
    expect(publish).not.toHaveBeenCalled();
    expect(withdraw).not.toHaveBeenCalled();
    expect(writeReport).toHaveBeenCalledOnce();
    expect(JSON.stringify(writeReport.mock.calls[0]?.[0])).not.toContain("postgresql://");
  });

  it("reports a missing manifest before a publish dry run", async () => {
    const writeReport = vi.fn().mockResolvedValue("/tmp/publication-failure.json");

    await expect(runPublicationCli([
      "dry-run",
      "--request",
      "request.json",
    ], {
      readJson: async () => dryRequest,
      writeReport,
      writeOutput: vi.fn(),
    })).rejects.toThrowError(new PublicationCommandError("manifest_path_missing"));
    expect(writeReport).toHaveBeenCalledOnce();
  });

  it("returns an exact recorded write retry without revalidating changed current state", async () => {
    const publish = vi.fn();
    const withdraw = vi.fn();
    const readEvidence = vi.fn();
    const writeReport = vi.fn().mockResolvedValue("/tmp/publication-retry.json");
    const result = await runPublicationCli([
      "publish",
      "--request",
      "request.json",
      "--manifest",
      "manifest.json",
    ], {
      environment: {
        DATABASE_URL_UNPOOLED: "postgresql://user:secret@ep-fixture.example.test/neondb",
        MKE_PIPELINE_ENV: "development",
        MKE_PUBLICATION_ENV: "development",
        MKE_PUBLICATION_EXPECTED_HOST: "ep-fixture.example.test",
        MKE_PUBLICATION_GIT_COMMIT: "abc1234",
      },
      readJson: async () => ({...dryRequest, dryRunHash: hash("e")}),
      createClient: () => ({execute: vi.fn()}),
      readCurrent: async () => null,
      readEvidence,
      readRetry: async () => ({
        publicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        bundleFingerprint: hash("f"),
      }),
      publish,
      withdraw,
      writeReport,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      writeOutput: vi.fn(),
    });
    expect(result).toMatchObject({
      status: "succeeded",
      result: {
        publicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        reused: true,
      },
      bundleFingerprint: hash("f"),
    });
    expect(readEvidence).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(withdraw).not.toHaveBeenCalled();
  });
});
