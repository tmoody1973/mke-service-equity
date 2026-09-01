// @vitest-environment jsdom

import type {AtlasResponse} from "@mke/contracts";
import {render, screen, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/",
  searchParams: new URLSearchParams(),
}));

const mapCanvasProps = vi.hoisted(() => ({current: null as null | Record<string, unknown>}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
}));

vi.mock("../map/map-canvas", () => ({
  MapCanvas: (props: Record<string, unknown>) => {
    mapCanvasProps.current = props;
    return <div data-map-container />;
  },
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
    publication: null,
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
        foodEquityPriority: 1,
        foodAccessNeedBand: "very_high",
        equityBaselineBand: "high",
        qualityStatus: "complete",
        exclusionReasons: [],
      },
    }],
  },
  contextLayers: {
    foodSites: {
      state: "available",
      layerId: "food_sites",
      title: "Food pantries and meal sites",
      description: "Community food sites listed by the source. Check before visiting.",
      affectsScores: false,
      qualityStatus: "source_listed_check_before_visiting",
      scoreRunRelationship: "display_context_only_not_part_of_score_run",
      features: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          id: "data-you-can-use:pantries-2026:18",
          geometry: {type: "Point", coordinates: [-87.947, 43.09]},
          properties: {
            id: "data-you-can-use:pantries-2026:18",
            name: "All Saints Catholic Church",
            siteType: "food_pantry",
            address: "4060 N. 26th St.",
            city: "Milwaukee",
            zipCode: "53209",
            phone: "414-444-5610",
            website: "https://example.org/pantry",
            details: "Pantry Tuesday and Thursday.",
            serviceArea: null,
            verificationStatus: "source_listed_check_before_visiting",
          },
        }],
      },
      source: {
        sourceName: "Milwaukee Food Environment Map — Food Pantries and Meal Sites",
        publisher: "Data You Can Use",
        collaborators: [
          "Milwaukee Food Council",
          "UWM Institute for Systems Change and Peacebuilding",
        ],
        datasetVersion: "Pantries 2026",
        sourceUrl: "https://example.org/map",
        layerUrl: "https://example.org/layer",
        retrievedAt: "2026-08-30T19:17:48Z",
        sourceLastEditedAt: "2026-03-05T19:55:13Z",
        termsUrl: "https://example.org/terms",
        attribution: "Data You Can Use, Milwaukee Food Council, and UWM Institute for Systems Change and Peacebuilding",
        sourceSnapshotSha256: "a".repeat(64),
        featureCount: 1,
        limitation: "Check before visiting.",
      },
    },
  },
};

describe("AtlasWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      json: () => Promise.resolve({state: "unavailable", reason: "profile_incomplete"}),
    })));
  });

  afterEach(() => {
    navigation.searchParams = new URLSearchParams();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    mapCanvasProps.current = null;
  });

  it("renders an honest unavailable state without constructing tract state", () => {
    render(<AtlasWorkspace atlas={unavailable} styleUrl="/map-style.json" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "No published Food Equity results are available yet.",
    );
    expect(screen.getByRole("region", {name: "Map workspace"})).toHaveAttribute(
      "data-selected-tract",
      "",
    );
  });

  it("derives selected tract state from a shareable URL and labels preview", () => {
    navigation.searchParams = new URLSearchParams("tract=55079000101");

    render(<AtlasWorkspace atlas={available} styleUrl="/map-style.json" />);

    expect(screen.getByText("Preview only — checked, but not published.")).toBeInTheDocument();
    expect(screen.getByRole("region", {name: "Map workspace"})).toHaveAttribute(
      "data-selected-tract",
      "55079000101",
    );
  });

  it("opens the HeroUI tract explorer sheet from the mobile map control", async () => {
    const user = userEvent.setup();
    render(<AtlasWorkspace atlas={available} styleUrl="/map-style.json" />);

    await user.click(screen.getByRole("button", {name: "Browse census tracts"}));

    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("heading", {name: "Explore census tracts"})).toBeInTheDocument();
    expect(within(dialog).getByRole("button", {name: /Census Tract 1.01.*Priority 1/}))
      .toBeInTheDocument();
  });

  it("enables the credited context layer and opens plain-language site details", async () => {
    const user = userEvent.setup();
    render(<AtlasWorkspace atlas={available} styleUrl="/map-style.json" />);

    const desktopToggle = screen.getAllByRole("switch", {
      name: "Show food pantries and meal sites",
    })[0];
    expect(desktopToggle).not.toBeChecked();
    await user.click(desktopToggle!);
    expect(window.location.search).toContain("context=food_sites");

    const onSelectFoodSite = mapCanvasProps.current?.onSelectFoodSite as
      | ((siteId: string) => void)
      | undefined;
    onSelectFoodSite?.("data-you-can-use:pantries-2026:18");
    expect(window.location.search).toContain("site=data-you-can-use%3Apantries-2026%3A18");
  });
});
