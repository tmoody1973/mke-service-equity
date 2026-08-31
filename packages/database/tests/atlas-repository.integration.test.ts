import {describe, expect, it} from "vitest";
import {loadAtlasTracts, selectAtlasRun, serializedGeoJsonBytes} from "../src/server";

const ATLAS_GEOJSON_MAX_BYTES = 1_100_000;

const previewConfigured = process.env.DATABASE_URL
  && process.env.MKE_ATLAS_DATA_MODE === "validated_preview"
  && process.env.MKE_ATLAS_PREVIEW_RUN_ID;

describe.skipIf(!previewConfigured)("Atlas repository integration", () => {
  it("returns every canonical tract for the exact validated preview run", async () => {
    const selection = await selectAtlasRun();
    expect(selection.state).toBe("selected");
    if (selection.state !== "selected") {
      return;
    }
    expect(selection.run.id).toBe("97bd1cdf-bf96-573f-8fcf-92e8676925d4");
    expect(selection.equityBaselineRunId).toBe("502e2a04-b013-53cd-8b09-c9144862701a");

    const collection = await loadAtlasTracts(selection);

    expect(collection.features).toHaveLength(302);
    expect(new Set(collection.features.map((feature) => feature.id)).size).toBe(302);
    expect(collection.features.filter(
      (feature) => feature.properties.qualityStatus === "complete",
    )).toHaveLength(299);
    expect(collection.features.filter(
      (feature) => feature.properties.qualityStatus === "insufficient_data",
    )).toHaveLength(1);
    expect(collection.features.filter(
      (feature) => feature.properties.qualityStatus === "ineligible_zero_population",
    )).toHaveLength(2);
    expect(Object.fromEntries([1, 2, 3, 4, 5].map((priority) => [
      priority,
      collection.features.filter(
        (feature) => feature.properties.foodEquityPriority === priority,
      ).length,
    ]))).toEqual({1: 18, 2: 96, 3: 136, 4: 40, 5: 9});
    expect(serializedGeoJsonBytes(collection)).toBeLessThanOrEqual(ATLAS_GEOJSON_MAX_BYTES);
  });
});
