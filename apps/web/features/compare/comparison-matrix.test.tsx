// @vitest-environment jsdom

import {render, screen, within} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {ComparisonMatrix} from "./comparison-matrix";
import {completeComparisonTract, makeComparison} from "./comparison-test-fixture";

describe("ComparisonMatrix", () => {
  it("renders one semantic five-tract table with tract columns and approved summary rows", () => {
    const comparison = makeComparison(Array.from({length: 5}, (_, index) => completeComparisonTract({
      geoid: `55079000${index + 1}00`,
      index,
      name: `Census Tract ${index + 1}`,
    })));

    render(<ComparisonMatrix comparison={comparison} />);

    const table = screen.getByRole("table", {name: "Comparison summary"});
    expect(within(table).getAllByRole("columnheader")).toHaveLength(6);
    expect(within(table).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual([
      "Population",
      "Food Equity Priority",
      "Equity Baseline",
      "Food Access Need",
      "Residents beyond one driving mile from a SNAP-authorized retailer",
      "Walk to the nearest full-service grocery",
      "Households with no vehicle available",
      "Scheduled transit service within a ten-minute walk",
    ]);
    expect(within(table).getByRole("columnheader", {name: /Census Tract 5.*55079000500/i}))
      .toBeInTheDocument();
    expect(within(table).queryByText("People of color")).not.toBeInTheDocument();
  });
});
