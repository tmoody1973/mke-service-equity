import {describe, expect, it} from "vitest";
import {databaseHealthResponseSchema} from "../src/database-health";

describe("databaseHealthResponseSchema", () => {
  it("accepts a reachable PostGIS response", () => {
    expect(databaseHealthResponseSchema.parse({
      status: "ok",
      database: "reachable",
      postgisVersion: "3.5",
    })).toEqual({status: "ok", database: "reachable", postgisVersion: "3.5"});
  });

  it("preserves an unconfigured database instead of treating it as reachable", () => {
    expect(databaseHealthResponseSchema.parse({
      status: "unconfigured",
      database: "unconfigured",
      postgisVersion: null,
    }).database).toBe("unconfigured");
  });

  it("rejects contradictory health states", () => {
    expect(() => databaseHealthResponseSchema.parse({
      status: "ok",
      database: "unreachable",
      postgisVersion: null,
    })).toThrow();
  });
});
