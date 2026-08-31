import {describe, expect, it} from "vitest";

import {
  completeComparisonTract,
  insufficientComparisonTract,
  makeComparison,
  observedMeasurement,
  zeroPopulationComparisonTract,
} from "./comparison-test-fixture";
import {buildComparisonSummaryRows} from "./comparison-presentation";

describe("buildComparisonSummaryRows", () => {
  it("uses the approved summary-first order and preserves five-tract request order", () => {
    const tracts = Array.from({length: 5}, (_, index) => completeComparisonTract({
      geoid: `55079000${index + 1}00`,
      index,
      name: `Census Tract ${index + 1}`,
    }));
    const rows = buildComparisonSummaryRows(makeComparison(tracts));

    expect(rows.map((row) => row.label)).toEqual([
      "Population",
      "Food Equity Priority",
      "Equity Baseline",
      "Food Access Need",
      "Residents beyond one driving mile from a SNAP-authorized retailer",
      "Walk to the nearest full-service grocery",
      "Households with no vehicle available",
      "Scheduled transit service within a ten-minute walk",
    ]);
    expect(rows.every((row) => row.cells.map((cell) => cell.tractName).join("|")
      === tracts.map((tract) => tract.tract.name).join("|"))).toBe(true);
  });

  it("keeps mixed completeness, missing population, unavailable states, and observed zero explicit", () => {
    const complete = completeComparisonTract({
      geoid: "55079000101",
      index: 0,
      name: "Census Tract 1.01",
      population: null,
      metricOverrides: {
        sram_snap_low_access_share_1mi: {value: 0},
        full_service_grocery_walk_access: {
          measurement: {state: "unreachable", value: null, unit: "minutes", qualityStatus: "verified"},
        },
        households_no_vehicle: {
          measurement: {state: "suppressed", value: null, unit: "percent", qualityStatus: "suppressed"},
        },
        scheduled_transit_service_intensity: {
          measurement: {state: "conflicting", value: null, unit: "unique_trips_per_hour", qualityStatus: "conflicting"},
        },
      },
    });
    const incomplete = insufficientComparisonTract({
      geoid: "55079187200",
      name: "Census Tract 1872",
    });
    const rows = buildComparisonSummaryRows(makeComparison([complete, incomplete]));

    expect(rows[0]?.cells[0]?.primary).toBe("Population unavailable");
    expect(rows[1]?.cells[1]?.primary).toBe("Not scored — insufficient data");
    expect(rows[2]?.cells[1]).toMatchObject({primary: "High band", secondary: "72nd county percentile"});
    expect(rows[3]?.cells[1]?.primary).toBe("Not available — insufficient data");
    expect(rows[4]?.cells[0]?.primary).toBe("0%");
    expect(rows[5]?.cells[0]?.primary).toMatch(/No walking route/i);
    expect(rows[6]?.cells[0]?.primary).toBe("The source withheld this value");
    expect(rows[7]?.cells[0]?.primary).toBe("The available sources disagree");
  });

  it("shows stored uncertainty and quality as text, not only color", () => {
    const tract = completeComparisonTract({
      geoid: "55079000101",
      index: 0,
      name: "Census Tract 1.01",
      metricOverrides: {
        households_no_vehicle: {
          measurement: observedMeasurement({reliability: "high_uncertainty", value: 61.3}),
        },
      },
    });
    const rows = buildComparisonSummaryRows(makeComparison([
      tract,
      completeComparisonTract({geoid: "55079000200", index: 1, name: "Census Tract 2"}),
    ]));

    expect(rows[6]?.cells[0]).toMatchObject({
      qualityLabel: "Verified data",
      reliabilityLabel: "High uncertainty",
    });
  });

  it("does not confuse unavailable measurements or a zero-population tract with zero", () => {
    const complete = completeComparisonTract({
      geoid: "55079000101",
      index: 0,
      name: "Census Tract 1.01",
      metricOverrides: {
        sram_snap_low_access_share_1mi: {
          measurement: {state: "missing", value: null, unit: "percent", qualityStatus: "missing"},
        },
      },
    });
    const zeroPopulation = zeroPopulationComparisonTract({
      geoid: "55079990000",
      name: "Census Tract 9900",
    });
    const rows = buildComparisonSummaryRows(makeComparison([complete, zeroPopulation]));

    expect(rows[0]?.cells[1]?.primary).toBe("0");
    expect(rows[1]?.cells[1]?.primary).toBe("Not scored — no recorded population");
    expect(rows[4]?.cells[0]).toMatchObject({
      primary: "Data is not available",
      qualityLabel: "Data unavailable",
    });
    expect(rows[4]?.cells[1]?.primary).toBe("Not available — no recorded population");
  });
});
