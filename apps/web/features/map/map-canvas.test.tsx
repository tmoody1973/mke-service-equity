// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
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
  mapSetFilter,
  mapSetFeatureState,
} = vi.hoisted(() => {
  const remove = vi.fn();
  const resize = vi.fn();
  const addControl = vi.fn();
  const addLayer = vi.fn();
  const addSource = vi.fn();
  const fitBounds = vi.fn();
  const setFeatureState = vi.fn();
  const setFilter = vi.fn();
  const setData = vi.fn();
  const handlers = new globalThis.Map<string, (event?: unknown) => void>();
  const on = vi.fn((event: string, layerOrHandler: string | ((event?: unknown) => void), handler?: (event?: unknown) => void) => {
    if (event === "load" && typeof layerOrHandler === "function") {
      layerOrHandler();
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
        getSource: () => ({setData}),
        on,
        once,
        remove,
        resize,
        setFilter,
        setFeatureState,
      };
    }),
    mapFitBounds: fitBounds,
    mapOnce: once,
    mapRemove: remove,
    mapResize: resize,
    mapSetFilter: setFilter,
    mapSetFeatureState: setFeatureState,
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
      foodEquityPriority: 5 as const,
      foodAccessNeedBand: "very_high" as const,
      equityBaselineBand: "high" as const,
      qualityStatus: "complete" as const,
      exclusionReasons: [],
    },
  }],
};

describe("MapShell", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_MAP_STYLE_URL", "/fixtures/map-style.json");
    layerHandlers.clear();
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
});
