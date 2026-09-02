import {
  equityIndicatorSlugs,
  foodMetricSlugs,
  tractEvidenceExportSchema,
  tractEvidenceExportSchemaVersion,
  type TractEvidenceExport,
  type TractEvidenceMetric,
  type TractEvidenceRow,
} from "@mke/contracts";
import type {SQL} from "drizzle-orm";
import {sql} from "drizzle-orm";
import {createDatabaseClient} from "../client";
import {readRuntimeDatabaseUrl} from "../env";
import {
  MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE,
  MILWAUKEE_CANONICAL_TRACT_COUNT,
} from "./atlas-repository";
import type {SelectedAtlasRun} from "./run-selector";

type AtlasEnvironment = Record<string, string | undefined>;

export interface AtlasExportRepositoryClient {
  execute(query: SQL): PromiseLike<{rows: Array<Record<string, unknown>>}>;
}

type AtlasExportRepositoryClientFactory = (databaseUrl: string) => AtlasExportRepositoryClient;

export class AtlasExportDataIntegrityError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "AtlasExportDataIntegrityError";
  }
}

type ExportInput = {
  headers: ReadonlyArray<Record<string, unknown>>;
  equity: ReadonlyArray<Record<string, unknown>>;
  food: ReadonlyArray<Record<string, unknown>>;
};

type BuildOptions = {
  expectedTractCount: number;
};

const FOOD_METRIC_DETAILS: Record<string, Pick<TractEvidenceMetric, "name" | "definition" | "higherIsWorse" | "limitation">> = {
  sram_snap_low_access_share_1mi: {
    name: "Residents beyond one driving mile from a SNAP-authorized retailer",
    definition: "Share of tract residents who live more than one driving-network mile from any fixed-location SNAP-authorized retailer.",
    higherIsWorse: true,
    limitation: "This measure uses driving access. SNAP authorization does not mean a store is a full-service grocery.",
  },
  full_service_grocery_walk_access: {
    name: "Walk to the nearest full-service grocery",
    definition: "Estimated walk from the 2020 Census tract population center to the nearest approved full-service grocery using the approved pedestrian network.",
    higherIsWorse: true,
    limitation: "This network estimate does not measure sidewalk condition, accessibility, or each household's exact trip.",
  },
  households_no_vehicle: {
    name: "Households with no vehicle available",
    definition: "Share of households in the tract that report having no vehicle available.",
    higherIsWorse: true,
    limitation: "This is an American Community Survey estimate and includes a margin of error.",
  },
  scheduled_transit_service_intensity: {
    name: "Scheduled transit service within a ten-minute walk",
    definition: "Lower of Tuesday and Saturday scheduled trips per hour reachable within a ten-minute network walk from the tract population center.",
    higherIsWorse: false,
    limitation: "This measures scheduled service, not reliability, travel time to a grocery, fares, crowding, or real-time performance.",
  },
};

function fail(code: string): never {
  throw new AtlasExportDataIntegrityError(code);
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(code);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail(code);
  }
  return value.trim();
}

function nullableString(value: unknown, code: string): string | null {
  return value === null ? null : string(value, code);
}

function number(value: unknown, code: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return fail(code);
  }
  return parsed;
}

function nullableNumber(value: unknown, code: string): number | null {
  return value === null ? null : number(value, code);
}

function nullableInteger(value: unknown, code: string): number | null {
  const parsed = nullableNumber(value, code);
  if (parsed !== null && !Number.isInteger(parsed)) {
    return fail(code);
  }
  return parsed;
}

function stringArray(value: unknown, code: string): Array<string> {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    return fail(code);
  }
  return value.map((item) => (item as string).trim());
}

function dataVintages(value: unknown, code: string): Record<string, string> {
  const parsed = record(value, code);
  const entries = Object.entries(parsed);
  if (entries.some(([key, entry]) => key.trim().length === 0 || typeof entry !== "string" || entry.trim().length === 0)) {
    return fail(code);
  }
  return Object.fromEntries(entries.map(([key, entry]) => [key.trim(), (entry as string).trim()]));
}

function reliability(value: unknown, code: string): "reliable" | "use_with_caution" | "high_uncertainty" | "cv_not_computable" | null {
  const metadata = record(value, code);
  const reliabilityState = metadata.cv_state;
  const confidenceLevel = metadata.source_confidence_level;
  if (reliabilityState === undefined && confidenceLevel === undefined) {
    return null;
  }
  if (
    (reliabilityState !== "reliable" && reliabilityState !== "use_with_caution"
      && reliabilityState !== "high_uncertainty" && reliabilityState !== "cv_not_computable")
    || confidenceLevel !== "90_percent"
  ) {
    return fail(code);
  }
  return reliabilityState;
}

function equityMeasurement(row: Record<string, unknown>) {
  const qualityStatus = string(row.value_quality_status, "invalid_equity_quality_status");
  const value = nullableNumber(row.indicator_value, "invalid_equity_value");
  const unit = string(row.indicator_unit, "invalid_equity_unit");
  if (value === null) {
    if (qualityStatus !== "missing" && qualityStatus !== "suppressed" && qualityStatus !== "conflicting") {
      return fail("invalid_unavailable_equity_measurement");
    }
    if (qualityStatus === "missing") {
      return {state: "missing" as const, value: null, unit, qualityStatus: "missing" as const};
    }
    if (qualityStatus === "suppressed") {
      return {state: "suppressed" as const, value: null, unit, qualityStatus: "suppressed" as const};
    }
    return {state: "conflicting" as const, value: null, unit, qualityStatus: "conflicting" as const};
  }
  if (qualityStatus !== "verified" && qualityStatus !== "provisional" && qualityStatus !== "stale") {
    return fail("invalid_observed_equity_measurement");
  }
  const observedQualityStatus = qualityStatus as "verified" | "provisional" | "stale";
  const reliabilityState = reliability(row.value_quality_metadata, "invalid_equity_reliability");
  const marginOfError = nullableNumber(row.margin_of_error, "invalid_equity_margin_of_error");
  const confidenceLow = nullableNumber(row.confidence_low, "invalid_equity_confidence_low");
  const confidenceHigh = nullableNumber(row.confidence_high, "invalid_equity_confidence_high");
  if (reliabilityState !== null && (marginOfError === null || confidenceLow === null || confidenceHigh === null)) {
    return fail("incomplete_equity_reliability");
  }
  return {
    state: "observed" as const,
    value,
    unit,
    qualityStatus: observedQualityStatus,
    marginOfError,
    confidenceLow,
    confidenceHigh,
    confidenceLevel: reliabilityState === null ? null : 90 as const,
    reliability: reliabilityState,
  };
}

function foodMeasurement(row: Record<string, unknown>) {
  const state = string(row.metric_state, "invalid_food_metric_state");
  const qualityStatus = string(row.metric_quality_status, "invalid_food_quality_status");
  const value = nullableNumber(row.metric_value, "invalid_food_metric_value");
  const unit = string(row.metric_unit, "invalid_food_metric_unit");
  if (state === "missing" || state === "suppressed" || state === "conflicting" || state === "unreachable") {
    if (value !== null) {
      return fail("invalid_unavailable_food_measurement");
    }
    if (state === "unreachable" && (qualityStatus === "verified" || qualityStatus === "provisional" || qualityStatus === "stale")) {
      return {
        state: "unreachable" as const,
        value: null,
        unit,
        qualityStatus: qualityStatus as "verified" | "provisional" | "stale",
      };
    }
    if (state === "missing" && qualityStatus === "missing") {
      return {state: "missing" as const, value: null, unit, qualityStatus: "missing" as const};
    }
    if (state === "suppressed" && qualityStatus === "suppressed") {
      return {state: "suppressed" as const, value: null, unit, qualityStatus: "suppressed" as const};
    }
    if (state === "conflicting" && qualityStatus === "conflicting") {
      return {state: "conflicting" as const, value: null, unit, qualityStatus: "conflicting" as const};
    }
    return fail("invalid_unavailable_food_quality");
  }
  if (state !== "observed" || value === null) {
    return fail("invalid_observed_food_measurement");
  }
  if (qualityStatus !== "verified" && qualityStatus !== "provisional" && qualityStatus !== "stale") {
    return fail("invalid_observed_food_quality");
  }
  const observedQualityStatus = qualityStatus as "verified" | "provisional" | "stale";
  const metadata = record(row.metric_quality_metadata, "invalid_food_quality_metadata");
  const reliabilityState = reliability(metadata, "invalid_food_reliability");
  const marginOfError = nullableNumber(metadata.margin_of_error ?? null, "invalid_food_margin_of_error");
  const confidenceLow = nullableNumber(metadata.confidence_low ?? null, "invalid_food_confidence_low");
  const confidenceHigh = nullableNumber(metadata.confidence_high ?? null, "invalid_food_confidence_high");
  if (reliabilityState !== null && (marginOfError === null || confidenceLow === null || confidenceHigh === null)) {
    return fail("incomplete_food_reliability");
  }
  return {
    state: "observed" as const,
    value,
    unit,
    qualityStatus: observedQualityStatus,
    marginOfError,
    confidenceLow,
    confidenceHigh,
    confidenceLevel: reliabilityState === null ? null : 90 as const,
    reliability: reliabilityState,
  };
}

function contribution(row: Record<string, unknown>, code: string): number {
  const percentile = number(row.indicator_percentile, `${code}_percentile`);
  const weight = number(row.effective_weight, `${code}_weight`);
  if (percentile < 0 || percentile > 100 || weight <= 0 || weight > 1) {
    return fail(`${code}_range`);
  }
  return (percentile - 50) * weight;
}

function buildEquityMetric(row: Record<string, unknown>, selectedRun: SelectedAtlasRun): TractEvidenceMetric {
  if (
    string(row.component_score_run_id, "missing_equity_component_run") !== selectedRun.equityBaselineRunId
    || string(row.component_geography_id, "missing_equity_component_geography")
      !== string(row.value_geography_id, "missing_equity_value_geography")
  ) {
    return fail("equity_component_run_or_geography_mismatch");
  }
  const slug = string(row.indicator_slug, "invalid_equity_slug");
  const englishAccess = slug === "limited_english_proficiency";
  const percentile = number(row.indicator_percentile, "invalid_equity_percentile");
  const weight = number(row.effective_weight, "invalid_equity_weight");
  return {
    slug: slug as TractEvidenceMetric["slug"],
    name: englishAccess
      ? "Speaks English less than ‘very well,’ age 5+"
      : string(row.indicator_name, "invalid_equity_name"),
    definition: englishAccess
      ? "Share of people age 5 and older who speak a language other than English at home and report speaking English less than ‘very well.’ This measures English-language access, not literacy."
      : string(row.indicator_description, "invalid_equity_definition"),
    dataYear: string(row.data_year, "invalid_equity_data_year"),
    measurement: equityMeasurement(row),
    countyPercentile: percentile,
    effectiveWeight: weight,
    contribution: contribution(row, "equity_contribution"),
    higherIsWorse: row.higher_is_worse === true,
    limitation: englishAccess
      ? "This Census estimate measures reported English-speaking ability. It does not measure reading or writing literacy."
      : nullableString(row.limitation, "invalid_equity_limitation"),
  };
}

function buildFoodMetric(row: Record<string, unknown>, selectedRun: SelectedAtlasRun): TractEvidenceMetric {
  if (
    string(row.component_food_score_run_id, "missing_food_component_run") !== selectedRun.run.id
    || string(row.component_geography_id, "missing_food_component_geography")
      !== string(row.value_geography_id, "missing_food_value_geography")
  ) {
    return fail("food_component_run_or_geography_mismatch");
  }
  const slug = string(row.metric_slug, "invalid_food_slug");
  const details = FOOD_METRIC_DETAILS[slug];
  if (!details) {
    return fail("unexpected_food_metric");
  }
  const percentile = number(row.indicator_percentile, "invalid_food_percentile");
  const weight = number(row.effective_weight, "invalid_food_weight");
  return {
    slug: slug as TractEvidenceMetric["slug"],
    ...details,
    dataYear: row.data_year === undefined
      ? null
      : nullableString(row.data_year, "invalid_food_data_year"),
    measurement: foodMeasurement(row),
    countyPercentile: percentile,
    effectiveWeight: weight,
    contribution: contribution(row, "food_contribution"),
  };
}

function expectedFamily(
  rows: ReadonlyArray<Record<string, unknown>>,
  geoid: string,
  expectedSlugs: readonly string[],
  build: (row: Record<string, unknown>) => TractEvidenceMetric,
  code: string,
): Array<TractEvidenceMetric> {
  const matchingRows = rows.filter((row) => row.geoid === geoid);
  if (matchingRows.length !== expectedSlugs.length) {
    return fail(`${code}_count_mismatch`);
  }
  const bySlug = new Map<string, TractEvidenceMetric>();
  for (const item of matchingRows) {
    const metric = build(item);
    if (bySlug.has(metric.slug)) {
      return fail(`${code}_duplicate_slug`);
    }
    bySlug.set(metric.slug, metric);
  }
  return expectedSlugs.map((slug) => {
    const metric = bySlug.get(slug);
    return metric ?? fail(`${code}_missing_slug`);
  });
}

function buildRow(
  header: Record<string, unknown>,
  selectedRun: SelectedAtlasRun,
  input: ExportInput,
): TractEvidenceRow {
  const geographyId = string(header.canonical_geography_id, "missing_canonical_geography");
  const geoid = string(header.geoid, "invalid_export_geoid");
  if (
    string(header.food_score_run_id, "missing_food_run") !== selectedRun.run.id
    || string(header.baseline_score_run_id, "missing_baseline_run") !== selectedRun.equityBaselineRunId
    || string(header.food_geography_id, "missing_food_geography") !== geographyId
    || string(header.baseline_geography_id, "missing_baseline_geography") !== geographyId
  ) {
    return fail("export_header_run_or_geography_mismatch");
  }

  const population = nullableInteger(header.population, "invalid_export_population");
  const foodQualityStatus = string(header.food_quality_status, "invalid_food_quality") as TractEvidenceRow["foodResults"]["qualityStatus"];
  const baselineQualityStatus = string(header.baseline_quality_status, "invalid_baseline_quality") as TractEvidenceRow["equityResults"]["qualityStatus"];
  const equityIndicators = expectedFamily(
    input.equity,
    geoid,
    equityIndicatorSlugs,
    (row) => buildEquityMetric(row, selectedRun),
    "equity_metric",
  );
  const foodMetrics = expectedFamily(
    input.food,
    geoid,
    foodMetricSlugs,
    (row) => buildFoodMetric(row, selectedRun),
    "food_metric",
  );

  return {
    geoid,
    name: string(header.tract_name, "invalid_export_tract_name"),
    population,
    populationState: population === null ? "missing" : "observed",
    geographyVintage: string(header.geography_vintage, "invalid_export_geography_vintage"),
    neighborhood: {state: "unavailable", reason: "not_pinned_to_publication"},
    equityIndicators,
    equityResults: {
      demographicSubindex: nullableNumber(header.demographic_score, "invalid_demographic_score"),
      socioeconomicSubindex: nullableNumber(header.socioeconomic_score, "invalid_socioeconomic_score"),
      healthSubindex: nullableNumber(header.health_score, "invalid_health_score"),
      compositeScore: nullableNumber(header.composite_score, "invalid_equity_composite_score"),
      percentile: nullableNumber(header.equity_baseline_percentile, "invalid_equity_percentile"),
      band: nullableString(header.equity_baseline_band, "invalid_equity_band") as TractEvidenceRow["equityResults"]["band"],
      qualityStatus: baselineQualityStatus,
      exclusionReasons: baselineQualityStatus === "complete" ? [] : ["equity_score_unavailable"],
    },
    foodMetrics,
    foodResults: {
      retailAccessScore: nullableNumber(header.retail_access_score, "invalid_retail_access_score"),
      transportationConstraintScore: nullableNumber(header.transportation_constraint_score, "invalid_transportation_constraint_score"),
      foodAccessNeedScore: nullableNumber(header.raw_food_access_need, "invalid_food_access_need_score"),
      foodAccessNeedPercentile: nullableNumber(header.food_access_need_percentile, "invalid_food_access_need_percentile"),
      foodAccessNeedBand: nullableString(header.food_access_need_band, "invalid_food_access_need_band") as TractEvidenceRow["foodResults"]["foodAccessNeedBand"],
      foodEquityPriority: nullableInteger(header.priority, "invalid_food_equity_priority") as TractEvidenceRow["foodResults"]["foodEquityPriority"],
      qualityStatus: foodQualityStatus,
      exclusionReasons: stringArray(header.food_exclusion_reasons, "invalid_food_exclusion_reasons"),
    },
  };
}

export function buildTractEvidenceExport(
  selectedRun: SelectedAtlasRun,
  input: ExportInput,
  options: BuildOptions,
): TractEvidenceExport {
  if (selectedRun.mode !== "published" || selectedRun.run.publication === null) {
    return fail("export_requires_published_run");
  }
  if (input.headers.length !== options.expectedTractCount) {
    return fail("export_tract_count_mismatch");
  }

  const rows = input.headers.map((header) => buildRow(header, selectedRun, input))
    .sort((left, right) => left.geoid.localeCompare(right.geoid));
  if (new Set(rows.map((row) => row.geoid)).size !== rows.length) {
    return fail("export_duplicate_geoid");
  }

  const candidate = {
    schemaVersion: tractEvidenceExportSchemaVersion,
    publication: selectedRun.run.publication,
    foodRun: {
      id: selectedRun.run.id,
      methodologyVersion: selectedRun.run.methodologyVersion,
      outputHash: selectedRun.foodOutputHash,
      dataVintages: selectedRun.run.dataVintages,
    },
    equityBaselineRun: {
      id: selectedRun.equityBaselineRunId,
      methodologyVersion: selectedRun.run.equityBaselineMethodologyVersion,
      outputHash: selectedRun.equityBaselineOutputHash,
      dataVintages: dataVintages(input.headers[0]?.baseline_data_vintages, "invalid_baseline_data_vintages"),
    },
    rows,
  };
  const parsed = tractEvidenceExportSchema.safeParse(candidate);
  if (!parsed.success) {
    return fail("invalid_tract_evidence_export_contract");
  }
  return parsed.data;
}

export async function loadTractEvidenceExport(
  selectedRun: SelectedAtlasRun,
  environment: AtlasEnvironment = process.env,
  createClient: AtlasExportRepositoryClientFactory = createDatabaseClient,
): Promise<TractEvidenceExport> {
  if (selectedRun.mode !== "published" || selectedRun.run.publication === null) {
    return fail("export_requires_published_run");
  }
  const publicationId = selectedRun.run.publication.id;
  const client = createClient(readRuntimeDatabaseUrl(environment));
  const [headers, equity, food] = await Promise.all([
    client.execute(sql`
      select
        geography.id::text as canonical_geography_id,
        geography.geoid as geoid,
        geography.name as tract_name,
        geography.population as population,
        geography.vintage as geography_vintage,
        food_score.id::text as food_score_id,
        food_score.food_score_run_id::text as food_score_run_id,
        food_score.geography_id::text as food_geography_id,
        food_score.quality_status::text as food_quality_status,
        food_score.exclusion_reasons as food_exclusion_reasons,
        food_score.retail_access_score as retail_access_score,
        food_score.transportation_constraint_score as transportation_constraint_score,
        food_score.raw_food_access_need as raw_food_access_need,
        food_score.food_access_need_percentile as food_access_need_percentile,
        food_score.food_access_need_band::text as food_access_need_band,
        food_score.priority as priority,
        baseline_score.id::text as baseline_score_id,
        baseline_score.score_run_id::text as baseline_score_run_id,
        baseline_score.geography_id::text as baseline_geography_id,
        baseline_score.quality_status::text as baseline_quality_status,
        baseline_score.demographic_score as demographic_score,
        baseline_score.socioeconomic_score as socioeconomic_score,
        baseline_score.health_score as health_score,
        baseline_score.composite_score as composite_score,
        baseline_score.equity_baseline_percentile as equity_baseline_percentile,
        baseline_score.equity_baseline_band::text as equity_baseline_band,
        baseline_run.data_vintages as baseline_data_vintages
      from atlas_publication_score_members as publication_member
      join atlas_publications as publication
        on publication.id = publication_member.publication_id
        and publication.id = ${publicationId}::uuid
        and publication.state = 'published'
      join geographies as geography on geography.id = publication_member.geography_id
      join food_scores as food_score
        on food_score.id = publication_member.food_score_id
        and food_score.food_score_run_id = ${selectedRun.run.id}::uuid
        and food_score.geography_id = geography.id
      join scores as baseline_score
        on baseline_score.id = publication_member.equity_score_id
        and baseline_score.score_run_id = ${selectedRun.equityBaselineRunId}::uuid
        and baseline_score.geography_id = geography.id
      join score_runs as baseline_run on baseline_run.id = baseline_score.score_run_id
      where geography.geography_type = 'tract'
        and geography.state_fips = '55'
        and geography.county_fips = '079'
        and geography.vintage = ${MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE}
      order by geography.geoid
    `),
    client.execute(sql`
      select
        geography.geoid as geoid,
        component.id::text as component_id,
        component.score_run_id::text as component_score_run_id,
        component.geography_id::text as component_geography_id,
        indicator_value.id::text as indicator_value_id,
        indicator_value.geography_id::text as value_geography_id,
        definition.slug as indicator_slug,
        definition.name as indicator_name,
        definition.description as indicator_description,
        indicator_value.value as indicator_value,
        indicator_value.margin_of_error as margin_of_error,
        indicator_value.confidence_low as confidence_low,
        indicator_value.confidence_high as confidence_high,
        indicator_value.data_year as data_year,
        definition.unit as indicator_unit,
        definition.higher_is_worse as higher_is_worse,
        indicator_value.quality_status::text as value_quality_status,
        indicator_value.quality_metadata as value_quality_metadata,
        component.indicator_percentile as indicator_percentile,
        component.effective_weight as effective_weight,
        definition.methodology_notes as limitation
      from atlas_publication_equity_component_members as publication_component
      join atlas_publication_score_members as publication_score
        on publication_score.publication_id = publication_component.publication_id
      join score_components as component
        on component.id = publication_component.component_id
        and component.geography_id = publication_score.geography_id
        and component.score_run_id = ${selectedRun.equityBaselineRunId}::uuid
      join indicator_values as indicator_value
        on indicator_value.id = publication_component.indicator_value_id
        and indicator_value.id = component.indicator_value_id
        and indicator_value.geography_id = component.geography_id
      join indicator_definitions as definition on definition.id = indicator_value.indicator_id
      join geographies as geography on geography.id = component.geography_id
      where publication_component.publication_id = ${publicationId}::uuid
        and geography.geography_type = 'tract'
        and geography.state_fips = '55'
        and geography.county_fips = '079'
        and geography.vintage = ${MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE}
      order by geography.geoid, definition.slug
    `),
    client.execute(sql`
      select
        geography.geoid as geoid,
        component.id::text as component_id,
        component.food_score_run_id::text as component_food_score_run_id,
        component.geography_id::text as component_geography_id,
        metric.id::text as access_metric_value_id,
        metric.geography_id::text as value_geography_id,
        metric.metric_slug as metric_slug,
        metric.value as metric_value,
        metric.state::text as metric_state,
        metric.unit as metric_unit,
        metric.quality_status::text as metric_quality_status,
        metric.quality_metadata as metric_quality_metadata,
        component.indicator_percentile as indicator_percentile,
        component.effective_weight as effective_weight
      from atlas_publication_food_component_members as publication_component
      join atlas_publication_score_members as publication_score
        on publication_score.publication_id = publication_component.publication_id
      join food_score_components as component
        on component.id = publication_component.component_id
        and component.geography_id = publication_score.geography_id
        and component.food_score_run_id = ${selectedRun.run.id}::uuid
      join food_access_metric_values as metric
        on metric.id = publication_component.access_metric_value_id
        and metric.id = component.access_metric_value_id
        and metric.geography_id = component.geography_id
      join geographies as geography on geography.id = component.geography_id
      where publication_component.publication_id = ${publicationId}::uuid
        and geography.geography_type = 'tract'
        and geography.state_fips = '55'
        and geography.county_fips = '079'
        and geography.vintage = ${MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE}
      order by geography.geoid, metric.metric_slug
    `),
  ]);

  return buildTractEvidenceExport(selectedRun, {
    headers: headers.rows,
    equity: equity.rows,
    food: food.rows,
  }, {expectedTractCount: MILWAUKEE_CANONICAL_TRACT_COUNT});
}
