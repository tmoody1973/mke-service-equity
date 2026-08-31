import type {OpportunityAvailableResponse} from "@mke/contracts";
import {describe, expect, it} from "vitest";
import {loadComparison, loadOpportunity, selectAtlasRun} from "../src/server";

const previewConfigured = process.env.DATABASE_URL
  && process.env.MKE_ATLAS_DATA_MODE === "validated_preview"
  && process.env.MKE_ATLAS_PREVIEW_RUN_ID;

function expectCanonicalOrder(response: OpportunityAvailableResponse) {
  const ordered = [...response.matchingAreas].sort((left, right) => {
    if (left.tract.name < right.tract.name) {
      return -1;
    }
    if (left.tract.name > right.tract.name) {
      return 1;
    }
    return left.tract.geoid.localeCompare(right.tract.geoid);
  });
  expect(response.matchingAreas).toEqual(ordered);
}

describe.skipIf(!previewConfigured)("Opportunity repository integration", () => {
  it("returns all 302 exact-run tracts with stable order and explicit incomplete states", async () => {
    const selection = await selectAtlasRun();
    expect(selection.state).toBe("selected");
    if (selection.state !== "selected") {
      return;
    }

    const response = await loadOpportunity(selection, {});
    expect(response.run.id).toBe(selection.run.id);
    expect(response.summary.matchingTractCount).toBe(302);
    expect(response.summary.excludedForMissingFilterData).toBe(0);
    expect(response.matchingAreas.filter(
      (area) => area.tract.qualityStatus === "insufficient_data",
    )).toHaveLength(1);
    expect(response.matchingAreas.filter(
      (area) => area.tract.qualityStatus === "ineligible_zero_population",
    )).toHaveLength(2);
    expect(response.matchingAreas.filter((area) => area.tract.population === 0)).toHaveLength(2);
    expectCanonicalOrder(response);
    expect(Buffer.byteLength(JSON.stringify(response), "utf8")).toBeLessThanOrEqual(150_000);
  });

  it("uses OR within Priority and preserves the validated live counts", async () => {
    const selection = await selectAtlasRun();
    expect(selection.state).toBe("selected");
    if (selection.state !== "selected") {
      return;
    }

    const priorityOne = await loadOpportunity(selection, {priorities: [1]});
    const priorityOneOrTwo = await loadOpportunity(selection, {priorities: [1, 2]});
    expect(priorityOne.summary).toMatchObject({
      matchingTractCount: 18,
      excludedForMissingFilterData: 3,
    });
    expect(priorityOneOrTwo.summary).toMatchObject({
      matchingTractCount: 114,
      excludedForMissingFilterData: 3,
    });
  });

  it("keeps observed grocery zero, unreachable, and missing as separate states", async () => {
    const selection = await selectAtlasRun();
    expect(selection.state).toBe("selected");
    if (selection.state !== "selected") {
      return;
    }

    const observedOnly = await loadOpportunity(selection, {groceryWalkMinimumMinutes: 0});
    const observedOrUnreachable = await loadOpportunity(selection, {
      groceryWalkMinimumMinutes: 0,
      includeUnreachableGrocery: true,
    });
    const unreachableOnly = await loadOpportunity(selection, {includeUnreachableGrocery: true});
    expect(observedOnly.summary).toMatchObject({
      matchingTractCount: 298,
      excludedForMissingFilterData: 3,
    });
    expect(observedOrUnreachable.summary).toMatchObject({
      matchingTractCount: 299,
      excludedForMissingFilterData: 3,
    });
    expect(unreachableOnly.summary).toMatchObject({
      matchingTractCount: 1,
      excludedForMissingFilterData: 3,
    });
  });

  it("counts missing only when all other evaluable filters pass", async () => {
    const selection = await selectAtlasRun();
    expect(selection.state).toBe("selected");
    if (selection.state !== "selected") {
      return;
    }

    const equityPassTransitMissing = await loadOpportunity(selection, {
      equityBands: ["very_low"],
      transitMaximumTripsPerHour: 1_000_000,
    });
    const equityFailTransitMissing = await loadOpportunity(selection, {
      equityBands: ["very_high"],
      transitMaximumTripsPerHour: 1_000_000,
    });
    const multipleMissing = await loadOpportunity(selection, {
      equityPercentileMinimum: 0,
      foodNeedPercentileMinimum: 0,
    });
    expect(equityPassTransitMissing.summary.excludedForMissingFilterData).toBe(3);
    expect(equityFailTransitMissing.summary.excludedForMissingFilterData).toBe(2);
    expect(multipleMissing.summary).toMatchObject({
      matchingTractCount: 299,
      excludedForMissingFilterData: 3,
    });
  });

  it("applies every numeric boundary inclusively using exact stored evidence", async () => {
    const selection = await selectAtlasRun();
    expect(selection.state).toBe("selected");
    if (selection.state !== "selected") {
      return;
    }

    const targetGeoid = "55079000101";
    const comparison = await loadComparison(selection, [targetGeoid, "55079000301"]);
    const target = comparison.tracts[0]!;
    const metricValue = (slug: string) => {
      const metric = target.foodAccessMeasures.find((item) => item.slug === slug);
      expect(metric?.measurement.state).toBe("observed");
      if (metric?.measurement.state !== "observed") {
        throw new Error(`Expected observed ${slug}`);
      }
      return metric.measurement.value;
    };
    const filters = [
      {priorities: [target.tract.foodEquityPriority!]},
      {equityBands: [target.tract.equityBaselineBand!]},
      {equityPercentileMinimum: target.scores.equityBaselinePercentile!},
      {foodNeedBands: [target.tract.foodAccessNeedBand!]},
      {foodNeedPercentileMinimum: target.scores.foodAccessNeedPercentile!},
      {noVehicleMinimumPercent: metricValue("households_no_vehicle")},
      {snapLowAccessMinimumPercent: metricValue("sram_snap_low_access_share_1mi")},
      {groceryWalkMinimumMinutes: metricValue("full_service_grocery_walk_access")},
      {transitMaximumTripsPerHour: metricValue("scheduled_transit_service_intensity")},
    ];
    for (const filter of filters) {
      const response = await loadOpportunity(selection, filter);
      expect(response.matchingAreas.some((area) => area.tract.geoid === targetGeoid)).toBe(true);
    }

    const observedTransitZero = await loadOpportunity(selection, {
      transitMaximumTripsPerHour: 0,
    });
    expect(observedTransitZero.matchingAreas.some(
      (area) => area.tract.geoid === "55079000301",
    )).toBe(true);
    expect(observedTransitZero.summary.excludedForMissingFilterData).toBe(3);
  });

  it("returns an available empty result for an impossible observed threshold", async () => {
    const selection = await selectAtlasRun();
    expect(selection.state).toBe("selected");
    if (selection.state !== "selected") {
      return;
    }

    const response = await loadOpportunity(selection, {groceryWalkMinimumMinutes: 1_000_000});
    expect(response.matchingAreas).toEqual([]);
    expect(response.summary).toMatchObject({
      matchingTractCount: 0,
      knownPopulationLivingInMatchingTracts: 0,
      matchingTractsMissingPopulation: 0,
      excludedForMissingFilterData: 3,
    });
  });
});
