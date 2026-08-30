import {describe, expect, it, vi} from "vitest";
import {addFoodSiteLayers, setFoodSiteLayerVisibility} from "./food-site-layers";

const collection = {
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

describe("food-site map layers", () => {
  it("adds the approved points hidden until the user enables the context layer", () => {
    const addSource = vi.fn();
    const addLayer = vi.fn();

    addFoodSiteLayers({addSource, addLayer}, collection, false);

    expect(addSource).toHaveBeenCalledWith("atlas-food-sites", {
      type: "geojson",
      data: collection,
    });
    expect(addLayer.mock.calls[0]?.[0]).toMatchObject({
      id: "atlas-food-site-points",
      type: "circle",
      layout: {visibility: "none"},
    });
  });

  it("changes only display visibility and never a scoring filter", () => {
    const setLayoutProperty = vi.fn();

    setFoodSiteLayerVisibility({setLayoutProperty}, true);

    expect(setLayoutProperty).toHaveBeenCalledWith(
      "atlas-food-site-points",
      "visibility",
      "visible",
    );
  });
});
