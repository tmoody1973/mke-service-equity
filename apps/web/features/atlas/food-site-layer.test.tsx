// @vitest-environment jsdom

import type {AtlasFoodSitesLayerResponse} from "@mke/contracts";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";
import {FoodSiteDetails, FoodSiteLayerControl} from "./food-site-layer";

const layer: AtlasFoodSitesLayerResponse = {
  state: "available" as const,
  layerId: "food_sites" as const,
  title: "Food pantries and meal sites" as const,
  description: "Source-listed community food sites.",
  affectsScores: false as const,
  qualityStatus: "source_listed_check_before_visiting" as const,
  scoreRunRelationship: "display_context_only_not_part_of_score_run" as const,
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
        phone: null,
        website: null,
        details: null,
        serviceArea: null,
        verificationStatus: "source_listed_check_before_visiting",
      },
    }],
  },
  source: {
    sourceName: "Milwaukee Food Environment Map — Food Pantries and Meal Sites",
    publisher: "Data You Can Use" as const,
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
    featureCount: 89,
    limitation: "Check before visiting.",
  },
};

describe("FoodSiteLayerControl", () => {
  it("explains verification, credit, and score separation before enabling the layer", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <FoodSiteLayerControl
        enabled={false}
        idPrefix="test"
        layer={layer}
        onChange={onChange}
      />,
    );

    expect(screen.getByText(/never changes a tract’s score or priority/i)).toBeInTheDocument();
    expect(screen.getByText(/Check before visiting/i)).toBeInTheDocument();
    expect(screen.getByText(/Data You Can Use, Milwaukee Food Council/i)).toBeInTheDocument();

    await user.click(screen.getByRole("switch", {name: "Show food pantries and meal sites"}));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("FoodSiteDetails", () => {
  it("labels source notes as unverified and provides direct contact choices", () => {
    render(
      <FoodSiteDetails
        idPrefix="test"
        onClose={vi.fn()}
        site={{
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
        }}
        sourceUrl="https://example.org/map"
      />,
    );

    expect(screen.getByRole("heading", {name: "All Saints Catholic Church"})).toBeInTheDocument();
    expect(screen.getByText(/current hours and services have not been independently confirmed/i))
      .toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Call 414-444-5610"}))
      .toHaveAttribute("href", "tel:4144445610");
    expect(screen.getByRole("link", {name: /Provider website/})).toHaveAttribute(
      "href",
      "https://example.org/pantry",
    );
  });
});
