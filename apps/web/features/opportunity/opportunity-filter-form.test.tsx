// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const navigation = vi.hoisted(() => ({push: vi.fn()}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({push: navigation.push}),
}));

import {OpportunityFilterWorkspace} from "./opportunity-filter-workspace";
import {EMPTY_OPPORTUNITY_FILTERS} from "./opportunity-filter-state";

describe("OpportunityFilterWorkspace", () => {
  beforeEach(() => navigation.push.mockReset());

  it("starts with no filters and keeps draft changes separate from applied results", async () => {
    const user = userEvent.setup();
    render(
      <OpportunityFilterWorkspace
        appliedFilters={EMPTY_OPPORTUNITY_FILTERS}
        currentSearchParams="utm_source=partner"
        matchingTractCount={302}
      />,
    );

    expect(screen.getByText("No filters applied")).toBeInTheDocument();
    expect(screen.getByRole("status", {name: "Applied filter update"})).toHaveTextContent(
      "No filters applied. 302 matching areas.",
    );

    await user.click(screen.getByRole("checkbox", {name: /Priority 1/i}));
    await user.click(screen.getByRole("checkbox", {name: /Priority 2/i}));
    await user.click(screen.getByRole("checkbox", {name: "Equity Baseline band: High"}));
    await user.type(
      screen.getByRole("spinbutton", {name: "Households with no vehicle available"}),
      "25",
    );

    expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByText("No filters applied")).toBeInTheDocument();
    expect(screen.getByRole("status", {name: "Applied filter update"})).toHaveTextContent(
      "No filters applied. 302 matching areas.",
    );

    await user.click(screen.getByRole("button", {name: "Apply filters"}));

    expect(navigation.push).toHaveBeenCalledWith(
      "/analyze/opportunity?utm_source=partner&priorities=1&priorities=2&equity-bands=high&no-vehicle-minimum-percent=25",
      {scroll: false},
    );
  });

  it("explains OR, AND, inclusive directions, and the distinct unreachable option", () => {
    render(
      <OpportunityFilterWorkspace
        appliedFilters={EMPTY_OPPORTUNITY_FILTERS}
        currentSearchParams=""
        matchingTractCount={302}
      />,
    );

    expect(screen.getByText(/Inside one group, an area can match any choice you select/i))
      .toBeInTheDocument();
    expect(screen.getByText(/When you use more than one group, an area must match every group/i))
      .toBeInTheDocument();
    expect(screen.getAllByText(/At least this percentage, including the number you enter/i))
      .toHaveLength(2);
    expect(screen.getByText(/At most this many scheduled trips per hour, including the number/i))
      .toBeInTheDocument();
    expect(screen.getByRole("checkbox", {name: "No walking route found"}))
      .toBeInTheDocument();
    expect(screen.queryByText(/infinite/i)).not.toBeInTheDocument();
  });

  it("blocks inaccessible numeric values, preserves blank as inactive, and accepts observed zero", async () => {
    const user = userEvent.setup();
    render(
      <OpportunityFilterWorkspace
        appliedFilters={EMPTY_OPPORTUNITY_FILTERS}
        currentSearchParams=""
        matchingTractCount={302}
      />,
    );

    const equity = screen.getByRole("spinbutton", {name: "Equity Baseline county percentile"});
    const noVehicle = screen.getByRole("spinbutton", {
      name: "Households with no vehicle available",
    });
    await user.type(equity, "100.001");
    await user.click(screen.getByRole("button", {name: "Apply filters"}));

    expect(navigation.push).not.toHaveBeenCalled();
    expect(equity).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Use a number from 0 through 100 with no more than two decimal places/i))
      .toBeInTheDocument();
    expect(equity).toHaveFocus();

    await user.clear(equity);
    await user.type(noVehicle, "0");
    await user.click(screen.getByRole("button", {name: "Apply filters"}));

    expect(navigation.push).toHaveBeenLastCalledWith(
      "/analyze/opportunity?no-vehicle-minimum-percent=0",
      {scroll: false},
    );
  });

  it("resets draft controls when browser navigation supplies a new applied state", async () => {
    const user = userEvent.setup();
    const {rerender} = render(
      <OpportunityFilterWorkspace
        appliedFilters={EMPTY_OPPORTUNITY_FILTERS}
        currentSearchParams=""
        matchingTractCount={302}
      />,
    );

    const input = screen.getByRole("spinbutton", {name: "Food Access Need county percentile"});
    await user.type(input, "35");
    expect(input).toHaveValue(35);

    rerender(
      <OpportunityFilterWorkspace
        appliedFilters={{
          ...EMPTY_OPPORTUNITY_FILTERS,
          foodNeedPercentileMinimum: 70,
          priorities: [2],
        }}
        currentSearchParams="priorities=2&food-need-percentile-minimum=70"
        matchingTractCount={18}
      />,
    );

    expect(await screen.findByRole("spinbutton", {name: "Food Access Need county percentile"}))
      .toHaveValue(70);
    expect(screen.getByRole("checkbox", {name: /Priority 2/i})).toBeChecked();
    expect(screen.getByRole("status", {name: "Applied filter update"})).toHaveTextContent(
      "2 filters applied. 18 matching areas.",
    );
  });
});
