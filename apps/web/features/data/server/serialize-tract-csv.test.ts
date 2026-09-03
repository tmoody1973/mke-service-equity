import {describe, expect, it} from "vitest";
import {tractEvidenceCsvHeaders, type TractEvidenceExport} from "@mke/contracts";
import {
  createTractEvidenceCsvFilename,
  serializeTractEvidenceCsv,
} from "./serialize-tract-csv";

function fixture(): TractEvidenceExport {
  return {
    schemaVersion: "mke-tract-evidence-csv-v1",
    publication: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      publishedAt: "2026-09-02T12:00:00.000Z",
      bundleFingerprint: "a".repeat(64),
    },
    foodRun: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      methodologyVersion: "food-equity-v1",
      outputHash: "b".repeat(64),
      dataVintages: {food: "2024"},
    },
    equityBaselineRun: {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      methodologyVersion: "equity-baseline-v1",
      outputHash: "c".repeat(64),
      dataVintages: {equity: "2024"},
    },
    sourceVersions: {city_neighborhoods: "2026-01"},
    rows: [{
      geoid: "55079000101",
      name: "=Not a formula, \"quoted\"",
      population: 0,
      populationState: "observed",
      geographyVintage: "2020 TIGER/Line",
      neighborhood: {
        state: "available",
        labelKind: "mostly_in",
        cityReferenceCoverage: 0.6,
        overlaps: [{sourceNeighborhoodId: 2, name: "North, Side", coveredAreaShare: 0.6}],
        otherBoundarySliversShare: 0,
        source: {
          sourceName: "City of Milwaukee",
          publisher: "City of Milwaukee",
          datasetVersion: "2026-01",
          sourceUrl: "https://example.gov/neighborhoods",
          retrievedAt: "2026-09-02T12:00:00.000Z",
          validFrom: null,
          validTo: null,
          methodologyUrl: null,
          limitation: "Area overlap only.",
        },
        limitation: "Area overlap only.",
      },
      equityIndicators: [{
        slug: "people_of_color",
        name: "People of color",
        definition: "Synthetic unavailable measurement for serializer coverage.",
        dataYear: null,
        measurement: {state: "missing", value: null, unit: "percent", qualityStatus: "missing"},
        countyPercentile: null,
        effectiveWeight: null,
        contribution: null,
        higherIsWorse: true,
        limitation: "No published score component exists for this unavailable score.",
      }],
      equityResults: {
        demographicSubindex: null,
        socioeconomicSubindex: null,
        healthSubindex: null,
        compositeScore: null,
        percentile: null,
        band: null,
        qualityStatus: "insufficient_data",
        exclusionReasons: ["missing_input"],
      },
      foodMetrics: [],
      foodResults: {
        retailAccessScore: null,
        transportationConstraintScore: null,
        foodAccessNeedScore: null,
        foodAccessNeedPercentile: null,
        foodAccessNeedBand: null,
        foodEquityPriority: null,
        qualityStatus: "insufficient_data",
        exclusionReasons: ["missing_input"],
      },
    }],
  } as unknown as TractEvidenceExport;
}

describe("serializeTractEvidenceCsv", () => {
  it("uses the fixed headers, CRLF rows, safe escaping, and preserves observed zero", () => {
    const csv = serializeTractEvidenceCsv(fixture());
    const [header, row, trailing] = csv.split("\r\n");

    expect(header).toBe(tractEvidenceCsvHeaders.join(","));
    expect(row).toContain("'=Not a formula");
    expect(row).toContain('"\'=Not a formula, ""quoted"""');
    expect(row).toContain(',0,observed,');
    expect(row).toContain(',missing,percent,,,,,missing,');
    expect(row).toContain('"[{""coveredAreaShare"":0.6,""name"":""North, Side"",""sourceNeighborhoodId"":2}]"');
    expect(trailing).toBe("");
  });

  it("is deterministic and names files without caller input", () => {
    const data = fixture();
    expect(serializeTractEvidenceCsv(data)).toBe(serializeTractEvidenceCsv(data));
    expect(createTractEvidenceCsvFilename(data)).toBe(
      "mke-service-equity-tract-evidence-2026-09-02-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.csv",
    );
  });
});
