import {
  tractEvidenceCsvHeaders,
  type TractEvidenceExport,
  type TractEvidenceMetric,
  type TractEvidenceRow,
} from "@mke/contracts";

type CsvCell = boolean | number | string | null | undefined;

const formulaPrefix = /^[=+\-@\t\r]/;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) {
    return "";
  }
  const raw = typeof value === "string" ? value : String(value);
  const safe = typeof value === "string" && formulaPrefix.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll("\"", "\"\"")}"` : safe;
}

function neighborhoodSummary(row: TractEvidenceRow): string | null {
  const neighborhood = row.neighborhood;
  if (neighborhood.state !== "available") {
    return null;
  }
  if (neighborhood.labelKind === "no_reference") {
    return "No approved City neighborhood reference covers this tract.";
  }
  const names = neighborhood.overlaps.map((overlap) => overlap.name).join(", ");
  const coverage = `${(neighborhood.cityReferenceCoverage * 100).toFixed(1)}%`;
  if (neighborhood.labelKind === "mostly_in") {
    return `Mostly in ${neighborhood.overlaps[0]?.name ?? names} (${coverage} of tract area).`;
  }
  if (neighborhood.labelKind === "partly_covered") {
    return `Partly covered by the City neighborhood reference (${coverage} of tract area): ${names}.`;
  }
  return `Spans City neighborhood references (${coverage} of tract area): ${names}.`;
}

function writeMetric(
  values: Map<string, CsvCell>,
  metric: TractEvidenceMetric,
): void {
  const prefix = metric.slug;
  values.set(`${prefix}_value`, metric.measurement.value);
  values.set(`${prefix}_value_state`, metric.measurement.state);
  values.set(`${prefix}_unit`, metric.measurement.unit);
  values.set(`${prefix}_data_year`, metric.dataYear);
  values.set(`${prefix}_county_percentile`, metric.countyPercentile);
  values.set(`${prefix}_effective_weight`, metric.effectiveWeight);
  values.set(`${prefix}_contribution`, metric.contribution);
  values.set(`${prefix}_quality_status`, metric.measurement.qualityStatus);
  values.set(`${prefix}_margin_of_error`, metric.measurement.state === "observed"
    ? metric.measurement.marginOfError
    : null);
  values.set(`${prefix}_confidence_low`, metric.measurement.state === "observed"
    ? metric.measurement.confidenceLow
    : null);
  values.set(`${prefix}_confidence_high`, metric.measurement.state === "observed"
    ? metric.measurement.confidenceHigh
    : null);
  values.set(`${prefix}_confidence_level`, metric.measurement.state === "observed"
    ? metric.measurement.confidenceLevel
    : null);
  values.set(`${prefix}_reliability`, metric.measurement.state === "observed"
    ? metric.measurement.reliability
    : null);
  values.set(`${prefix}_higher_is_worse`, metric.higherIsWorse);
  values.set(`${prefix}_limitation`, metric.limitation);
}

function valuesForRow(exportData: TractEvidenceExport, row: TractEvidenceRow): Map<string, CsvCell> {
  const values = new Map<string, CsvCell>();
  values.set("geoid", row.geoid);
  values.set("tract_name", row.name);
  values.set("geography_vintage", row.geographyVintage);
  values.set("population", row.population);
  values.set("population_state", row.populationState);

  const neighborhood = row.neighborhood;
  values.set("neighborhood_state", neighborhood.state);
  values.set("neighborhood_label_kind", neighborhood.state === "available" ? neighborhood.labelKind : null);
  values.set("neighborhood_summary", neighborhoodSummary(row));
  values.set("city_reference_coverage", neighborhood.state === "available"
    ? neighborhood.cityReferenceCoverage
    : null);
  values.set("neighborhood_overlaps_json", neighborhood.state === "available"
    ? stableJson(neighborhood.overlaps)
    : null);
  values.set("other_boundary_slivers_share", neighborhood.state === "available"
    ? neighborhood.otherBoundarySliversShare
    : null);
  values.set("neighborhood_source_name", neighborhood.state === "available"
    ? neighborhood.source.sourceName
    : null);
  values.set("neighborhood_source_version", neighborhood.state === "available"
    ? neighborhood.source.datasetVersion
    : null);
  values.set("neighborhood_limitation", neighborhood.state === "available"
    ? neighborhood.limitation
    : null);

  row.equityIndicators.forEach((metric) => writeMetric(values, metric));
  values.set("equity_demographic_subindex", row.equityResults.demographicSubindex);
  values.set("equity_socioeconomic_subindex", row.equityResults.socioeconomicSubindex);
  values.set("equity_health_subindex", row.equityResults.healthSubindex);
  values.set("equity_baseline_score", row.equityResults.compositeScore);
  values.set("equity_baseline_percentile", row.equityResults.percentile);
  values.set("equity_baseline_band", row.equityResults.band);
  values.set("equity_quality_status", row.equityResults.qualityStatus);
  values.set("equity_exclusion_reasons", stableJson(row.equityResults.exclusionReasons));

  row.foodMetrics.forEach((metric) => writeMetric(values, metric));
  values.set("retail_access_score", row.foodResults.retailAccessScore);
  values.set("transportation_constraint_score", row.foodResults.transportationConstraintScore);
  values.set("food_access_need_score", row.foodResults.foodAccessNeedScore);
  values.set("food_access_need_percentile", row.foodResults.foodAccessNeedPercentile);
  values.set("food_access_need_band", row.foodResults.foodAccessNeedBand);
  values.set("food_equity_priority", row.foodResults.foodEquityPriority);
  values.set("food_quality_status", row.foodResults.qualityStatus);
  values.set("food_exclusion_reasons", stableJson(row.foodResults.exclusionReasons));

  values.set("publication_id", exportData.publication.id);
  values.set("published_at", exportData.publication.publishedAt);
  values.set("food_score_run_id", exportData.foodRun.id);
  values.set("food_methodology_version", exportData.foodRun.methodologyVersion);
  values.set("food_output_hash", exportData.foodRun.outputHash);
  values.set("equity_score_run_id", exportData.equityBaselineRun.id);
  values.set("equity_methodology_version", exportData.equityBaselineRun.methodologyVersion);
  values.set("equity_output_hash", exportData.equityBaselineRun.outputHash);
  values.set("bundle_fingerprint", exportData.publication.bundleFingerprint);
  values.set("data_vintages_json", stableJson({
    equity_baseline: exportData.equityBaselineRun.dataVintages,
    food: exportData.foodRun.dataVintages,
  }));
  values.set("source_versions_json", stableJson(exportData.sourceVersions));
  return values;
}

export function serializeTractEvidenceCsv(exportData: TractEvidenceExport): string {
  const rows = exportData.rows.map((row) => {
    const values = valuesForRow(exportData, row);
    return tractEvidenceCsvHeaders.map((header) => csvCell(values.get(header))).join(",");
  });
  return `${tractEvidenceCsvHeaders.join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

export function createTractEvidenceCsvFilename(exportData: TractEvidenceExport): string {
  const publicationDate = exportData.publication.publishedAt.slice(0, 10);
  return `mke-service-equity-tract-evidence-${publicationDate}-${exportData.publication.id}.csv`;
}
