// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import {PriorityLegend} from "./priority-legend";

describe("PriorityLegend", () => {
  it("labels all five priorities and both non-score states in text", () => {
    render(<PriorityLegend activePriorities={[]} onChange={vi.fn()} />);

    expect(screen.getByRole("group", {name: "Food Equity Priority filter"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Show all tracts"})).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("1 — Highest")).toBeInTheDocument();
    expect(screen.getByText("2 — High")).toBeInTheDocument();
    expect(screen.getByText("3 — Moderate")).toBeInTheDocument();
    expect(screen.getByText("4 — Lower")).toBeInTheDocument();
    expect(screen.getByText("5 — Lowest")).toBeInTheDocument();
    expect(screen.getByText("Strongest overlap of food-access need and other barriers."))
      .toBeInTheDocument();
    expect(screen.getByText("Middle or mixed overlap.")).toBeInTheDocument();
    expect(screen.getByText("Weakest overlap in this data version.")).toBeInTheDocument();
    expect(screen.getByText("How to use this for planning")).toBeInTheDocument();
    expect(screen.getByText(/does not choose a project/i)).toBeInTheDocument();
    expect(screen.getByText("Insufficient data")).toBeInTheDocument();
    expect(screen.getByText("No recorded population — not scored")).toBeInTheDocument();
  });

  it("changes the explicit priority filter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PriorityLegend activePriorities={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", {name: /Show or hide Priority 5 tracts/i}));
    expect(onChange).toHaveBeenCalledWith([5]);
  });
});
