import "server-only";

import {
  atlasFoodSitesLayerSchema,
  atlasResponseSchema,
  type AtlasFoodSitesLayerResponse,
  type AtlasResponse,
  type AtlasTractFeatureCollection,
} from "@mke/contracts";
import {
  loadAtlasTracts,
  selectAtlasRun,
  type AtlasRunSelection,
  type SelectedAtlasRun,
} from "@mke/database/server";
import foodSitesSnapshot from "../../../data/context/food-sites-2026.json";

type AtlasEnvironment = Record<string, string | undefined>;

export type LoadAtlasDependencies = {
  selectRun: (environment: AtlasEnvironment) => Promise<AtlasRunSelection>;
  loadTracts: (
    selectedRun: SelectedAtlasRun,
    environment: AtlasEnvironment,
  ) => Promise<AtlasTractFeatureCollection>;
  loadFoodSites: () => Promise<AtlasFoodSitesLayerResponse>;
};

export function loadApprovedFoodSitesSnapshot(): AtlasFoodSitesLayerResponse {
  const parsed = atlasFoodSitesLayerSchema.safeParse(foodSitesSnapshot);
  return parsed.success
    ? parsed.data
    : {state: "unavailable", reason: "snapshot_not_valid"};
}

const defaultDependencies: LoadAtlasDependencies = {
  selectRun: (environment) => selectAtlasRun(environment),
  loadTracts: (selectedRun, environment) => loadAtlasTracts(selectedRun, environment),
  loadFoodSites: () => Promise.resolve(loadApprovedFoodSitesSnapshot()),
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

    const [tracts, foodSites] = await Promise.all([
      dependencies.loadTracts(selection, environment),
      dependencies.loadFoodSites(),
    ]);
    const response = atlasResponseSchema.safeParse({
      state: "available",
      mode: selection.mode,
      run: selection.run,
      tracts,
      contextLayers: {foodSites},
    });

    if (!response.success) {
      return {state: "unavailable", reason: "data_incomplete"};
    }

    return response.data;
  } catch {
    return {state: "unavailable", reason: "data_incomplete"};
  }
}
