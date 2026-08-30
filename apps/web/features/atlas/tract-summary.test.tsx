// @vitest-environment jsdom

import type {AtlasTractProperties} from "@mke/contracts";
import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {explainTractSummary, TractSummary} from "./tract-summary";

const complete: AtlasTractProperties = {
  geoid: "55079000101",
  name: "Census Tract 1.01",
  population: 2_430,
  geographyVintage: "2020",
  foodEquityPriority: 1,
  foodAccessNeedBand: "very_high",
  equityBaselineBand: "high",
  qualityStatus: "complete",
  exclusionReasons: [],
};

describe("explainTractSummary", () => {
  it("explains a priority as a relative band combination, not a causal claim", () => {
    expect(explainTractSummary(complete)).toBe(
      "Priority 1 is based on two measures: Food Access Need is very high, and Equity Baseline is high. Priority 1 is the highest relative priority in this version.",
    );
  });

  it("explains the attributable insufficient state", () => {
    expect(explainTractSummary({
      ...complete,
      foodEquityPriority: null,
      foodAccessNeedBand: null,
      qualityStatus: "insufficient_data",
      exclusionReasons: ["origin_unsnapped"],
    })).toContain("Census population center could not be connected reliably");
  });

  it("does not confuse zero population with a zero score", () => {
    expect(explainTractSummary({
      ...complete,
      population: 0,
      foodEquityPriority: null,
      foodAccessNeedBand: null,
      equityBaselineBand: null,
      qualityStatus: "ineligible_zero_population",
      exclusionReasons: ["zero_population"],
    })).toContain("This is not a score of zero");
  });
});

describe("TractSummary", () => {
  it("renders selected tract identity, priority, bands, and population", () => {
    render(<TractSummary tract={complete} />);

    expect(screen.getByRole("heading", {name: "Census Tract 1.01"})).toBeInTheDocument();
    expect(screen.getByText("Priority 1")).toBeInTheDocument();
    expect(screen.getByText("Population 2,430")).toBeInTheDocument();
    expect(screen.getByText(/Food Access Need is very high/)).toBeInTheDocument();
  });
});
