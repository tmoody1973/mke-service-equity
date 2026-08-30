import {describe, expect, it} from "vitest";
import {
  buildAtlasSearchParams,
  parseAtlasUrlState,
} from "./atlas-url-state";

const geoids = new Set(["55079000101", "55079187200", "55079990000"]);

describe("parseAtlasUrlState", () => {
  it("parses a valid tract, layer, and deduplicated priority filter", () => {
    expect(parseAtlasUrlState(
      new URLSearchParams("tract=55079000101&layer=food_equity_priority&priority=5,2,5"),
      geoids,
    )).toEqual({
      tract: "55079000101",
      layer: "food_equity_priority",
      priorities: [2, 5],
    });
  });

  it("normalizes unsupported or unavailable values without guessing", () => {
    expect(parseAtlasUrlState(
      new URLSearchParams("tract=55079099999&layer=latest&priority=0,2,6,bad"),
      geoids,
    )).toEqual({
      tract: null,
      layer: "food_equity_priority",
      priorities: [2],
    });
  });

  it("does not accept a syntactically valid tract outside the available bundle", () => {
    expect(parseAtlasUrlState(
      new URLSearchParams("tract=55079000200"),
      new Set(),
    ).tract).toBeNull();
  });
});

describe("buildAtlasSearchParams", () => {
  it("writes durable Atlas state while preserving unrelated parameters", () => {
    const result = buildAtlasSearchParams(
      new URLSearchParams("utm_source=partner&tract=bad&layer=bad&priority=9"),
      {tract: "55079000101", layer: "food_equity_priority", priorities: [5, 2]},
    );

    expect(result.toString()).toBe("utm_source=partner&tract=55079000101&priority=2%2C5");
  });

  it("omits default and empty Atlas values from a clean share URL", () => {
    const result = buildAtlasSearchParams(
      new URLSearchParams("tract=55079000101&layer=food_equity_priority&priority=1"),
      {tract: null, layer: "food_equity_priority", priorities: []},
    );

    expect(result.toString()).toBe("");
  });
});
