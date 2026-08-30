import type {AtlasFoodSiteFeatureCollection} from "@mke/contracts";
import type {AddLayerObject, GeoJSONSourceSpecification} from "maplibre-gl";

export const FOOD_SITE_SOURCE_ID = "atlas-food-sites";
export const FOOD_SITE_LAYER_ID = "atlas-food-site-points";

type FoodSiteLayerMap = {
  addSource(id: string, source: GeoJSONSourceSpecification): unknown;
  addLayer(layer: AddLayerObject): unknown;
};

type FoodSiteVisibilityMap = {
  setLayoutProperty(layerId: string, name: string, value: unknown): unknown;
};

export function addFoodSiteLayers(
  map: FoodSiteLayerMap,
  foodSites: AtlasFoodSiteFeatureCollection,
  visible: boolean,
): void {
  map.addSource(FOOD_SITE_SOURCE_ID, {
    type: "geojson",
    data: foodSites as GeoJSONSourceSpecification["data"],
  });
  map.addLayer({
    id: FOOD_SITE_LAYER_ID,
    type: "circle",
    source: FOOD_SITE_SOURCE_ID,
    layout: {visibility: visible ? "visible" : "none"},
    paint: {
      "circle-color": [
        "match",
        ["get", "siteType"],
        "food_bank", "#7c3aed",
        "meal_program", "#0f766e",
        "#d97706",
      ],
      "circle-opacity": 0.95,
      "circle-radius": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        9,
        6,
      ],
      "circle-stroke-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#111827",
        "#ffffff",
      ],
      "circle-stroke-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        3,
        2,
      ],
    },
  });
}

export function setFoodSiteLayerVisibility(
  map: FoodSiteVisibilityMap,
  visible: boolean,
): void {
  map.setLayoutProperty(FOOD_SITE_LAYER_ID, "visibility", visible ? "visible" : "none");
}
