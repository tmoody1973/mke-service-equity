import "server-only";

import {
  tractEvidenceExportAvailabilitySchema,
  type TractEvidenceExport,
  type TractEvidenceExportAvailability,
} from "@mke/contracts";
import {
  loadTractEvidenceExport,
  selectAtlasRun,
  type AtlasRunSelection,
  type SelectedAtlasRun,
} from "@mke/database/server";

type AtlasEnvironment = Record<string, string | undefined>;

export type TractEvidenceCsvLoadResult =
  | {state: "available"; data: TractEvidenceExport}
  | {state: "unavailable"; reason: "no_published_run" | "preview_not_allowed" | "data_incomplete" | "export_unavailable"};

type AvailabilityDependencies = {
  selectRun: (environment: AtlasEnvironment) => Promise<AtlasRunSelection>;
};

type CsvDependencies = AvailabilityDependencies & {
  loadExport: (selectedRun: SelectedAtlasRun, environment: AtlasEnvironment) => Promise<TractEvidenceExport>;
};

const availabilityDependencies: AvailabilityDependencies = {
  selectRun: (environment) => selectAtlasRun(environment),
};

const csvDependencies: CsvDependencies = {
  ...availabilityDependencies,
  loadExport: (selectedRun, environment) => loadTractEvidenceExport(selectedRun, environment),
};

function unavailableFromSelection(selection: AtlasRunSelection): TractEvidenceCsvLoadResult {
  if (selection.state === "selected" && selection.mode === "validated_preview") {
    return {state: "unavailable", reason: "preview_not_allowed"};
  }
  if (selection.state === "unavailable" && selection.reason === "no_published_run") {
    return {state: "unavailable", reason: "no_published_run"};
  }
  return {state: "unavailable", reason: "data_incomplete"};
}

export async function loadTractEvidenceExportAvailability(
  environment: AtlasEnvironment = process.env,
  dependencies: AvailabilityDependencies = availabilityDependencies,
): Promise<TractEvidenceExportAvailability> {
  try {
    const selection = await dependencies.selectRun(environment);
    if (selection.state !== "selected" || selection.mode !== "published" || selection.run.publication === null) {
      const unavailable = unavailableFromSelection(selection);
      return tractEvidenceExportAvailabilitySchema.parse(unavailable);
    }
    return tractEvidenceExportAvailabilitySchema.parse({
      state: "available",
      publication: selection.run.publication,
      tractCount: 302,
    });
  } catch {
    return {state: "unavailable", reason: "export_unavailable"};
  }
}

export async function loadTractEvidenceCsv(
  environment: AtlasEnvironment = process.env,
  dependencies: CsvDependencies = csvDependencies,
): Promise<TractEvidenceCsvLoadResult> {
  try {
    const selection = await dependencies.selectRun(environment);
    if (selection.state !== "selected" || selection.mode !== "published" || selection.run.publication === null) {
      return unavailableFromSelection(selection);
    }
    const data = await dependencies.loadExport(selection, environment);
    if (data.publication.id !== selection.run.publication.id) {
      return {state: "unavailable", reason: "data_incomplete"};
    }
    return {state: "available", data};
  } catch {
    return {state: "unavailable", reason: "export_unavailable"};
  }
}
