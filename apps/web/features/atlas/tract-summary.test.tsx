// @vitest-environment jsdom

import type {AtlasTractProperties} from "@mke/contracts";
import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import {
  explainEquityBaselineBand,
  explainPriorityLevel,
  explainTractSummary,
  TractSummary,
} from "./tract-summary";

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
      "Priority 1 is based on two measures: Food Access Need is very high, and Equity Baseline is high. Priority 1 means the strongest overlap of food-access need and other measured barriers.",
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

describe("explainPriorityLevel", () => {
  it("defines all five levels as relative overlap, not an automatic decision", () => {
    expect(explainPriorityLevel(1)).toContain("strongest overlap");
    expect(explainPriorityLevel(2)).toContain("strong overlap");
    expect(explainPriorityLevel(3)).toContain("middle or mixed overlap");
    expect(explainPriorityLevel(4)).toContain("smaller overlap");
    expect(explainPriorityLevel(5)).toContain("weakest overlap");
  });
});

describe("explainEquityBaselineBand", () => {
  it("defines high and low as county comparisons of measured barriers", () => {
    expect(explainEquityBaselineBand("high")).toContain("more barriers here");
    expect(explainEquityBaselineBand("low")).toContain("fewer barriers here");
  });
});

describe("TractSummary", () => {
  it("renders selected tract identity, priority, bands, and population", () => {
    render(<TractSummary tract={complete} />);

    expect(screen.getByRole("heading", {name: "Census Tract 1.01"})).toBeInTheDocument();
    expect(screen.getByText("Priority 1")).toBeInTheDocument();
    expect(screen.getByText("Population 2,430")).toBeInTheDocument();
    expect(screen.getByText(/Food Access Need is very high/)).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "How to read Equity Baseline"})).toBeInTheDocument();
    expect(screen.getByText(/income and housing costs, education and jobs/i)).toBeInTheDocument();
    expect(screen.getByText(/It does not rate or judge the people who live here/i))
      .toBeInTheDocument();
  });
});
