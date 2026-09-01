import {describe, expect, it} from "vitest";
import {
  buildPublicationDryRunHash,
  parsePublicationDryRunRequest,
  PublicationCommandError,
  verifyPublicationDryRunHash,
  validatePublicationCommandEnvironment,
} from "../src/publication/command";

const hash = "a".repeat(64);
const request = {
  action: "publish",
  environment: "development",
  candidateFoodRunId: "11111111-1111-4111-8111-111111111111",
  expectedCurrentPublicationId: null,
  approvalId: "MOO-768-fixture",
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
  dryRunHash: hash,
  confirmation: "11111111-1111-4111-8111-111111111111",
  actor: "fixture-operator",
  reason: "Verify controlled publication.",
  gate3ApprovalId: null,
} as const;

describe("publication command environment", () => {
  it("accepts an exact development-only host guard", () => {
    expect(validatePublicationCommandEnvironment(request, {
      DATABASE_URL_UNPOOLED: "postgresql://user:secret@ep-fixture.example.test/neondb",
      MKE_PIPELINE_ENV: "development",
      MKE_PUBLICATION_ENV: "development",
      MKE_PUBLICATION_EXPECTED_HOST: "ep-fixture.example.test",
    })).toEqual({
      databaseUrl: "postgresql://user:secret@ep-fixture.example.test/neondb",
      databaseHost: "ep-fixture.example.test",
      environment: "development",
    });
  });

  it.each([
    ["environment_mismatch", {MKE_PUBLICATION_ENV: "production"}],
    ["pipeline_environment_mismatch", {MKE_PIPELINE_ENV: "production"}],
    ["database_host_mismatch", {MKE_PUBLICATION_EXPECTED_HOST: "production.example.test"}],
  ] as const)("fails closed with %s", (code, override) => {
    expect(() => validatePublicationCommandEnvironment(request, {
      DATABASE_URL_UNPOOLED: "postgresql://user:secret@ep-fixture.example.test/neondb",
      MKE_PIPELINE_ENV: "development",
      MKE_PUBLICATION_ENV: "development",
      MKE_PUBLICATION_EXPECTED_HOST: "ep-fixture.example.test",
      ...override,
    })).toThrowError(new PublicationCommandError(code));
  });

  it("requires matching Gate 3 evidence for production", () => {
    const productionRequest = {
      ...request,
      environment: "production",
      gate3ApprovalId: "GATE-3-EXACT",
    } as const;
    expect(() => validatePublicationCommandEnvironment(productionRequest, {
      DATABASE_URL_UNPOOLED: "postgresql://operator:secret@production.example.test/neondb",
      MKE_PIPELINE_ENV: "production",
      MKE_PUBLICATION_ENV: "production",
      MKE_PUBLICATION_EXPECTED_HOST: "production.example.test",
      MKE_PUBLICATION_GATE3_APPROVAL_ID: "different",
    })).toThrowError(new PublicationCommandError("gate3_approval_mismatch"));
  });
});

describe("publication dry-run binding", () => {
  it("parses a dry-run request without accepting a caller-supplied hash", () => {
    const {dryRunHash: _dryRunHash, ...dryRunRequest} = request;
    void _dryRunHash;
    expect(parsePublicationDryRunRequest(dryRunRequest)).toEqual(dryRunRequest);
    expect(() => parsePublicationDryRunRequest(request)).toThrowError(
      new PublicationCommandError("dry_run_request_invalid"),
    );
  });

  it("creates one stable hash for canonical dry-run evidence", () => {
    const left = buildPublicationDryRunHash({
      databaseHost: "ep-fixture.example.test",
      validation: {scoreCount: 302, sourceSnapshotCount: 7},
      action: "publish",
    });
    const right = buildPublicationDryRunHash({
      action: "publish",
      validation: {sourceSnapshotCount: 7, scoreCount: 302},
      databaseHost: "ep-fixture.example.test",
    });
    expect(left).toMatch(/^[0-9a-f]{64}$/);
    expect(right).toBe(left);
  });

  it("rejects a write whose request does not match the dry-run evidence", () => {
    expect(() => verifyPublicationDryRunHash(request, "b".repeat(64))).toThrowError(
      new PublicationCommandError("dry_run_hash_mismatch"),
    );
  });
});
