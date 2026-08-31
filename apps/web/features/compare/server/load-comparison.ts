import "server-only";

import {
  compareRequestSchema,
  compareResponseSchema,
  type CompareAvailableResponse,
  type CompareResponse,
} from "@mke/contracts";
import {
  ComparisonDataIntegrityError,
  loadComparison as loadComparisonRepository,
  selectAtlasRun,
  type AtlasRunSelection,
  type SelectedAtlasRun,
} from "@mke/database/server";
import {connection} from "next/server";

type AnalysisEnvironment = Record<string, string | undefined>;

export type AnalysisLoadFailure = {
  scope: "compare";
  kind: "unavailable_tract" | "integrity" | "database";
  error: unknown;
};

type ComparisonLoader = (
  selectedRun: SelectedAtlasRun,
  tracts: ReadonlyArray<string>,
  environment: AnalysisEnvironment,
) => Promise<CompareAvailableResponse>;

export type LoadComparisonDependencies = {
  markRequestTime: () => Promise<void>;
  selectRun: (environment: AnalysisEnvironment) => Promise<AtlasRunSelection>;
  loadValidatedPreview: ComparisonLoader;
  loadImmutablePublished: ComparisonLoader;
  reportFailure: (failure: AnalysisLoadFailure) => void;
};

const loadFromRepository: ComparisonLoader = (selectedRun, tracts, environment) => (
  loadComparisonRepository(selectedRun, tracts, environment)
);

const defaultDependencies: LoadComparisonDependencies = {
  markRequestTime: connection,
  selectRun: (environment) => selectAtlasRun(environment),
  loadValidatedPreview: loadFromRepository,
  // MOO-768 may wrap this seam with an immutable publication-identity cache.
  // It intentionally performs no caching until a governed publication exists.
  loadImmutablePublished: loadFromRepository,
  reportFailure: () => undefined,
};

function sameRun(
  left: CompareAvailableResponse["run"],
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

function isUnknownTract(error: ComparisonDataIntegrityError): boolean {
  return error.message === "comparison_requested_tract_unavailable";
}

export async function loadComparison(
  tractsInput: unknown,
  environment: AnalysisEnvironment = process.env,
  dependencies: LoadComparisonDependencies = defaultDependencies,
): Promise<CompareResponse> {
  const request = compareRequestSchema.safeParse({tracts: tractsInput});
  if (!request.success) {
    return {state: "unavailable", reason: "invalid_request"};
  }

  try {
    // Until MOO-768 provides an immutable published bundle, both public fail-closed
    // selection and validated preview stay outside prerendering and shared caches.
    await dependencies.markRequestTime();
    const selection = await dependencies.selectRun(environment);
    if (selection.state === "unavailable") {
      const unavailable = compareResponseSchema.safeParse(selection);
      return unavailable.success
        ? unavailable.data
        : {state: "unavailable", reason: "comparison_incomplete"};
    }

    const loader = selection.mode === "published"
      ? dependencies.loadImmutablePublished
      : dependencies.loadValidatedPreview;
    const repositoryResponse = await loader(selection, request.data.tracts, environment);
    const response = compareResponseSchema.safeParse(repositoryResponse);

    if (
      !response.success
      || response.data.state !== "available"
      || response.data.mode !== selection.mode
      || !sameRun(response.data.run, selection.run)
      || response.data.request.tracts.some(
        (geoid, index) => geoid !== request.data.tracts[index],
      )
    ) {
      dependencies.reportFailure({
        scope: "compare",
        kind: "integrity",
        error: response.success ? new Error("comparison_selection_mismatch") : response.error,
      });
      return {state: "unavailable", reason: "comparison_incomplete"};
    }

    return response.data;
  } catch (error) {
    if (error instanceof ComparisonDataIntegrityError && isUnknownTract(error)) {
      dependencies.reportFailure({scope: "compare", kind: "unavailable_tract", error});
      return {state: "unavailable", reason: "unknown_tract"};
    }

    dependencies.reportFailure({
      scope: "compare",
      kind: error instanceof ComparisonDataIntegrityError ? "integrity" : "database",
      error,
    });
    return {state: "unavailable", reason: "comparison_incomplete"};
  }
}
