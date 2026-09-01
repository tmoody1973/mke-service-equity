import {describe, expect, it, vi} from "vitest";
import {buildPublicationManifest} from "../src/publication/manifest";
import {
  publishAtlasRelease,
  PublicationOperationError,
  readPublicationReconciliationEvidence,
  readSuccessfulPublicationRetry,
  withdrawAtlasRelease,
} from "../src/publication/repository";

const hash = (character: string) => character.repeat(64);
const publicationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const foodRunId = "11111111-1111-4111-8111-111111111111";
const baselineRunId = "22222222-2222-4222-8222-222222222222";

function manifest() {
  return buildPublicationManifest({
    foodRun: {id: foodRunId, outputHash: hash("a"), runFingerprint: hash("b")},
    equityBaselineRun: {
      id: baselineRunId,
      outputHash: hash("c"),
      runFingerprint: hash("d"),
    },
    scoreMembers: [{
      geographyId: "33333333-3333-4333-8333-333333333333",
      foodScoreId: "44444444-4444-4444-8444-444444444444",
      equityScoreId: "55555555-5555-4555-8555-555555555555",
    }],
    equityComponentMembers: [{
      componentId: "66666666-6666-4666-8666-666666666666",
      indicatorValueId: "77777777-7777-4777-8777-777777777777",
    }],
    foodComponentMembers: [{
      componentId: "88888888-8888-4888-8888-888888888888",
      accessMetricValueId: "99999999-9999-4999-8999-999999999999",
    }],
    sourceSnapshotMembers: [{
      snapshotId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      role: "food_scoring_input",
      redistributionDecision: "public_derived_results",
      termsUrl: "https://example.gov/terms",
      attribution: "Example agency",
      warning: null,
    }],
    resourceVersionMembers: [{
      resourceVersionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      role: "scoring_inventory",
      redistributionDecision: "internal_reproduction_only",
      termsUrl: null,
      attribution: "USDA Food and Nutrition Service",
      warning: null,
    }],
  });
}

const request = {
  action: "publish",
  environment: "development",
  candidateFoodRunId: foodRunId,
  expectedCurrentPublicationId: null,
  approvalId: "MOO-768-fixture",
  idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  dryRunHash: hash("e"),
  confirmation: foodRunId,
  actor: "fixture-operator",
  reason: "Verify controlled publication.",
  gate3ApprovalId: null,
} as const;

describe("publication repository", () => {
  it("returns only an exact successful idempotent retry", async () => {
    const execute = vi.fn().mockResolvedValue({rows: [{
      action: "withdraw",
      outcome: "succeeded",
      request_hash: hash("1"),
      publication_id: publicationId,
      bundle_fingerprint: hash("f"),
    }]});
    await expect(readSuccessfulPublicationRetry({execute}, {
      action: "withdraw",
      idempotencyKey: request.idempotencyKey,
      requestHash: hash("1"),
    })).resolves.toEqual({publicationId, bundleFingerprint: hash("f")});

    await expect(readSuccessfulPublicationRetry({execute}, {
      action: "publish",
      idempotencyKey: request.idempotencyKey,
      requestHash: hash("1"),
    })).rejects.toThrowError(new PublicationOperationError("idempotency_key_reused"));
  });

  it("reads candidate reconciliation evidence through parameterized queries", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({rows: [{
        food_run_id: foodRunId,
        food_status: "validated",
        food_output_hash: hash("a"),
        food_run_fingerprint: hash("b"),
        food_has_validation_result: true,
        equity_baseline_run_id: baselineRunId,
        equity_baseline_output_hash: hash("c"),
        baseline_status: "validated",
        baseline_output_hash: hash("c"),
        baseline_run_fingerprint: hash("d"),
        baseline_has_validation_result: true,
      }]})
      .mockResolvedValueOnce({rows: [{
        geography_id: "33333333-3333-4333-8333-333333333333",
        food_score_id: "44444444-4444-4444-8444-444444444444",
        food_run_id: foodRunId,
        equity_score_id: "55555555-5555-4555-8555-555555555555",
        equity_run_id: baselineRunId,
        food_pinned_equity_score_id: "55555555-5555-4555-8555-555555555555",
      }]})
      .mockResolvedValueOnce({rows: [{
        component_id: "66666666-6666-4666-8666-666666666666",
        run_id: baselineRunId,
        indicator_value_id: "77777777-7777-4777-8777-777777777777",
      }]})
      .mockResolvedValueOnce({rows: [{
        component_id: "88888888-8888-4888-8888-888888888888",
        run_id: foodRunId,
        access_metric_value_id: "99999999-9999-4999-8999-999999999999",
      }]})
      .mockResolvedValueOnce({rows: [{id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}]})
      .mockResolvedValueOnce({rows: [{id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"}]});

    await expect(readPublicationReconciliationEvidence({execute}, manifest())).resolves.toMatchObject({
      foodRun: {id: foodRunId, status: "validated"},
      equityBaselineRun: {id: baselineRunId, status: "validated"},
      requiredSnapshotIds: ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"],
      requiredResourceVersionIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"],
    });
    expect(execute).toHaveBeenCalledTimes(6);
  });

  it("invokes the single controlled publish operation with bound values", async () => {
    const execute = vi.fn().mockResolvedValue({rows: [{publication_id: publicationId}]});
    await expect(publishAtlasRelease(
      {execute},
      request,
      manifest(),
      {
        publicationId,
        auditEventId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        bundleFingerprint: hash("f"),
        publicationProcess: "mke-publication-cli",
        commandVersion: "1",
        gitCommit: "abc123",
        validationSummary: {scoreCount: 1},
        requestHash: hash("1"),
      },
    )).resolves.toEqual({publicationId, reused: false});
    expect(execute).toHaveBeenCalledOnce();
    expect(JSON.stringify(execute.mock.calls[0]?.[0])).not.toContain("postgresql://");
  });

  it("fails closed when the controlled operation returns no release", async () => {
    const execute = vi.fn().mockResolvedValue({rows: []});
    await expect(publishAtlasRelease(
      {execute},
      request,
      manifest(),
      {
        publicationId,
        auditEventId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        bundleFingerprint: hash("f"),
        publicationProcess: "mke-publication-cli",
        commandVersion: "1",
        gitCommit: "abc123",
        validationSummary: {scoreCount: 1},
        requestHash: hash("1"),
      },
    )).rejects.toThrowError(new PublicationOperationError("publish_failed"));
  });

  it("invokes the separate controlled withdrawal operation", async () => {
    const execute = vi.fn().mockResolvedValue({rows: [{publication_id: publicationId}]});
    await expect(withdrawAtlasRelease(
      {execute},
      {
        ...request,
        action: "withdraw",
        candidateFoodRunId: null,
        expectedCurrentPublicationId: publicationId,
        confirmation: publicationId,
      },
      {
        auditEventId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        requestHash: hash("1"),
      },
    )).resolves.toEqual({publicationId});
  });
});
