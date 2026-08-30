// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import {PriorityLegend} from "./priority-legend";

describe("PriorityLegend", () => {
  it("labels all five priorities and both non-score states in text", () => {
    render(<PriorityLegend activePriorities={[]} onChange={vi.fn()} />);

    expect(screen.getByRole("group", {name: "Food Equity Priority filter"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Show all priorities"})).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("1 — Lower relative priority")).toBeInTheDocument();
    expect(screen.getByText("5 — Highest relative priority")).toBeInTheDocument();
    expect(screen.getByText("Insufficient data")).toBeInTheDocument();
    expect(screen.getByText("Zero population — not scored")).toBeInTheDocument();
  });

  it("changes the explicit priority filter", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PriorityLegend activePriorities={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", {name: "Filter to priority 5"}));
    expect(onChange).toHaveBeenCalledWith([5]);
  });
});
