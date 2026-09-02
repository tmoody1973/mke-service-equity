import {beforeEach, describe, expect, it, vi} from "vitest";

import {loadTractEvidenceCsv} from "../../../../features/data/server/load-tract-export";
import {
  createTractEvidenceCsvFilename,
  serializeTractEvidenceCsv,
} from "../../../../features/data/server/serialize-tract-csv";
import {GET} from "./route";

vi.mock("../../../../features/data/server/load-tract-export", () => ({
  loadTractEvidenceCsv: vi.fn(),
}));

vi.mock("../../../../features/data/server/serialize-tract-csv", () => ({
  createTractEvidenceCsvFilename: vi.fn(),
  serializeTractEvidenceCsv: vi.fn(),
}));

const loadTractEvidenceCsvMock = vi.mocked(loadTractEvidenceCsv);
const createTractEvidenceCsvFilenameMock = vi.mocked(createTractEvidenceCsvFilename);
const serializeTractEvidenceCsvMock = vi.mocked(serializeTractEvidenceCsv);

describe("GET /api/exports/tract-evidence.csv", () => {
  beforeEach(() => {
    loadTractEvidenceCsvMock.mockReset();
    createTractEvidenceCsvFilenameMock.mockReset();
    serializeTractEvidenceCsvMock.mockReset();
  });

  it("returns a safe deterministic CSV attachment only for the public export", async () => {
    loadTractEvidenceCsvMock.mockResolvedValue({
      state: "available",
      data: {
        publication: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          publishedAt: "2026-09-02T12:00:00.000Z",
        },
      },
    } as never);
    createTractEvidenceCsvFilenameMock.mockReturnValue(
      "mke-service-equity-tract-evidence-2026-09-02-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.csv",
    );
    serializeTractEvidenceCsvMock.mockReturnValue("geoid\r\n55079000101\r\n");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="mke-service-equity-tract-evidence-2026-09-02-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.csv"',
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it.each([
    ["no public release", "no_published_run", 404],
    ["preview-only data", "preview_not_allowed", 404],
    ["inconsistent release", "data_incomplete", 503],
    ["operational failure", "export_unavailable", 503],
  ] as const)("returns a small JSON error for %s", async (_name, reason, status) => {
    loadTractEvidenceCsvMock.mockResolvedValue({state: "unavailable", reason});

    const response = await GET();

    expect(response.status).toBe(status);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toBeNull();
    await expect(response.json()).resolves.toEqual({state: "unavailable", reason});
  });
});
