import "server-only";

import type {
  AtlasResponse,
  AtlasRunSummary,
  AtlasTractFeatureCollection,
  OpportunityFilterState,
  OpportunityResponse,
} from "@mke/contracts";

import {loadAtlas} from "../../atlas/server/load-atlas";
import {loadOpportunity} from "./load-opportunity";

type AnalysisEnvironment = Record<string, string | undefined>;

export type OpportunityWorkspaceLoadResult = {
  response: OpportunityResponse;
  tracts: AtlasTractFeatureCollection | null;
};

export type LoadOpportunityWorkspaceDependencies = {
  loadOpportunity: (
    filters: OpportunityFilterState,
    environment: AnalysisEnvironment,
  ) => Promise<OpportunityResponse>;
  loadAtlas: (environment: AnalysisEnvironment) => Promise<AtlasResponse>;
};

const defaultDependencies: LoadOpportunityWorkspaceDependencies = {
  loadOpportunity,
  loadAtlas,
};

function sameRun(left: AtlasRunSummary, right: AtlasRunSummary): boolean {
  const leftVintages = Object.entries(left.dataVintages).sort(([a], [b]) => a.localeCompare(b));
  const rightVintages = Object.entries(right.dataVintages).sort(([a], [b]) => a.localeCompare(b));
  return left.id === right.id
    && left.methodologyVersion === right.methodologyVersion
    && left.equityBaselineMethodologyVersion === right.equityBaselineMethodologyVersion
    && left.completedAt === right.completedAt
    && JSON.stringify(leftVintages) === JSON.stringify(rightVintages);
}

function geometryMatchesOpportunity(
  atlas: Extract<AtlasResponse, {state: "available"}>,
  opportunity: Extract<OpportunityResponse, {state: "available"}>,
): boolean {
  if (atlas.mode !== opportunity.mode || !sameRun(atlas.run, opportunity.run)) {
    return false;
  }
  const featuresByGeoid = new Map(
    atlas.tracts.features.map((feature) => [feature.properties.geoid, feature]),
  );
  return opportunity.matchingAreas.every((area) => {
    const feature = featuresByGeoid.get(area.tract.geoid);
    return feature !== undefined
      && JSON.stringify(feature.properties) === JSON.stringify(area.tract);
  });
}

export async function loadOpportunityWorkspace(
  filters: OpportunityFilterState,
  environment: AnalysisEnvironment = process.env,
  dependencies: LoadOpportunityWorkspaceDependencies = defaultDependencies,
): Promise<OpportunityWorkspaceLoadResult> {
  const [response, atlas] = await Promise.all([
    dependencies.loadOpportunity(filters, environment),
    dependencies.loadAtlas(environment),
  ]);

  if (response.state === "unavailable") {
    return {response, tracts: null};
  }
  if (atlas.state === "unavailable" || !geometryMatchesOpportunity(atlas, response)) {
    return {
      response: {state: "unavailable", reason: "results_incomplete"},
      tracts: null,
    };
  }
  return {response, tracts: atlas.tracts};
}
