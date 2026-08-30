import {describe, expect, it} from "vitest";
import {loadComparison, selectAtlasRun} from "../src/server";

const previewConfigured = process.env.DATABASE_URL
  && process.env.MKE_ATLAS_DATA_MODE === "validated_preview"
  && process.env.MKE_ATLAS_PREVIEW_RUN_ID;

describe.skipIf(!previewConfigured)("Comparison repository integration", () => {
  it("loads the exact preview golden tracts without changing their evidence states", async () => {
    const selection = await selectAtlasRun();
    expect(selection.state).toBe("selected");
    if (selection.state !== "selected") {
      return;
    }

    const geoids = [
      "55079000101",
      "55079000301",
      "55079007500",
      "55079008400",
      "55079187200",
    ];
    const response = await loadComparison(selection, geoids);

    expect(response.run.id).toBe(selection.run.id);
    expect(response.tracts.map((tract) => tract.tract.geoid)).toEqual(geoids);
    expect(response.tracts.slice(0, 3).map((tract) => tract.tract.foodEquityPriority))
      .toEqual([1, 3, 5]);
    const housingBurden = response.tracts[3]?.equityIndicators.find(
      (indicator) => indicator.slug === "housing_cost_burden",
    );
    expect(housingBurden?.measurement).toMatchObject({
      state: "observed",
      confidenceLevel: 90,
      reliability: "use_with_caution",
    });
    expect(housingBurden?.countyPercentile).toBeCloseTo(97, 0);
    if (housingBurden?.measurement.state === "observed") {
      expect(housingBurden.measurement.value).toBeCloseTo(61.3, 1);
      expect(housingBurden.measurement.marginOfError).toBeCloseTo(22.5, 1);
      expect(housingBurden.measurement.confidenceLow).toBeCloseTo(38.8, 1);
      expect(housingBurden.measurement.confidenceHigh).toBeCloseTo(83.8, 1);
    }
    expect(response.tracts[4]).toMatchObject({
      tract: {
        geoid: "55079187200",
        qualityStatus: "insufficient_data",
        foodEquityPriority: null,
      },
      foodAccessMeasures: [],
      equityIndicators: [],
    });
    expect(Buffer.byteLength(JSON.stringify(response), "utf8")).toBeLessThanOrEqual(500_000);
  });

  it("keeps the approved zero-population tract explicitly unscored", async () => {
    const selection = await selectAtlasRun();
    expect(selection.state).toBe("selected");
    if (selection.state !== "selected") {
      return;
    }

    const response = await loadComparison(selection, ["55079000101", "55079990000"]);
    expect(response.tracts[1]).toMatchObject({
      tract: {
        geoid: "55079990000",
        population: 0,
        qualityStatus: "ineligible_zero_population",
        foodEquityPriority: null,
        foodAccessNeedBand: null,
        equityBaselineBand: null,
      },
      scores: {
        foodAccessNeedPercentile: null,
        equityBaselinePercentile: null,
        retailAccessScore: null,
        transportationConstraintScore: null,
      },
      foodAccessMeasures: [],
      equityIndicators: [],
    });
  });
});
