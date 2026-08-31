import "server-only";

import {
  opportunityFilterStateSchema,
  opportunityResponseSchema,
  type OpportunityAvailableResponse,
  type OpportunityFilterState,
  type OpportunityResponse,
} from "@mke/contracts";
import {
  loadOpportunity as loadOpportunityRepository,
  OpportunityDataIntegrityError,
  selectAtlasRun,
  type AtlasRunSelection,
  type SelectedAtlasRun,
} from "@mke/database/server";
import {connection} from "next/server";

type AnalysisEnvironment = Record<string, string | undefined>;

export type OpportunityLoadFailure = {
  scope: "opportunity";
  kind: "integrity" | "database";
  error: unknown;
};

type OpportunityLoader = (
  selectedRun: SelectedAtlasRun,
  filters: OpportunityFilterState,
  environment: AnalysisEnvironment,
) => Promise<OpportunityAvailableResponse>;

export type LoadOpportunityDependencies = {
  markRequestTime: () => Promise<void>;
  selectRun: (environment: AnalysisEnvironment) => Promise<AtlasRunSelection>;
  loadValidatedPreview: OpportunityLoader;
  loadImmutablePublished: OpportunityLoader;
  reportFailure: (failure: OpportunityLoadFailure) => void;
};

const loadFromRepository: OpportunityLoader = (selectedRun, filters, environment) => (
  loadOpportunityRepository(selectedRun, filters, environment)
);

const defaultDependencies: LoadOpportunityDependencies = {
  markRequestTime: connection,
  selectRun: (environment) => selectAtlasRun(environment),
  loadValidatedPreview: loadFromRepository,
  // MOO-768 may wrap this seam with an immutable publication-identity cache.
  // It intentionally performs no caching until a governed publication exists.
  loadImmutablePublished: loadFromRepository,
  reportFailure: () => undefined,
};

function sameRun(
  left: OpportunityAvailableResponse["run"],
  right: SelectedAtlasRun["run"],
): boolean {
  const leftVintages = Object.entries(left.dataVintages).sort(([a], [b]) => a.localeCompare(b));
  const rightVintages = Object.entries(right.dataVintages).sort(([a], [b]) => a.localeCompare(b));
  return left.id === right.id
    && left.methodologyVersion === right.methodologyVersion
    && left.equityBaselineMethodologyVersion === right.equityBaselineMethodologyVersion
    && left.completedAt === right.completedAt
    && JSON.stringify(leftVintages) === JSON.stringify(rightVintages);
}

export async function loadOpportunity(
  filtersInput: unknown,
  environment: AnalysisEnvironment = process.env,
  dependencies: LoadOpportunityDependencies = defaultDependencies,
): Promise<OpportunityResponse> {
  const filters = opportunityFilterStateSchema.safeParse(filtersInput);
  if (!filters.success) {
    return {state: "unavailable", reason: "invalid_filters"};
  }

  try {
    // Until MOO-768 provides an immutable published bundle, both public fail-closed
    // selection and validated preview stay outside prerendering and shared caches.
    await dependencies.markRequestTime();
    const selection = await dependencies.selectRun(environment);
    if (selection.state === "unavailable") {
      const unavailable = opportunityResponseSchema.safeParse(selection);
      return unavailable.success
        ? unavailable.data
        : {state: "unavailable", reason: "results_incomplete"};
    }

    const loader = selection.mode === "published"
      ? dependencies.loadImmutablePublished
      : dependencies.loadValidatedPreview;
    const repositoryResponse = await loader(selection, filters.data, environment);
    const response = opportunityResponseSchema.safeParse(repositoryResponse);

    if (
      !response.success
      || response.data.state !== "available"
      || response.data.mode !== selection.mode
      || !sameRun(response.data.run, selection.run)
      || JSON.stringify(response.data.filters) !== JSON.stringify(filters.data)
    ) {
      dependencies.reportFailure({
        scope: "opportunity",
        kind: "integrity",
        error: response.success ? new Error("opportunity_selection_mismatch") : response.error,
      });
      return {state: "unavailable", reason: "results_incomplete"};
    }

    return response.data;
  } catch (error) {
    dependencies.reportFailure({
      scope: "opportunity",
      kind: error instanceof OpportunityDataIntegrityError ? "integrity" : "database",
      error,
    });
    return {state: "unavailable", reason: "results_incomplete"};
  }
}
