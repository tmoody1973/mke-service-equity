// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const {mapAddControl, mapConstructor, mapRemove, mapResize} = vi.hoisted(() => {
  const remove = vi.fn();
  const resize = vi.fn();
  const addControl = vi.fn();

  return {
    mapAddControl: addControl,
    mapConstructor: vi.fn(function MapMock(options: unknown) {
      void options;
      return {
        addControl,
        remove,
        resize,
      };
    }),
    mapRemove: remove,
    mapResize: resize,
  };
});

vi.mock("maplibre-gl", () => ({
  AttributionControl: vi.fn(function AttributionControl() {}),
  Map: mapConstructor,
  NavigationControl: vi.fn(function NavigationControl() {}),
}));

import {MapShell} from "./map-shell";

describe("MapShell", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_MAP_STYLE_URL", "/fixtures/map-style.json");
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

    unmount();
    expect(mapRemove).toHaveBeenCalledOnce();
  });
});
