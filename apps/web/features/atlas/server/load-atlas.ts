import "server-only";

import {
  atlasResponseSchema,
  type AtlasResponse,
  type AtlasTractFeatureCollection,
} from "@mke/contracts";
import {
  loadAtlasTracts,
  selectAtlasRun,
  type AtlasRunSelection,
  type SelectedAtlasRun,
} from "@mke/database/server";

type AtlasEnvironment = Record<string, string | undefined>;

export type LoadAtlasDependencies = {
  selectRun: (environment: AtlasEnvironment) => Promise<AtlasRunSelection>;
  loadTracts: (
    selectedRun: SelectedAtlasRun,
    environment: AtlasEnvironment,
  ) => Promise<AtlasTractFeatureCollection>;
};

const defaultDependencies: LoadAtlasDependencies = {
  selectRun: (environment) => selectAtlasRun(environment),
  loadTracts: (selectedRun, environment) => loadAtlasTracts(selectedRun, environment),
};

export async function loadAtlas(
  environment: AtlasEnvironment = process.env,
  dependencies: LoadAtlasDependencies = defaultDependencies,
): Promise<AtlasResponse> {
  try {
    const selection = await dependencies.selectRun(environment);

    if (selection.state === "unavailable") {
      return atlasResponseSchema.parse(selection);
    }

    const tracts = await dependencies.loadTracts(selection, environment);
    const response = atlasResponseSchema.safeParse({
      state: "available",
      mode: selection.mode,
      run: selection.run,
      tracts,
    });

    if (!response.success) {
      return {state: "unavailable", reason: "data_incomplete"};
    }

    return response.data;
  } catch {
    return {state: "unavailable", reason: "data_incomplete"};
  }
}
