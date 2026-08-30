import {describe, expect, it, vi} from "vitest";
import {
  addTractLayers,
  PRIORITY_COLORS,
  TRACT_FILL_LAYER_ID,
  TRACT_INSUFFICIENT_LINE_LAYER_ID,
  TRACT_LINE_LAYER_ID,
  TRACT_SOURCE_ID,
} from "./tract-layers";

describe("addTractLayers", () => {
  it("adds one canonical GeoJSON source and labeled quality-aware layers", () => {
    const addSource = vi.fn();
    const addLayer = vi.fn();

    addTractLayers({addSource, addLayer}, {
      type: "FeatureCollection",
      features: [],
    });

    expect(addSource).toHaveBeenCalledWith(TRACT_SOURCE_ID, {
      type: "geojson",
      data: {type: "FeatureCollection", features: []},
    });
    expect(addLayer.mock.calls.map(([layer]) => layer.id)).toEqual([
      TRACT_FILL_LAYER_ID,
      TRACT_LINE_LAYER_ID,
      TRACT_INSUFFICIENT_LINE_LAYER_ID,
    ]);
  });

  it("uses five ordered colors and separate insufficient/zero-population states", () => {
    expect(Object.keys(PRIORITY_COLORS)).toEqual(["1", "2", "3", "4", "5"]);
    expect(new Set(Object.values(PRIORITY_COLORS)).size).toBe(5);

    const addLayer = vi.fn();
    addTractLayers({addSource: vi.fn(), addLayer}, {type: "FeatureCollection", features: []});
    const fillLayer = addLayer.mock.calls[0]?.[0];
    expect(JSON.stringify(fillLayer.paint["fill-color"])).toContain("insufficient_data");
    expect(JSON.stringify(fillLayer.paint["fill-color"])).toContain(
      "ineligible_zero_population",
    );
    expect(JSON.stringify(fillLayer.paint["fill-color"])).toContain(PRIORITY_COLORS[5]);
  });

  it("expresses selection with an outline wider than hover", () => {
    const addLayer = vi.fn();
    addTractLayers({addSource: vi.fn(), addLayer}, {type: "FeatureCollection", features: []});
    const lineLayer = addLayer.mock.calls[1]?.[0];
    const expression = JSON.stringify(lineLayer.paint["line-width"]);

    expect(expression).toContain("selected");
    expect(expression).toContain("hovered");
    expect(expression.indexOf("selected")).toBeLessThan(expression.indexOf("hovered"));
  });
});
