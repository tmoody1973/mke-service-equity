import {describe, expect, it} from "vitest";
import {toUrlSearchParams} from "./next-search-params";

describe("toUrlSearchParams", () => {
  it("preserves repeated values and skips undefined entries", () => {
    expect(toUrlSearchParams({
      tract: ["55079000300", "55079000101"],
      unused: undefined,
      utm_source: "partner",
    }).toString()).toBe(
      "tract=55079000300&tract=55079000101&utm_source=partner",
    );
  });
});
