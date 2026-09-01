import {mkdtemp, readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {
  redactPublicationReport,
  writePublicationReport,
} from "../src/publication/report";

describe("publication reports", () => {
  it("redacts database URLs and credential-like fields recursively", () => {
    expect(redactPublicationReport({
      status: "failed",
      databaseUrl: "postgresql://user:secret@example.test/neondb",
      nested: {apiKey: "secret-value", reason: "safe_failure_code"},
    })).toEqual({
      status: "failed",
      databaseUrl: "[REDACTED]",
      nested: {apiKey: "[REDACTED]", reason: "safe_failure_code"},
    });
  });

  it("writes canonical ignored reports without credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "mke-publication-report-"));
    const path = await writePublicationReport(
      {
        action: "dry_run",
        status: "succeeded",
        databaseHost: "ep-fixture.example.test",
        validation: {scoreCount: 302},
      },
      root,
      new Date("2026-09-01T12:00:00.000Z"),
    );
    const content = await readFile(path, "utf8");
    expect(JSON.parse(content)).toEqual({
      action: "dry_run",
      databaseHost: "ep-fixture.example.test",
      status: "succeeded",
      validation: {scoreCount: 302},
    });
    expect(content.endsWith("\n")).toBe(true);
  });
});
