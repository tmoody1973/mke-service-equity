// @vitest-environment jsdom

import type {AtlasTractFeature} from "@mke/contracts";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import {TractList} from "./tract-list";

function feature(
  geoid: string,
  priority: number | null,
  qualityStatus: AtlasTractFeature["properties"]["qualityStatus"] = "complete",
): AtlasTractFeature {
  return {
    type: "Feature",
    id: geoid,
    geometry: {
      type: "MultiPolygon",
      coordinates: [[[[-87.95, 43.03], [-87.94, 43.03], [-87.94, 43.04], [-87.95, 43.03]]]],
    },
    properties: {
      geoid,
      name: `Census Tract ${geoid.slice(-5)}`,
      population: qualityStatus === "ineligible_zero_population" ? 0 : 1_000,
      geographyVintage: "2020",
      foodEquityPriority: priority as 1 | 2 | 3 | 4 | 5 | null,
      foodAccessNeedBand: priority === null ? null : "high",
      equityBaselineBand: qualityStatus === "ineligible_zero_population" ? null : "high",
      qualityStatus,
      exclusionReasons: qualityStatus === "complete" ? [] : [qualityStatus],
    },
  };
}

const tracts = [
  feature("55079000101", 5),
  feature("55079187200", null, "insufficient_data"),
  feature("55079990000", null, "ineligible_zero_population"),
];

describe("TractList", () => {
  it("offers every quality state without requiring map interaction", () => {
    render(<TractList onSelect={vi.fn()} selectedTract="55079187200" tracts={tracts} />);

    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", {name: /Census Tract 87200.*Insufficient data/}))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", {name: /Census Tract 90000.*Zero population/}))
      .toBeInTheDocument();
  });

  it("selects a tract through the non-map control", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TractList onSelect={onSelect} selectedTract={null} tracts={tracts} />);

    await user.click(screen.getByRole("button", {name: /Census Tract 00101.*Priority 5/}));
    expect(onSelect).toHaveBeenCalledWith("55079000101");
  });
});
