import {describe, expect, it} from "vitest";
import {
  buildPublicationManifest,
  fingerprintPublicationManifest,
} from "../src/publication/manifest";
import {
  PublicationReconciliationError,
  reconcilePublicationManifest,
} from "../src/publication/reconciliation";

const hash = (character: string) => character.repeat(64);
const ids = {
  foodRun: "11111111-1111-4111-8111-111111111111",
  equityRun: "22222222-2222-4222-8222-222222222222",
  geographyA: "33333333-3333-4333-8333-333333333331",
  geographyB: "33333333-3333-4333-8333-333333333332",
  foodScoreA: "44444444-4444-4444-8444-444444444441",
  foodScoreB: "44444444-4444-4444-8444-444444444442",
  equityScoreA: "55555555-5555-4555-8555-555555555551",
  equityScoreB: "55555555-5555-4555-8555-555555555552",
  equityComponent: "66666666-6666-4666-8666-666666666666",
  indicatorValue: "77777777-7777-4777-8777-777777777777",
  foodComponent: "88888888-8888-4888-8888-888888888888",
  metricValue: "99999999-9999-4999-8999-999999999999",
  snapshot: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  resource: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
} as const;

function input(reverse = false) {
  const scores = [
    {
      geographyId: ids.geographyA,
      foodScoreId: ids.foodScoreA,
      equityScoreId: ids.equityScoreA,
    },
    {
      geographyId: ids.geographyB,
      foodScoreId: ids.foodScoreB,
      equityScoreId: ids.equityScoreB,
    },
  ];
  return {
    foodRun: {id: ids.foodRun, outputHash: hash("a"), runFingerprint: hash("b")},
    equityBaselineRun: {id: ids.equityRun, outputHash: hash("c"), runFingerprint: hash("d")},
    scoreMembers: reverse ? scores.reverse() : scores,
    equityComponentMembers: [{
      componentId: ids.equityComponent,
      indicatorValueId: ids.indicatorValue,
    }],
    foodComponentMembers: [{
      componentId: ids.foodComponent,
      accessMetricValueId: ids.metricValue,
    }],
    sourceSnapshotMembers: [{
      snapshotId: ids.snapshot,
      role: "food_scoring_input",
      redistributionDecision: "public_derived_results",
      termsUrl: "https://example.gov/terms",
      attribution: "Example agency",
      warning: null,
    }],
    resourceVersionMembers: [{
      resourceVersionId: ids.resource,
      role: "scoring_inventory",
      redistributionDecision: "internal_reproduction_only",
      termsUrl: null,
      attribution: "USDA Food and Nutrition Service",
      warning: null,
    }],
  } as const;
}

function evidence() {
  return {
    foodRun: {
      id: ids.foodRun,
      status: "validated",
      outputHash: hash("a"),
      runFingerprint: hash("b"),
      equityBaselineRunId: ids.equityRun,
      equityBaselineOutputHash: hash("c"),
      hasValidationResult: true,
    },
    equityBaselineRun: {
      id: ids.equityRun,
      status: "validated",
      outputHash: hash("c"),
      runFingerprint: hash("d"),
      hasValidationResult: true,
    },
    scores: [
      {
        geographyId: ids.geographyA,
        foodScoreId: ids.foodScoreA,
        foodRunId: ids.foodRun,
        equityScoreId: ids.equityScoreA,
        equityRunId: ids.equityRun,
        foodPinnedEquityScoreId: ids.equityScoreA,
      },
      {
        geographyId: ids.geographyB,
        foodScoreId: ids.foodScoreB,
        foodRunId: ids.foodRun,
        equityScoreId: ids.equityScoreB,
        equityRunId: ids.equityRun,
        foodPinnedEquityScoreId: ids.equityScoreB,
      },
    ],
    equityComponents: [{
      componentId: ids.equityComponent,
      runId: ids.equityRun,
      indicatorValueId: ids.indicatorValue,
    }],
    foodComponents: [{
      componentId: ids.foodComponent,
      runId: ids.foodRun,
      accessMetricValueId: ids.metricValue,
    }],
    requiredSnapshotIds: [ids.snapshot],
    requiredResourceVersionIds: [ids.resource],
  } as const;
}

describe("publication manifest", () => {
  it("sorts exact members and produces stable canonical bytes and hash", () => {
    const first = buildPublicationManifest(input());
    const second = buildPublicationManifest(input(true));
    expect(second).toEqual(first);
    expect(fingerprintPublicationManifest(second)).toBe(
      fingerprintPublicationManifest(first),
    );
    expect(first.scoreMembers.map((member) => member.geographyId)).toEqual([
      ids.geographyA,
      ids.geographyB,
    ]);
  });

  it("rejects duplicate exact members", () => {
    expect(() => buildPublicationManifest({
      ...input(),
      scoreMembers: [input().scoreMembers[0]!, input().scoreMembers[0]!],
    })).toThrow();
  });
});

describe("reconcilePublicationManifest", () => {
  it("proves exact run pins and member lineage", () => {
    expect(reconcilePublicationManifest(
      buildPublicationManifest(input()),
      evidence(),
    )).toEqual({
      scoreCount: 2,
      equityComponentCount: 1,
      foodComponentCount: 1,
      sourceSnapshotCount: 1,
      resourceVersionCount: 1,
    });
  });

  it.each([
    ["food_output_hash_mismatch", {foodRun: {...evidence().foodRun, outputHash: hash("f")}}],
    ["baseline_pin_mismatch", {
      foodRun: {...evidence().foodRun, equityBaselineOutputHash: hash("f")},
    }],
    ["score_membership_mismatch", {scores: evidence().scores.slice(0, 1)}],
    ["component_membership_mismatch", {foodComponents: []}],
    ["snapshot_membership_mismatch", {requiredSnapshotIds: []}],
    ["resource_membership_mismatch", {requiredResourceVersionIds: []}],
  ] as const)("fails closed with %s", (code, override) => {
    expect(() => reconcilePublicationManifest(
      buildPublicationManifest(input()),
      {...evidence(), ...override},
    )).toThrowError(new PublicationReconciliationError(code));
  });
});
