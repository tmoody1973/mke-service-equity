// @vitest-environment jsdom

import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("../map/map-canvas", () => ({
  MapCanvas: (props: {matchingGeoids: ReadonlyArray<string>}) => (
    <div data-testid="map-canvas" data-matching-geoids={props.matchingGeoids.join(",")} />
  ),
}));

import {OpportunityMap} from "./opportunity-map";
import {OPPORTUNITY_TRACTS} from "./opportunity-test-fixture";

describe("OpportunityMap", () => {
  it("passes only the server-returned matching GEOIDs to the existing Atlas map source", () => {
    render(
      <OpportunityMap
        matchingGeoids={["55079000101", "55079000201"]}
        onSelect={vi.fn()}
        selectedGeoid={null}
        styleUrl="/map-style.json"
        tracts={OPPORTUNITY_TRACTS}
      />,
    );

    expect(screen.getByTestId("map-canvas")).toHaveAttribute(
      "data-matching-geoids",
      "55079000101,55079000201",
    );
  });
});
