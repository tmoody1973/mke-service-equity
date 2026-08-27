import {describe, expect, it, vi} from "vitest";
import {checkDatabaseHealth, type DatabaseHealthClient} from "../src/health";

function queryResult(rows: Array<Record<string, unknown>>) {
  return Promise.resolve({rows});
}

describe("checkDatabaseHealth", () => {
  it("returns unconfigured without creating a client when DATABASE_URL is missing", async () => {
    const createClient = vi.fn();

    await expect(checkDatabaseHealth({}, createClient)).resolves.toEqual({
      status: "unconfigured",
      database: "unconfigured",
      postgisVersion: null,
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns unreachable when client initialization fails", async () => {
    const createClient = vi.fn(() => {
      throw new Error("sensitive initialization failure");
    });

    await expect(checkDatabaseHealth({DATABASE_URL: "postgresql://pooled.example/mke"}, createClient))
      .resolves.toEqual({status: "error", database: "unreachable", postgisVersion: null});
  });

  it("returns unreachable when the reachability query fails", async () => {
    const client: DatabaseHealthClient = {
      execute: vi.fn(() => Promise.reject(new Error("sensitive query failure"))),
    };

    await expect(checkDatabaseHealth(
      {DATABASE_URL: "postgresql://pooled.example/mke"},
      () => client,
    )).resolves.toEqual({status: "error", database: "unreachable", postgisVersion: null});
  });

  it("returns reachable error when the PostGIS query fails", async () => {
    const execute = vi.fn()
      .mockReturnValueOnce(queryResult([{database_name: "mke"}]))
      .mockRejectedValueOnce(new Error("PostGIS is unavailable"));

    await expect(checkDatabaseHealth(
      {DATABASE_URL: "postgresql://pooled.example/mke"},
      () => ({execute}),
    )).resolves.toEqual({status: "error", database: "reachable", postgisVersion: null});
  });

  it("returns reachable error when PostGIS has no non-empty version", async () => {
    const execute = vi.fn()
      .mockReturnValueOnce(queryResult([{database_name: "mke"}]))
      .mockReturnValueOnce(queryResult([{postgis_version: "  "}]));

    await expect(checkDatabaseHealth(
      {DATABASE_URL: "postgresql://pooled.example/mke"},
      () => ({execute}),
    )).resolves.toEqual({status: "error", database: "reachable", postgisVersion: null});
  });

  it("returns the non-empty PostGIS version after reachability succeeds", async () => {
    const execute = vi.fn()
      .mockReturnValueOnce(queryResult([{database_name: "mke"}]))
      .mockReturnValueOnce(queryResult([{postgis_version: "3.5.2"}]));

    await expect(checkDatabaseHealth(
      {DATABASE_URL: "postgresql://pooled.example/mke"},
      () => ({execute}),
    )).resolves.toEqual({
      status: "ok",
      database: "reachable",
      postgisVersion: "3.5.2",
    });
  });
});
