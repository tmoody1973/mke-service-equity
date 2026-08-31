// @vitest-environment jsdom

import {render, screen, within} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {ComparisonCards} from "./comparison-cards";
import {
  completeComparisonTract,
  insufficientComparisonTract,
  makeComparison,
} from "./comparison-test-fixture";

describe("ComparisonCards", () => {
  it("renders consistently ordered stacked cards without a swipe-only container", () => {
    render(<ComparisonCards comparison={makeComparison([
      completeComparisonTract({
        geoid: "55079000101",
        index: 0,
        name: "Census Tract 1.01",
        population: null,
      }),
      insufficientComparisonTract({geoid: "55079187200", name: "Census Tract 1872"}),
    ])} />);

    const list = screen.getByRole("list", {name: "Comparison summary by tract"});
    expect(list).not.toHaveClass("overflow-x-auto");
    const cards = within(list).getAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Population unavailable");
    expect(cards[1]).toHaveTextContent("Not scored — insufficient data");
    expect(within(cards[0]!).getAllByRole("term").map((term) => term.textContent)).toEqual([
      "Population",
      "Food Equity Priority",
      "Equity Baseline",
      "Food Access Need",
      "Residents beyond one driving mile from a SNAP-authorized retailer",
      "Walk to the nearest full-service grocery",
      "Households with no vehicle available",
      "Scheduled transit service within a ten-minute walk",
    ]);
  });
});
