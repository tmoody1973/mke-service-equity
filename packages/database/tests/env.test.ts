import {describe, expect, it} from "vitest";
import {readMigrationDatabaseUrl, readRuntimeDatabaseUrl} from "../src/env";

describe("database URL selection", () => {
  it("rejects a missing server database URL", () => {
    expect(() => readRuntimeDatabaseUrl({})).toThrow("DATABASE_URL is required");
  });

  it("uses the pooled URL for runtime queries", () => {
    expect(readRuntimeDatabaseUrl({DATABASE_URL: "postgresql://pooled.example/mke"}))
      .toBe("postgresql://pooled.example/mke");
  });

  it("prefers the unpooled URL for migrations", () => {
    expect(readMigrationDatabaseUrl({
      DATABASE_URL: "postgresql://pooled.example/mke",
      DATABASE_URL_UNPOOLED: "postgresql://direct.example/mke",
    })).toBe("postgresql://direct.example/mke");
  });

  it("falls back to the pooled URL for migrations", () => {
    expect(readMigrationDatabaseUrl({DATABASE_URL: "postgresql://pooled.example/mke"}))
      .toBe("postgresql://pooled.example/mke");
  });

  it("rejects a non-PostgreSQL URL", () => {
    expect(() => readRuntimeDatabaseUrl({DATABASE_URL: "https://example.com/mke"}))
      .toThrow("DATABASE_URL must be a PostgreSQL URL");
  });
});
