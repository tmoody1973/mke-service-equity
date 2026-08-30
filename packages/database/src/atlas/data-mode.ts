import type {AtlasUnavailableReason} from "@mke/contracts";

type AtlasEnvironment = Record<string, string | undefined>;

export type AtlasDataModeSelection =
  | {state: "allowed"; mode: "published"}
  | {state: "allowed"; mode: "validated_preview"; runId: string}
  | {state: "unavailable"; reason: AtlasUnavailableReason};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readAtlasDataMode(environment: AtlasEnvironment): AtlasDataModeSelection {
  const requestedMode = environment.MKE_ATLAS_DATA_MODE?.trim() || "published";

  if (requestedMode === "published") {
    return {state: "allowed", mode: "published"};
  }

  if (requestedMode !== "validated_preview") {
    return {state: "unavailable", reason: "preview_not_allowed"};
  }

  const runId = environment.MKE_ATLAS_PREVIEW_RUN_ID?.trim();
  const previewAllowed = environment.MKE_PIPELINE_ENV === "development"
    && environment.NODE_ENV !== "production"
    && environment.VERCEL_ENV !== "production"
    && Boolean(runId && uuidPattern.test(runId));

  if (!previewAllowed || !runId) {
    return {state: "unavailable", reason: "preview_not_allowed"};
  }

  return {state: "allowed", mode: "validated_preview", runId};
}
