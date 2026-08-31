// @vitest-environment jsdom

import {render, screen, within} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import type {DifferencesSummary} from "./differences";
import {DifferencesView} from "./differences-view";

const summary: DifferencesSummary = {
  emptyStatement: null,
  items: [
    {
      id: "priority",
      kind: "priority",
      title: "Priority levels differ",
      statement: "North tract is Priority 1; South tract is Priority 3.",
      missingEvidence: null,
      uncertaintyCaution: null,
    },
    {
      id: "metric:housing_cost_burden",
      kind: "metric",
      title: "Housing cost burden",
      statement: "The county-percentile range is 22.5 points.",
      missingEvidence: "East tract has data unavailable. Missing information was not counted as zero.",
      uncertaintyCaution: "Use caution: North tract is marked “High uncertainty.”",
    },
  ],
  insufficientComparisons: [
    {
      id: "metric:current_asthma",
      label: "Current asthma",
      availableTractCount: 1,
      requiredTractCount: 2,
    },
  ],
};

describe("DifferencesView", () => {
  it("explains ordered differences, missing evidence, and uncertainty without ranking tracts", () => {
    render(<DifferencesView summary={summary} />);

    const region = screen.getByRole("region", {name: "Differences"});
    expect(within(region).getAllByRole("article")).toHaveLength(2);
    expect(within(region).getAllByRole("article")[0]).toHaveTextContent("Priority levels differ");
    expect(within(region).getByText(/Missing information:/)).toBeInTheDocument();
    expect(within(region).getByText("Survey uncertainty")).toBeInTheDocument();
    expect(within(region).getByText("Some measures could not be compared"))
      .toBeInTheDocument();
    expect(within(region).getByText(/Current asthma: 1 tract has a usable value/))
      .toBeInTheDocument();
    expect(region).toHaveTextContent("Missing information was not counted as zero");
    expect(region).toHaveTextContent("This is not a ranking");
  });

  it("uses the approved plain-language empty state", () => {
    render(
      <DifferencesView
        summary={{
          emptyStatement: "No large differences were found under these rules. This does not mean the tracts are the same.",
          insufficientComparisons: [],
          items: [],
        }}
      />,
    );

    expect(screen.getByRole("heading", {name: "No large differences found"})).toBeInTheDocument();
    expect(screen.getByText(/This does not mean the tracts are the same/)).toBeInTheDocument();
  });
});
