import {describe, expect, it, vi} from "vitest";
import type {TractEvidenceExport} from "@mke/contracts";
import {
  loadTractEvidenceCsv,
  loadTractEvidenceExportAvailability,
} from "./load-tract-export";

const selectedPublishedRun = {
  state: "selected" as const,
  mode: "published" as const,
  run: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    methodologyVersion: "food-equity-v1",
    equityBaselineMethodologyVersion: "equity-baseline-v1",
    completedAt: "2026-09-02T12:00:00.000Z",
    dataVintages: {food: "2024"},
    publication: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      publishedAt: "2026-09-02T12:00:00.000Z",
      bundleFingerprint: "a".repeat(64),
    },
  },
  equityBaselineRunId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  foodOutputHash: "b".repeat(64),
  equityBaselineOutputHash: "c".repeat(64),
};

const previewRun = {
  ...selectedPublishedRun,
  mode: "validated_preview" as const,
  run: {...selectedPublishedRun.run, publication: null},
};

const exportData = {
  schemaVersion: "mke-tract-evidence-csv-v1",
  publication: selectedPublishedRun.run.publication,
  foodRun: {
    id: selectedPublishedRun.run.id,
    methodologyVersion: selectedPublishedRun.run.methodologyVersion,
    outputHash: selectedPublishedRun.foodOutputHash,
    dataVintages: selectedPublishedRun.run.dataVintages,
  },
  equityBaselineRun: {
    id: selectedPublishedRun.equityBaselineRunId,
    methodologyVersion: selectedPublishedRun.run.equityBaselineMethodologyVersion,
    outputHash: selectedPublishedRun.equityBaselineOutputHash,
    dataVintages: {equity: "2024"},
  },
  sourceVersions: {},
  rows: [],
} as unknown as TractEvidenceExport;

describe("tract evidence export loader", () => {
  it("shows only the one current public release and keeps its identity", async () => {
    await expect(loadTractEvidenceExportAvailability({}, {
      selectRun: vi.fn().mockResolvedValue(selectedPublishedRun),
    })).resolves.toEqual({
      state: "available",
      publication: selectedPublishedRun.run.publication,
      tractCount: 302,
    });
  });

  it("does not offer a private validated preview", async () => {
    await expect(loadTractEvidenceExportAvailability({}, {
      selectRun: vi.fn().mockResolvedValue(previewRun),
    })).resolves.toEqual({state: "unavailable", reason: "preview_not_allowed"});
  });

  it("returns only a redacted unavailable state when selection or loading fails", async () => {
    await expect(loadTractEvidenceExportAvailability({}, {
      selectRun: vi.fn().mockRejectedValue(new Error("postgresql://secret@example.test/mke")),
    })).resolves.toEqual({state: "unavailable", reason: "export_unavailable"});
    await expect(loadTractEvidenceCsv({}, {
      selectRun: vi.fn().mockResolvedValue(selectedPublishedRun),
      loadExport: vi.fn().mockRejectedValue(new Error("postgresql://secret@example.test/mke")),
    })).resolves.toEqual({state: "unavailable", reason: "export_unavailable"});
  });

  it("loads the exact selected published run and no caller-chosen release", async () => {
    const loadExport = vi.fn().mockResolvedValue(exportData);
    await expect(loadTractEvidenceCsv({}, {
      selectRun: vi.fn().mockResolvedValue(selectedPublishedRun),
      loadExport,
    })).resolves.toEqual({state: "available", data: exportData});
    expect(loadExport).toHaveBeenCalledWith(selectedPublishedRun, {});
  });
});
