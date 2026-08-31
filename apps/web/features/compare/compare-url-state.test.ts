import {describe, expect, it} from "vitest";
import {
  buildCompareSearchParams,
  parseCompareUrlState,
} from "./compare-url-state";

describe("parseCompareUrlState", () => {
  it("preserves first-selected order for two to five repeated tract parameters", () => {
    const result = parseCompareUrlState(new URLSearchParams(
      "tract=55079000300&tract=55079000101&tract=55079000200",
    ));

    expect(result).toMatchObject({
      state: "ready",
      value: {tracts: ["55079000300", "55079000101", "55079000200"]},
      needsCanonicalization: false,
    });
  });

  it.each([
    ["", "no_tracts", []],
    ["tract=55079000101", "needs_one_more", ["55079000101"]],
  ] as const)("returns a recoverable setup state for %s", (query, reason, tracts) => {
    expect(parseCompareUrlState(new URLSearchParams(query))).toMatchObject({
      state: "setup",
      reason,
      value: {tracts},
    });
  });

  it.each([
    [
      "tract=55079000101&tract=55079000101",
      "duplicate_tract",
    ],
    [
      "tract=55079000101&tract=not-a-tract",
      "invalid_tract",
    ],
    [
      "tract=55079000101&tract=55079000200&tract=55079000300&tract=55079000400&tract=55079000500&tract=55079000600",
      "too_many_tracts",
    ],
  ] as const)("rejects the whole comparison for %s", (query, reason) => {
    const result = parseCompareUrlState(new URLSearchParams(`utm_source=partner&${query}`));

    expect(result).toMatchObject({state: "invalid", reason});
    expect(result.canonicalSearchParams.toString()).toBe("utm_source=partner");
  });
});

describe("buildCompareSearchParams", () => {
  it("writes repeated tracts in selected order and preserves unrelated parameters", () => {
    const result = buildCompareSearchParams(
      new URLSearchParams("utm_source=partner&tract=bad&campaign=spring"),
      {tracts: ["55079000300", "55079000101"]},
    );

    expect(result.toString()).toBe(
      "utm_source=partner&campaign=spring&tract=55079000300&tract=55079000101",
    );
  });

  it("throws rather than writing duplicate or malformed state", () => {
    expect(() => buildCompareSearchParams(
      new URLSearchParams(),
      {tracts: ["55079000101", "55079000101"]},
    )).toThrow("Invalid Compare URL state");
  });
});
