// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const navigation = vi.hoisted(() => ({push: vi.fn()}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: navigation.push}),
}));

import {AppliedFilterChips} from "./applied-filter-chips";
import {EMPTY_OPPORTUNITY_FILTERS} from "./opportunity-filter-state";

describe("AppliedFilterChips", () => {
  beforeEach(() => navigation.push.mockReset());

  const filters = {
    ...EMPTY_OPPORTUNITY_FILTERS,
    priorities: [1, 2],
    equityBands: ["high" as const],
    groceryWalkMinimumMinutes: 15,
    includeUnreachableGrocery: true,
  };

  it("renders every applied condition as text and removes one without changing the others", async () => {
    const user = userEvent.setup();
    render(
      <AppliedFilterChips
        filters={filters}
        currentSearchParams="utm_medium=email&priorities=1&priorities=2&equity-bands=high&grocery-walk-minimum-minutes=15&include-unreachable-grocery=true"
      />,
    );

    expect(screen.getByText("Priority 1")).toBeInTheDocument();
    expect(screen.getByText("Priority 2")).toBeInTheDocument();
    expect(screen.getByText("Equity Baseline: High")).toBeInTheDocument();
    expect(screen.getByText("Grocery walk: at least 15 minutes")).toBeInTheDocument();
    expect(screen.getByText("Grocery walk: no route found")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Remove applied filter Priority 1"}))
      .toHaveClass("size-11");
    expect(screen.getByRole("button", {name: "Clear all applied filters"}))
      .toHaveClass("min-h-11");

    await user.click(screen.getByRole("button", {name: "Remove applied filter Priority 1"}));

    expect(navigation.push).toHaveBeenCalledWith(
      "/analyze/opportunity?utm_medium=email&priorities=2&equity-bands=high&grocery-walk-minimum-minutes=15&include-unreachable-grocery=true",
      {scroll: false},
    );
  });

  it("clears all managed filters while preserving unrelated URL state", async () => {
    const user = userEvent.setup();
    render(
      <AppliedFilterChips
        filters={filters}
        currentSearchParams="campaign=fall&priorities=1&priorities=2&equity-bands=high&grocery-walk-minimum-minutes=15&include-unreachable-grocery=true"
      />,
    );

    await user.click(screen.getByRole("button", {name: "Clear all applied filters"}));

    expect(navigation.push).toHaveBeenCalledWith(
      "/analyze/opportunity?campaign=fall",
      {scroll: false},
    );
  });

  it("shows an explicit empty state instead of removable controls when nothing is applied", () => {
    render(
      <AppliedFilterChips filters={EMPTY_OPPORTUNITY_FILTERS} currentSearchParams="" />,
    );

    expect(screen.getByText("No filters applied")).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Clear all applied filters"}))
      .not.toBeInTheDocument();
  });
});
