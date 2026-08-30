import "server-only";

import {
  atlasSearchQuerySchema,
  atlasSearchResponseSchema,
  type AtlasSearchAvailableResponse,
  type AtlasSearchResponse,
} from "@mke/contracts";
import {
  loadAtlasSearchResults,
  selectAtlasRun,
  type AtlasRunSelection,
  type SelectedAtlasRun,
} from "@mke/database/server";

type AtlasEnvironment = Record<string, string | undefined>;

export type LoadAtlasSearchDependencies = {
  selectRun: (environment: AtlasEnvironment) => Promise<AtlasRunSelection>;
  search: (
    selectedRun: SelectedAtlasRun,
    query: string,
    environment: AtlasEnvironment,
  ) => Promise<AtlasSearchAvailableResponse>;
};

const defaultDependencies: LoadAtlasSearchDependencies = {
  selectRun: (environment) => selectAtlasRun(environment),
  search: (selectedRun, query, environment) => loadAtlasSearchResults(
    selectedRun,
    query,
    environment,
  ),
};

export async function loadAtlasSearch(
  query: string,
  environment: AtlasEnvironment = process.env,
  dependencies: LoadAtlasSearchDependencies = defaultDependencies,
): Promise<AtlasSearchResponse> {
  const parsedQuery = atlasSearchQuerySchema.safeParse(query);
  if (!parsedQuery.success) {
    return {state: "unavailable", reason: "invalid_query"};
  }
  try {
    const selection = await dependencies.selectRun(environment);
    if (selection.state === "unavailable") {
      return atlasSearchResponseSchema.parse(selection);
    }
    const response = await dependencies.search(selection, parsedQuery.data, environment);
    return atlasSearchResponseSchema.parse(response);
  } catch {
    return {state: "unavailable", reason: "search_incomplete"};
  }
}
