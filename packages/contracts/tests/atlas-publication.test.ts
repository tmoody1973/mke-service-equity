import {describe, expect, it} from "vitest";
import {
  atlasPublicationManifestSchema,
  currentAtlasPublicationSchema,
  publicationCommandRequestSchema,
} from "../src/atlas";

const hash = (character: string) => character.repeat(64);

function manifest() {
  return {
    schemaVersion: "atlas-publication-manifest-v1",
    foodRun: {
      id: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
      outputHash: hash("a"),
      runFingerprint: hash("b"),
    },
    equityBaselineRun: {
      id: "502e2a04-b013-53cd-8b09-c9144862701a",
      outputHash: hash("c"),
      runFingerprint: hash("d"),
    },
    scoreMembers: [{
      geographyId: "11111111-1111-4111-8111-111111111111",
      foodScoreId: "22222222-2222-4222-8222-222222222222",
      equityScoreId: "33333333-3333-4333-8333-333333333333",
    }],
    equityComponentMembers: [{
      componentId: "44444444-4444-4444-8444-444444444444",
      indicatorValueId: "55555555-5555-4555-8555-555555555555",
    }],
    foodComponentMembers: [{
      componentId: "66666666-6666-4666-8666-666666666666",
      accessMetricValueId: "77777777-7777-4777-8777-777777777777",
    }],
    sourceSnapshotMembers: [{
      snapshotId: "88888888-8888-4888-8888-888888888888",
      role: "food_scoring_input",
      redistributionDecision: "public_derived_results",
      termsUrl: "https://example.gov/terms",
      attribution: "Example public agency",
      warning: null,
    }],
    resourceVersionMembers: [{
      resourceVersionId: "99999999-9999-4999-8999-999999999999",
      role: "scoring_inventory",
      redistributionDecision: "internal_reproduction_only",
      termsUrl: null,
      attribution: "USDA Food and Nutrition Service",
      warning: null,
    }],
  } as const;
}

describe("atlasPublicationManifestSchema", () => {
  it("accepts an exact, deterministically ordered release manifest", () => {
    expect(atlasPublicationManifestSchema.parse(manifest())).toEqual(manifest());
  });

  it("rejects duplicate and unsorted release members", () => {
    const value = manifest();
    expect(atlasPublicationManifestSchema.safeParse({
      ...value,
      scoreMembers: [value.scoreMembers[0], value.scoreMembers[0]],
    }).success).toBe(false);

    expect(atlasPublicationManifestSchema.safeParse({
      ...value,
      sourceSnapshotMembers: [
        {...value.sourceSnapshotMembers[0], snapshotId: "99999999-9999-4999-8999-999999999999"},
        value.sourceSnapshotMembers[0],
      ],
    }).success).toBe(false);
  });

  it("requires terms and attribution for direct public display", () => {
    const value = manifest();
    expect(atlasPublicationManifestSchema.safeParse({
      ...value,
      resourceVersionMembers: [{
        ...value.resourceVersionMembers[0],
        role: "public_display",
        redistributionDecision: "public_direct_display",
        termsUrl: null,
        attribution: "",
      }],
    }).success).toBe(false);
  });

  it("rejects prohibited content assigned to a public role", () => {
    const value = manifest();
    expect(atlasPublicationManifestSchema.safeParse({
      ...value,
      resourceVersionMembers: [{
        ...value.resourceVersionMembers[0],
        role: "public_display",
        redistributionDecision: "prohibited_public_use",
      }],
    }).success).toBe(false);
  });

  it("rejects unknown fields and malformed hashes", () => {
    expect(atlasPublicationManifestSchema.safeParse({
      ...manifest(),
      rawDatabaseUrl: "postgresql://secret@example.test/db",
    }).success).toBe(false);
    expect(atlasPublicationManifestSchema.safeParse({
      ...manifest(),
      foodRun: {...manifest().foodRun, outputHash: "ABC"},
    }).success).toBe(false);
  });
});

describe("publicationCommandRequestSchema", () => {
  const request = {
    action: "publish",
    environment: "development",
    candidateFoodRunId: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
    expectedCurrentPublicationId: null,
    approvalId: "MOO-768-development-fixture",
    idempotencyKey: "12345678-1234-4234-8234-123456789abc",
    dryRunHash: hash("e"),
    confirmation: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
    actor: "fixture-operator",
    reason: "Verify the governed publication mechanism.",
    gate3ApprovalId: null,
  } as const;

  it("requires exact candidate confirmation for publish", () => {
    expect(publicationCommandRequestSchema.parse(request)).toEqual(request);
    expect(publicationCommandRequestSchema.safeParse({
      ...request,
      confirmation: "not-the-run-id",
    }).success).toBe(false);
  });

  it("requires Gate 3 evidence for production", () => {
    expect(publicationCommandRequestSchema.safeParse({
      ...request,
      environment: "production",
    }).success).toBe(false);
    expect(publicationCommandRequestSchema.safeParse({
      ...request,
      environment: "production",
      gate3ApprovalId: "GATE-3-2026-09-01",
    }).success).toBe(true);
  });

  it("requires current-release confirmation for withdrawal", () => {
    const currentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(publicationCommandRequestSchema.safeParse({
      ...request,
      action: "withdraw",
      candidateFoodRunId: null,
      expectedCurrentPublicationId: currentId,
      confirmation: currentId,
    }).success).toBe(true);
    expect(publicationCommandRequestSchema.safeParse({
      ...request,
      action: "withdraw",
      candidateFoodRunId: null,
      expectedCurrentPublicationId: null,
      confirmation: currentId,
    }).success).toBe(false);
  });
});

describe("currentAtlasPublicationSchema", () => {
  it("accepts only an immutable current publication identity", () => {
    expect(currentAtlasPublicationSchema.parse({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      publishedAt: "2026-09-01T12:00:00.000Z",
      bundleFingerprint: hash("f"),
    })).toEqual({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      publishedAt: "2026-09-01T12:00:00.000Z",
      bundleFingerprint: hash("f"),
    });
  });
});
