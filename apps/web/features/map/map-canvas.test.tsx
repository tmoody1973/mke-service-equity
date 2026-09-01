// @vitest-environment jsdom

import {act, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const {
  layerHandlers,
  mapAddControl,
  mapAddLayer,
  mapAddSource,
  mapConstructor,
  mapFitBounds,
  mapOnce,
  mapRemove,
  mapResize,
  mapQueryRenderedFeatures,
  mapSetFilter,
  mapSetFeatureState,
  mapSetLayoutProperty,
  mapSetPaintProperty,
} = vi.hoisted(() => {
  const remove = vi.fn();
  const resize = vi.fn();
  const addControl = vi.fn();
  const addLayer = vi.fn();
  const addSource = vi.fn();
  const fitBounds = vi.fn();
  const setFeatureState = vi.fn();
  const setFilter = vi.fn();
  const setLayoutProperty = vi.fn();
  const setPaintProperty = vi.fn();
  const setData = vi.fn();
  const queryRenderedFeatures = vi.fn(() => [] as Array<unknown>);
  const handlers = new globalThis.Map<string, (event?: unknown) => void>();
  const on = vi.fn((event: string, layerOrHandler: string | ((event?: unknown) => void), handler?: (event?: unknown) => void) => {
    if (event === "load" && typeof layerOrHandler === "function") {
      layerOrHandler();
      return;
    }
    if (typeof layerOrHandler === "function") {
      handlers.set(event, layerOrHandler);
      return;
    }
    if (typeof layerOrHandler === "string" && handler) {
      handlers.set(`${event}:${layerOrHandler}`, handler);
    }
  });
  const once = vi.fn((event: string, handler: () => void) => {
    if (event === "idle") {
      handler();
    }
  });

  return {
    layerHandlers: handlers,
    mapAddControl: addControl,
    mapAddLayer: addLayer,
    mapAddSource: addSource,
    mapConstructor: vi.fn(function MapMock(options: unknown) {
      void options;
      return {
        addControl,
        addLayer,
        addSource,
        fitBounds,
        getCanvas: () => ({style: {cursor: ""}}),
        getLayer: (id: string) => id === "atlas-food-site-points" ? {} : undefined,
        getSource: () => ({setData}),
        on,
        once,
        queryRenderedFeatures,
        remove,
        resize,
        setFilter,
        setFeatureState,
        setLayoutProperty,
        setPaintProperty,
      };
    }),
    mapFitBounds: fitBounds,
    mapOnce: once,
    mapRemove: remove,
    mapResize: resize,
    mapQueryRenderedFeatures: queryRenderedFeatures,
    mapSetFilter: setFilter,
    mapSetFeatureState: setFeatureState,
    mapSetLayoutProperty: setLayoutProperty,
    mapSetPaintProperty: setPaintProperty,
  };
});

vi.mock("maplibre-gl", () => ({
  AttributionControl: vi.fn(function AttributionControl() {}),
  Map: mapConstructor,
  NavigationControl: vi.fn(function NavigationControl() {}),
  setWorkerUrl: vi.fn(),
}));

import {MapShell} from "./map-shell";
import {MapCanvas} from "./map-canvas";

const tracts = {
  type: "FeatureCollection" as const,
  features: [{
    type: "Feature" as const,
    id: "55079000101",
    geometry: {
      type: "MultiPolygon" as const,
      coordinates: [[[[-87.95, 43.03], [-87.94, 43.03], [-87.94, 43.04], [-87.95, 43.03]]]] as [number, number][][][],
    },
    properties: {
      geoid: "55079000101",
      name: "Census Tract 1.01",
      population: 2_430,
      geographyVintage: "2020",
      foodEquityPriority: 1 as const,
      foodAccessNeedBand: "very_high" as const,
      equityBaselineBand: "high" as const,
      qualityStatus: "complete" as const,
      exclusionReasons: [],
    },
  }],
};

const foodSites = {
  type: "FeatureCollection" as const,
  features: [{
    type: "Feature" as const,
    id: "data-you-can-use:pantries-2026:18",
    geometry: {type: "Point" as const, coordinates: [-87.947, 43.09] as [number, number]},
    properties: {
      id: "data-you-can-use:pantries-2026:18",
      name: "All Saints Catholic Church",
      siteType: "food_pantry" as const,
      address: "4060 N. 26th St.",
      city: "Milwaukee",
      zipCode: "53209",
      phone: null,
      website: null,
      details: null,
      serviceArea: null,
      verificationStatus: "source_listed_check_before_visiting" as const,
    },
  }],
};

describe("MapShell", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_MAP_STYLE_URL", "/fixtures/map-style.json");
    layerHandlers.clear();
    mapQueryRenderedFeatures.mockReturnValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("creates one accessible map and removes it exactly once", () => {
    const {unmount} = render(<MapShell />);

    const region = screen.getByRole("region", {name: "Map workspace"});
    const container = region.querySelector("[data-map-container]");

    expect(container).not.toBeNull();
    expect(container).not.toHaveAttribute("aria-label");
    expect(mapConstructor).toHaveBeenCalledOnce();
    const options = mapConstructor.mock.calls[0]?.[0] as
      | {container?: Element; style?: string}
      | undefined;
    expect(options?.container).toBe(container);
    expect(options?.style).toBe("/fixtures/map-style.json");
    expect(mapAddControl).toHaveBeenCalledTimes(2);
    expect(mapResize).toHaveBeenCalledOnce();
    expect(mapOnce).toHaveBeenCalledWith("idle", expect.any(Function));

    unmount();
    expect(mapRemove).toHaveBeenCalledOnce();
  });

  it("adds tract layers, resets extent, and sends click selection by GEOID", async () => {
    const user = userEvent.setup();
    const onSelectTract = vi.fn();

    render(
      <section>
        <MapCanvas
          onSelectTract={onSelectTract}
          selectedTract="55079000101"
          styleUrl="/fixtures/map-style.json"
          tracts={tracts}
        />
      </section>,
    );

    expect(mapAddSource).toHaveBeenCalledOnce();
    expect(mapAddLayer).toHaveBeenCalledTimes(3);
    expect(mapSetFilter).toHaveBeenCalled();
    expect(mapSetFeatureState).toHaveBeenCalledWith(
      {source: "atlas-tracts", id: "55079000101"},
      {selected: true},
    );
    expect(mapFitBounds).toHaveBeenCalledOnce();

    layerHandlers.get("click:atlas-tract-fill")?.({features: [{id: "55079000101"}]});
    expect(onSelectTract).toHaveBeenCalledWith("55079000101");

    await user.click(screen.getByRole("button", {name: "Reset map"}));
    expect(mapFitBounds).toHaveBeenCalledTimes(2);
  });

  it("synchronizes server matches without creating another map", () => {
    const {rerender} = render(
      <section>
        <MapCanvas
          matchingGeoids={["55079000101", "55079000201"]}
          styleUrl="/fixtures/map-style.json"
          tracts={tracts}
        />
      </section>,
    );

    expect(mapConstructor).toHaveBeenCalledOnce();
    expect(mapSetPaintProperty).toHaveBeenCalledWith(
      "atlas-tract-fill",
      "fill-opacity",
      expect.any(Array),
    );
    expect(mapSetFeatureState).toHaveBeenCalledWith(
      {source: "atlas-tracts", id: "55079000101"},
      {matching: true},
    );

    rerender(
      <section>
        <MapCanvas
          matchingGeoids={["55079000201", "55079000301"]}
          styleUrl="/fixtures/map-style.json"
          tracts={tracts}
        />
      </section>,
    );

    expect(mapConstructor).toHaveBeenCalledOnce();
    expect(mapSetFeatureState).toHaveBeenCalledWith(
      {source: "atlas-tracts", id: "55079000101"},
      {matching: false},
    );
    expect(mapSetFeatureState).toHaveBeenCalledWith(
      {source: "atlas-tracts", id: "55079000301"},
      {matching: true},
    );
  });

  it("uses context-specific recovery copy when the map fails", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <section>
        <MapCanvas
          errorMessage="The map couldn’t load. Use Matching areas to review the same results."
          styleUrl="/fixtures/map-style.json"
          tracts={tracts}
        />
      </section>,
    );

    act(() => layerHandlers.get("error")?.({error: new Error("style failed")}));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The map couldn’t load. Use Matching areas to review the same results.",
    );
    consoleError.mockRestore();
  });

  it("renders, toggles, and selects a food site without changing tract scoring", () => {
    const onSelectFoodSite = vi.fn();
    const onSelectTract = vi.fn();

    const {rerender} = render(
      <section>
        <MapCanvas
          foodSites={foodSites}
          onSelectFoodSite={onSelectFoodSite}
          onSelectTract={onSelectTract}
          selectedFoodSite="data-you-can-use:pantries-2026:18"
          showFoodSites={false}
          styleUrl="/fixtures/map-style.json"
          tracts={tracts}
        />
      </section>,
    );

    expect(mapAddSource).toHaveBeenCalledTimes(2);
    expect(mapAddLayer).toHaveBeenCalledTimes(4);
    expect(mapSetFeatureState).toHaveBeenCalledWith(
      {source: "atlas-food-sites", id: "data-you-can-use:pantries-2026:18"},
      {selected: true},
    );

    layerHandlers.get("click:atlas-food-site-points")?.({
      features: [{id: "data-you-can-use:pantries-2026:18"}],
    });
    expect(onSelectFoodSite).toHaveBeenCalledWith("data-you-can-use:pantries-2026:18");

    rerender(
      <section>
        <MapCanvas
          foodSites={foodSites}
          onSelectFoodSite={onSelectFoodSite}
          onSelectTract={onSelectTract}
          selectedFoodSite="data-you-can-use:pantries-2026:18"
          showFoodSites
          styleUrl="/fixtures/map-style.json"
          tracts={tracts}
        />
      </section>,
    );
    expect(mapSetLayoutProperty).toHaveBeenCalledWith(
      "atlas-food-site-points",
      "visibility",
      "visible",
    );

    mapQueryRenderedFeatures.mockReturnValue([{id: "data-you-can-use:pantries-2026:18"}]);
    layerHandlers.get("click:atlas-tract-fill")?.({
      features: [{id: "55079000101"}],
      point: {x: 10, y: 10},
    });
    expect(onSelectTract).not.toHaveBeenCalled();
  });
});
