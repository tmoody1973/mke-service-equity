import type {AtlasPublicationManifest} from "@mke/contracts";

type RunEvidence = {
  id: string;
  status: string;
  outputHash: string;
  runFingerprint: string;
  hasValidationResult: boolean;
};

export type PublicationReconciliationEvidence = {
  foodRun: RunEvidence & {
    equityBaselineRunId: string;
    equityBaselineOutputHash: string;
  };
  equityBaselineRun: RunEvidence;
  scores: ReadonlyArray<{
    geographyId: string;
    foodScoreId: string;
    foodRunId: string;
    equityScoreId: string;
    equityRunId: string;
    foodPinnedEquityScoreId: string;
  }>;
  equityComponents: ReadonlyArray<{
    componentId: string;
    runId: string;
    indicatorValueId: string;
  }>;
  foodComponents: ReadonlyArray<{
    componentId: string;
    runId: string;
    accessMetricValueId: string;
  }>;
  requiredSnapshotIds: ReadonlyArray<string>;
  requiredResourceVersionIds: ReadonlyArray<string>;
};

export class PublicationReconciliationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PublicationReconciliationError";
  }
}

function canonical(values: ReadonlyArray<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function equalSet(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  const leftValues = canonical(left);
  const rightValues = canonical(right);
  return leftValues.length === rightValues.length
    && leftValues.every((value, index) => value === rightValues[index]);
}

export function reconcilePublicationManifest(
  manifest: AtlasPublicationManifest,
  evidence: PublicationReconciliationEvidence,
) {
  if (
    evidence.foodRun.id !== manifest.foodRun.id
    || evidence.foodRun.status !== "validated"
    || !evidence.foodRun.hasValidationResult
    || evidence.foodRun.outputHash !== manifest.foodRun.outputHash
    || evidence.foodRun.runFingerprint !== manifest.foodRun.runFingerprint
  ) {
    throw new PublicationReconciliationError("food_output_hash_mismatch");
  }
  if (
    evidence.equityBaselineRun.id !== manifest.equityBaselineRun.id
    || !["validated", "published"].includes(evidence.equityBaselineRun.status)
    || !evidence.equityBaselineRun.hasValidationResult
    || evidence.equityBaselineRun.outputHash !== manifest.equityBaselineRun.outputHash
    || evidence.equityBaselineRun.runFingerprint !== manifest.equityBaselineRun.runFingerprint
    || evidence.foodRun.equityBaselineRunId !== evidence.equityBaselineRun.id
    || evidence.foodRun.equityBaselineOutputHash !== evidence.equityBaselineRun.outputHash
  ) {
    throw new PublicationReconciliationError("baseline_pin_mismatch");
  }

  const scoreEvidence = new Map(evidence.scores.map((row) => [row.geographyId, row]));
  if (
    scoreEvidence.size !== manifest.scoreMembers.length
    || manifest.scoreMembers.some((member) => {
      const row = scoreEvidence.get(member.geographyId);
      return !row
        || row.foodScoreId !== member.foodScoreId
        || row.equityScoreId !== member.equityScoreId
        || row.foodRunId !== manifest.foodRun.id
        || row.equityRunId !== manifest.equityBaselineRun.id
        || row.foodPinnedEquityScoreId !== member.equityScoreId;
    })
  ) {
    throw new PublicationReconciliationError("score_membership_mismatch");
  }

  const equityComponents = new Map(
    evidence.equityComponents.map((row) => [row.componentId, row]),
  );
  const foodComponents = new Map(
    evidence.foodComponents.map((row) => [row.componentId, row]),
  );
  if (
    equityComponents.size !== manifest.equityComponentMembers.length
    || foodComponents.size !== manifest.foodComponentMembers.length
    || manifest.equityComponentMembers.some((member) => {
      const row = equityComponents.get(member.componentId);
      return !row
        || row.runId !== manifest.equityBaselineRun.id
        || row.indicatorValueId !== member.indicatorValueId;
    })
    || manifest.foodComponentMembers.some((member) => {
      const row = foodComponents.get(member.componentId);
      return !row
        || row.runId !== manifest.foodRun.id
        || row.accessMetricValueId !== member.accessMetricValueId;
    })
  ) {
    throw new PublicationReconciliationError("component_membership_mismatch");
  }

  if (!equalSet(
    manifest.sourceSnapshotMembers.map((member) => member.snapshotId),
    evidence.requiredSnapshotIds,
  )) {
    throw new PublicationReconciliationError("snapshot_membership_mismatch");
  }
  if (!equalSet(
    manifest.resourceVersionMembers.map((member) => member.resourceVersionId),
    evidence.requiredResourceVersionIds,
  )) {
    throw new PublicationReconciliationError("resource_membership_mismatch");
  }

  return {
    scoreCount: manifest.scoreMembers.length,
    equityComponentCount: manifest.equityComponentMembers.length,
    foodComponentCount: manifest.foodComponentMembers.length,
    sourceSnapshotCount: manifest.sourceSnapshotMembers.length,
    resourceVersionCount: manifest.resourceVersionMembers.length,
  };
}
