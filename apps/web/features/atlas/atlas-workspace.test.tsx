// @vitest-environment jsdom

import type {AtlasResponse} from "@mke/contracts";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, describe, expect, it, vi} from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/",
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("../map/map-canvas", () => ({
  MapCanvas: () => <div data-map-container />,
}));

import {AtlasWorkspace} from "./atlas-workspace";

const unavailable: AtlasResponse = {state: "unavailable", reason: "no_published_run"};

const available: AtlasResponse = {
  state: "available",
  mode: "validated_preview",
  run: {
    id: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
    methodologyVersion: "food-equity-v1",
    equityBaselineMethodologyVersion: "equity-baseline-v1",
    completedAt: "2026-08-30T12:00:00.000Z",
    dataVintages: {acs: "2020-2024"},
  },
  tracts: {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      id: "55079000101",
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[[-87.95, 43.03], [-87.94, 43.03], [-87.94, 43.04], [-87.95, 43.03]]]],
      },
      properties: {
        geoid: "55079000101",
        name: "Census Tract 1.01",
        population: 2_430,
        geographyVintage: "2020",
        foodEquityPriority: 5,
        foodAccessNeedBand: "very_high",
        equityBaselineBand: "high",
        qualityStatus: "complete",
        exclusionReasons: [],
      },
    }],
  },
};

describe("AtlasWorkspace", () => {
  afterEach(() => {
    navigation.searchParams = new URLSearchParams();
    vi.clearAllMocks();
  });

  it("renders an honest unavailable state without constructing tract state", () => {
    render(<AtlasWorkspace atlas={unavailable} styleUrl="/map-style.json" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "No published Food Equity data is available yet.",
    );
    expect(screen.getByRole("region", {name: "Map workspace"})).toHaveAttribute(
      "data-selected-tract",
      "",
    );
  });

  it("derives selected tract state from a shareable URL and labels preview", () => {
    navigation.searchParams = new URLSearchParams("tract=55079000101");

    render(<AtlasWorkspace atlas={available} styleUrl="/map-style.json" />);

    expect(screen.getByRole("status")).toHaveTextContent("Validated preview — not published");
    expect(screen.getByRole("region", {name: "Map workspace"})).toHaveAttribute(
      "data-selected-tract",
      "55079000101",
    );
  });

  it("opens the HeroUI tract explorer sheet from the mobile map control", async () => {
    const user = userEvent.setup();
    render(<AtlasWorkspace atlas={available} styleUrl="/map-style.json" />);

    await user.click(screen.getByRole("button", {name: "Browse tracts"}));

    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("heading", {name: "Explore census tracts"})).toBeInTheDocument();
    expect(within(dialog).getByRole("button", {name: /Census Tract 1.01.*Priority 5/}))
      .toBeInTheDocument();
  });
});
