import {describe, expect, it} from "vitest";
import {loadAtlasTractProfile, selectAtlasRun} from "../src/server";

const previewConfigured = process.env.DATABASE_URL
  && process.env.MKE_ATLAS_DATA_MODE === "validated_preview"
  && process.env.MKE_ATLAS_PREVIEW_RUN_ID;

describe.skipIf(!previewConfigured)("Atlas profile repository integration", () => {
  it("traces the exact selected run through complete, insufficient, and zero-population tracts", async () => {
    const selection = await selectAtlasRun();
    expect(selection.state).toBe("selected");
    if (selection.state !== "selected") {
      return;
    }

    const complete = await loadAtlasTractProfile(selection, "55079000101");
    expect(complete.runId).toBe(selection.run.id);
    expect(complete.foodComponents).toHaveLength(4);
    expect(complete.equityDrivers).toHaveLength(13);
    expect(JSON.stringify(complete).length).toBeLessThanOrEqual(150_000);

    const insufficient = await loadAtlasTractProfile(selection, "55079187200");
    expect(insufficient.tract.qualityStatus).toBe("insufficient_data");
    expect(insufficient.foodComponents).toEqual([]);
    expect(insufficient.equityDrivers).toEqual([]);

    const zeroPopulation = await loadAtlasTractProfile(selection, "55079990000");
    expect(zeroPopulation.tract.qualityStatus).toBe("ineligible_zero_population");
    expect(zeroPopulation.tract.population).toBe(0);
  });
});
