import "server-only";

import {
  atlasTractProfileResponseSchema,
  tractGeoidSchema,
  type AtlasTractProfile,
  type AtlasTractProfileResponse,
} from "@mke/contracts";
import {
  loadAtlasTractProfile,
  selectAtlasRun,
  type AtlasRunSelection,
  type SelectedAtlasRun,
} from "@mke/database/server";

type AtlasEnvironment = Record<string, string | undefined>;

export type LoadTractProfileDependencies = {
  selectRun: (environment: AtlasEnvironment) => Promise<AtlasRunSelection>;
  loadProfile: (
    selectedRun: SelectedAtlasRun,
    geoid: string,
    environment: AtlasEnvironment,
  ) => Promise<AtlasTractProfile>;
};

const defaultDependencies: LoadTractProfileDependencies = {
  selectRun: (environment) => selectAtlasRun(environment),
  loadProfile: (selectedRun, geoid, environment) => loadAtlasTractProfile(
    selectedRun,
    geoid,
    environment,
  ),
};

export async function loadTractProfile(
  geoid: string,
  environment: AtlasEnvironment = process.env,
  dependencies: LoadTractProfileDependencies = defaultDependencies,
): Promise<AtlasTractProfileResponse> {
  if (!tractGeoidSchema.safeParse(geoid).success) {
    return {state: "unavailable", reason: "invalid_tract"};
  }

  try {
    const selection = await dependencies.selectRun(environment);
    if (selection.state === "unavailable") {
      return atlasTractProfileResponseSchema.parse(selection);
    }

    const profile = await dependencies.loadProfile(selection, geoid, environment);
    if (profile.runId !== selection.run.id || profile.tract.geoid !== geoid) {
      return {state: "unavailable", reason: "profile_incomplete"};
    }

    const response = atlasTractProfileResponseSchema.safeParse({state: "available", profile});
    return response.success
      ? response.data
      : {state: "unavailable", reason: "profile_incomplete"};
  } catch {
    return {state: "unavailable", reason: "profile_incomplete"};
  }
}
