import "server-only";

import type {AtlasMode, AtlasUnavailableReason} from "@mke/contracts";
import {
  selectAtlasRun,
  type AtlasRunSelection,
} from "@mke/database/server";
import {connection} from "next/server";

type AnalysisEnvironment = Record<string, string | undefined>;

export type AnalysisAvailability =
  | {state: "available"; mode: AtlasMode}
  | {state: "unavailable"; reason: AtlasUnavailableReason};

export type LoadAnalysisAvailabilityDependencies = {
  markRequestTime: () => Promise<void>;
  selectRun: (environment: AnalysisEnvironment) => Promise<AtlasRunSelection>;
};

const defaultDependencies: LoadAnalysisAvailabilityDependencies = {
  markRequestTime: connection,
  selectRun: (environment) => selectAtlasRun(environment),
};

export async function loadAnalysisAvailability(
  environment: AnalysisEnvironment = process.env,
  dependencies: LoadAnalysisAvailabilityDependencies = defaultDependencies,
): Promise<AnalysisAvailability> {
  try {
    await dependencies.markRequestTime();
    const selection = await dependencies.selectRun(environment);
    return selection.state === "selected"
      ? {state: "available", mode: selection.mode}
      : selection;
  } catch {
    return {state: "unavailable", reason: "data_incomplete"};
  }
}
