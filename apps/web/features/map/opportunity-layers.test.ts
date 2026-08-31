import {describe, expect, it, vi} from "vitest";

import {
  applyOpportunityLayerStyles,
  OPPORTUNITY_FILL_OPACITY,
  OPPORTUNITY_LINE_COLOR,
  OPPORTUNITY_LINE_WIDTH,
  synchronizeOpportunityMatchingStates,
} from "./opportunity-layers";

describe("Opportunity map render state", () => {
  it("represents selected, matching, non-matching, insufficient, and zero-population tracts", () => {
    const expression = JSON.stringify([
      OPPORTUNITY_FILL_OPACITY,
      OPPORTUNITY_LINE_COLOR,
      OPPORTUNITY_LINE_WIDTH,
    ]);

    expect(expression).toContain("selected");
    expect(expression).toContain("matching");
    expect(expression).toContain("insufficient_data");
    expect(expression).toContain("ineligible_zero_population");
    expect(expression).toContain("qualityStatus");
  });

  it("applies presentation expressions to the existing tract layers", () => {
    const setPaintProperty = vi.fn();

    applyOpportunityLayerStyles({setPaintProperty});

    expect(setPaintProperty).toHaveBeenCalledWith(
      "atlas-tract-fill",
      "fill-opacity",
      OPPORTUNITY_FILL_OPACITY,
    );
    expect(setPaintProperty).toHaveBeenCalledWith(
      "atlas-tract-line",
      "line-color",
      OPPORTUNITY_LINE_COLOR,
    );
  });

  it("sets only server-returned matching GEOIDs and clears removed matches", () => {
    const setFeatureState = vi.fn();

    synchronizeOpportunityMatchingStates(
      {setFeatureState},
      ["55079000101", "55079000201"],
      ["55079000201", "55079000301"],
    );

    expect(setFeatureState).toHaveBeenCalledWith(
      {source: "atlas-tracts", id: "55079000101"},
      {matching: false},
    );
    expect(setFeatureState).toHaveBeenCalledWith(
      {source: "atlas-tracts", id: "55079000301"},
      {matching: true},
    );
    expect(setFeatureState).not.toHaveBeenCalledWith(
      {source: "atlas-tracts", id: "55079000201"},
      expect.anything(),
    );
  });
});
