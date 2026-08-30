import type {AtlasTractFeatureCollection} from "@mke/contracts";
import type {AddLayerObject, GeoJSONSourceSpecification} from "maplibre-gl";

export const TRACT_SOURCE_ID = "atlas-tracts";
export const TRACT_FILL_LAYER_ID = "atlas-tract-fill";
export const TRACT_LINE_LAYER_ID = "atlas-tract-line";
export const TRACT_INSUFFICIENT_LINE_LAYER_ID = "atlas-tract-insufficient-line";

export const PRIORITY_COLORS = {
  1: "#eff3ff",
  2: "#bdd7e7",
  3: "#6baed6",
  4: "#3182bd",
  5: "#08519c",
} as const;

export const INSUFFICIENT_DATA_COLOR = "#7c8798";
export const ZERO_POPULATION_COLOR = "#d1d5db";

type TractLayerMap = {
  addSource(id: string, source: GeoJSONSourceSpecification): unknown;
  addLayer(layer: AddLayerObject): unknown;
};

type TractGeoJson = AtlasTractFeatureCollection | {
  type: "FeatureCollection";
  features: [];
};

export function addTractLayers(map: TractLayerMap, tracts: TractGeoJson): void {
  map.addSource(TRACT_SOURCE_ID, {
    type: "geojson",
    data: tracts as GeoJSONSourceSpecification["data"],
  });

  map.addLayer({
    id: TRACT_FILL_LAYER_ID,
    type: "fill",
    source: TRACT_SOURCE_ID,
    paint: {
      "fill-color": [
        "case",
        ["==", ["get", "qualityStatus"], "insufficient_data"],
        INSUFFICIENT_DATA_COLOR,
        ["==", ["get", "qualityStatus"], "ineligible_zero_population"],
        ZERO_POPULATION_COLOR,
        [
          "match",
          ["get", "foodEquityPriority"],
          1, PRIORITY_COLORS[1],
          2, PRIORITY_COLORS[2],
          3, PRIORITY_COLORS[3],
          4, PRIORITY_COLORS[4],
          5, PRIORITY_COLORS[5],
          INSUFFICIENT_DATA_COLOR,
        ],
      ],
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0.9,
        ["boolean", ["feature-state", "hovered"], false],
        0.84,
        0.72,
      ],
    },
  });

  map.addLayer({
    id: TRACT_LINE_LAYER_ID,
    type: "line",
    source: TRACT_SOURCE_ID,
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#111827",
        ["boolean", ["feature-state", "hovered"], false],
        "#334155",
        "#ffffff",
      ],
      "line-opacity": 0.95,
      "line-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        4,
        ["boolean", ["feature-state", "hovered"], false],
        2,
        0.75,
      ],
    },
  });

  map.addLayer({
    id: TRACT_INSUFFICIENT_LINE_LAYER_ID,
    type: "line",
    source: TRACT_SOURCE_ID,
    filter: ["in", ["get", "qualityStatus"], ["literal", [
      "insufficient_data",
      "ineligible_zero_population",
    ]]],
    paint: {
      "line-color": "#475569",
      "line-dasharray": [2, 2],
      "line-width": 1.5,
    },
  });
}
