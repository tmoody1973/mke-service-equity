import {describe, expect, it, vi} from "vitest";
import {MILWAUKEE_COUNTY_BOUNDS, resetMilwaukeeExtent} from "./map-camera";

describe("resetMilwaukeeExtent", () => {
  it("fits the approved Milwaukee County presentation extent", () => {
    const fitBounds = vi.fn();

    resetMilwaukeeExtent({fitBounds}, true);

    expect(fitBounds).toHaveBeenCalledWith(MILWAUKEE_COUNTY_BOUNDS, {
      duration: 0,
      padding: 32,
    });
  });

  it("uses a short camera transition when reduced motion is not requested", () => {
    const fitBounds = vi.fn();

    resetMilwaukeeExtent({fitBounds}, false);

    expect(fitBounds).toHaveBeenCalledWith(MILWAUKEE_COUNTY_BOUNDS, {
      duration: 450,
      padding: 32,
    });
  });
});
