import {
  atlasPublicationManifestSchema,
  type AtlasPublicationManifest,
} from "@mke/contracts";
import {createHash} from "node:crypto";

type ManifestInput = Omit<
  AtlasPublicationManifest,
  | "schemaVersion"
  | "scoreMembers"
  | "equityComponentMembers"
  | "foodComponentMembers"
  | "sourceSnapshotMembers"
  | "resourceVersionMembers"
> & {
  scoreMembers: ReadonlyArray<AtlasPublicationManifest["scoreMembers"][number]>;
  equityComponentMembers: ReadonlyArray<
    AtlasPublicationManifest["equityComponentMembers"][number]
  >;
  foodComponentMembers: ReadonlyArray<
    AtlasPublicationManifest["foodComponentMembers"][number]
  >;
  sourceSnapshotMembers: ReadonlyArray<
    AtlasPublicationManifest["sourceSnapshotMembers"][number]
  >;
  resourceVersionMembers: ReadonlyArray<
    AtlasPublicationManifest["resourceVersionMembers"][number]
  >;
};

function sorted<T>(values: ReadonlyArray<T>, key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right), "en"));
}

export function buildPublicationManifest(input: ManifestInput): AtlasPublicationManifest {
  return atlasPublicationManifestSchema.parse({
    schemaVersion: "atlas-publication-manifest-v1",
    foodRun: input.foodRun,
    equityBaselineRun: input.equityBaselineRun,
    scoreMembers: sorted(input.scoreMembers, (member) => member.geographyId),
    equityComponentMembers: sorted(
      input.equityComponentMembers,
      (member) => member.componentId,
    ),
    foodComponentMembers: sorted(
      input.foodComponentMembers,
      (member) => member.componentId,
    ),
    sourceSnapshotMembers: sorted(
      input.sourceSnapshotMembers,
      (member) => member.snapshotId,
    ),
    resourceVersionMembers: sorted(
      input.resourceVersionMembers,
      (member) => member.resourceVersionId,
    ),
  });
}

export function serializePublicationManifest(manifest: AtlasPublicationManifest): string {
  return JSON.stringify(atlasPublicationManifestSchema.parse(manifest));
}

export function fingerprintPublicationManifest(manifest: AtlasPublicationManifest): string {
  return createHash("sha256").update(serializePublicationManifest(manifest), "utf8").digest("hex");
}
