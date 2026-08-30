import {
  atlasTractProfileSchema,
  type AtlasEvidenceItem,
  type AtlasMeasurement,
  type AtlasNeighborhoodContext,
  type AtlasNearestResource,
  type AtlasProvenanceItem,
  type AtlasReliabilityState,
  type AtlasTractProfile,
  type AtlasTractProperties,
} from "@mke/contracts";
import type {SQL} from "drizzle-orm";
import {sql} from "drizzle-orm";
import {createDatabaseClient} from "../client";
import {readRuntimeDatabaseUrl} from "../env";
import {MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE} from "./atlas-repository";
import {loadNeighborhoodContext} from "./neighborhood-context";
import type {SelectedAtlasRun} from "./run-selector";

type AtlasEnvironment = Record<string, string | undefined>;

export interface AtlasProfileRepositoryClient {
  execute(query: SQL): PromiseLike<{rows: Array<Record<string, unknown>>}>;
}

type AtlasProfileRepositoryClientFactory = (databaseUrl: string) => AtlasProfileRepositoryClient;

type AtlasProfileBuildOptions = {
  foodRunId: string;
  equityBaselineRunId: string;
  geoid: string;
  neighborhoodContext?: AtlasNeighborhoodContext;
};

type FoodMetricSpec = {
  definition: string;
  higherIsWorse: boolean;
  limitation: string;
  name: string;
  order: number;
};

const FOOD_METRICS: Record<string, FoodMetricSpec> = {
  sram_snap_low_access_share_1mi: {
    name: "Residents beyond one driving mile from a SNAP-authorized retailer",
    definition: "Share of tract residents who live more than one driving-network mile from any fixed-location SNAP-authorized retailer.",
    higherIsWorse: true,
    limitation: "This measure uses driving access. SNAP authorization does not mean a store is a full-service grocery.",
    order: 0,
  },
  full_service_grocery_walk_access: {
    name: "Walk to the nearest full-service grocery",
    definition: "Estimated walk from the 2020 Census tract population center to the nearest approved full-service grocery using the approved pedestrian network.",
    higherIsWorse: true,
    limitation: "This network estimate does not measure sidewalk condition, accessibility, or each household's exact trip.",
    order: 1,
  },
  households_no_vehicle: {
    name: "Households with no vehicle available",
    definition: "Share of households in the tract that report having no vehicle available.",
    higherIsWorse: true,
    limitation: "This is an American Community Survey estimate and includes a margin of error.",
    order: 2,
  },
  scheduled_transit_service_intensity: {
    name: "Scheduled transit service within a ten-minute walk",
    definition: "Lower of Tuesday and Saturday scheduled trips per hour reachable within a ten-minute network walk from the tract population center.",
    higherIsWorse: false,
    limitation: "This measures scheduled service, not reliability, travel time to a grocery, fares, crowding, or real-time performance.",
    order: 3,
  },
};

const PROFILE_LIMITATIONS = [
  "These tract-level measures describe an area. They do not describe every person who lives there.",
  "Food Equity Priority is a screening result for further investigation, not a funding or policy recommendation.",
  "Missing information is never replaced with zero, and incomplete tracts are not assigned a Priority.",
];

export class AtlasProfileDataIntegrityError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "AtlasProfileDataIntegrityError";
  }
}

function fail(code: string): never {
  throw new AtlasProfileDataIntegrityError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail(code);
  }
  return value.trim();
}

function nullableString(value: unknown, code: string): string | null {
  return value === null ? null : requiredString(value, code);
}

function nullableHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

function requiredNumber(value: unknown, code: string): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return fail(code);
  }
  return parsed;
}

function nullableNumber(value: unknown, code: string): number | null {
  return value === null ? null : requiredNumber(value, code);
}

function nullableInteger(value: unknown, code: string): number | null {
  const parsed = nullableNumber(value, code);
  if (parsed !== null && !Number.isInteger(parsed)) {
    return fail(code);
  }
  return parsed;
}

const RELIABILITY_STATES = new Set<AtlasReliabilityState>([
  "reliable",
  "use_with_caution",
  "high_uncertainty",
  "cv_not_computable",
]);

function readReliabilityMetadata(
  metadataValue: unknown,
  code: string,
): {confidenceLevel: 90 | null; reliability: AtlasReliabilityState | null} {
  if (!isRecord(metadataValue)) {
    return fail(code);
  }
  const stateValue = metadataValue.cv_state;
  const confidenceValue = metadataValue.source_confidence_level;
  if (stateValue === undefined && confidenceValue === undefined) {
    return {confidenceLevel: null, reliability: null};
  }
  if (
    typeof stateValue !== "string"
    || !RELIABILITY_STATES.has(stateValue as AtlasReliabilityState)
    || confidenceValue !== "90_percent"
  ) {
    return fail(code);
  }
  return {
    confidenceLevel: 90,
    reliability: stateValue as AtlasReliabilityState,
  };
}

function readDateTime(value: unknown, code: string): string {
  const parsed = value instanceof Date
    ? value
    : typeof value === "string"
      ? new Date(value)
      : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return fail(code);
  }
  return parsed.toISOString();
}

function readDate(value: unknown, code: string): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return fail(code);
}

function readExclusionReasons(value: unknown): Array<string> {
  if (!Array.isArray(value) || value.some(
    (reason) => typeof reason !== "string" || reason.trim().length === 0,
  )) {
    return fail("invalid_profile_exclusion_reasons");
  }
  return value.map((reason) => (reason as string).trim());
}

function readMeasurement(
  stateValue: unknown,
  value: unknown,
  unitValue: unknown,
  qualityValue: unknown,
  uncertainty: {
    confidenceLevel?: unknown;
    confidenceHigh?: unknown;
    confidenceLow?: unknown;
    marginOfError?: unknown;
    reliability?: unknown;
  } = {},
): AtlasMeasurement {
  const state = requiredString(stateValue, "invalid_measurement_state");
  const unit = requiredString(unitValue, "invalid_measurement_unit");
  const qualityStatus = requiredString(qualityValue, "invalid_measurement_quality");

  if (state === "observed") {
    const observedValue = requiredNumber(value, "invalid_observed_value");
    const marginOfError = nullableNumber(
      uncertainty.marginOfError ?? null,
      "invalid_margin_of_error",
    );
    const confidenceLevel = uncertainty.confidenceLevel === null
      || uncertainty.confidenceLevel === undefined
      ? null
      : uncertainty.confidenceLevel === 90
        ? 90 as const
        : fail("invalid_confidence_level");
    const reliabilityValue = uncertainty.reliability ?? null;
    const reliability = reliabilityValue === null
      ? null
      : typeof reliabilityValue === "string"
        && RELIABILITY_STATES.has(reliabilityValue as AtlasReliabilityState)
        ? reliabilityValue as AtlasReliabilityState
        : fail("invalid_reliability_state");
    let confidenceLow = nullableNumber(
      uncertainty.confidenceLow ?? null,
      "invalid_confidence_low",
    );
    let confidenceHigh = nullableNumber(
      uncertainty.confidenceHigh ?? null,
      "invalid_confidence_high",
    );
    if (
      confidenceLevel === 90
      && marginOfError !== null
      && confidenceLow === null
      && confidenceHigh === null
      && unit === "percent"
    ) {
      confidenceLow = Math.max(0, observedValue - marginOfError);
      confidenceHigh = Math.min(100, observedValue + marginOfError);
    }
    return {
      state,
      value: observedValue,
      unit,
      qualityStatus: qualityStatus as "verified" | "provisional" | "stale",
      marginOfError,
      confidenceLow,
      confidenceHigh,
      confidenceLevel,
      reliability,
    };
  }

  if (value !== null) {
    return fail("unavailable_measurement_has_value");
  }
  if (state === "unreachable") {
    return {
      state,
      value: null,
      unit,
      qualityStatus: qualityStatus as "verified" | "provisional" | "stale",
    };
  }
  if (state === "missing") {
    return qualityStatus === state
      ? {state, value: null, unit, qualityStatus: state}
      : fail("measurement_state_quality_mismatch");
  }
  if (state === "suppressed") {
    return qualityStatus === state
      ? {state, value: null, unit, qualityStatus: state}
      : fail("measurement_state_quality_mismatch");
  }
  if (state === "conflicting") {
    return qualityStatus === state
      ? {state, value: null, unit, qualityStatus: state}
      : fail("measurement_state_quality_mismatch");
  }
  return fail("invalid_measurement_state");
}

function readProvenance(row: Record<string, unknown>): AtlasProvenanceItem {
  return {
    sourceName: requiredString(row.source_name, "missing_source_name"),
    publisher: requiredString(row.source_publisher, "missing_source_publisher"),
    datasetVersion: requiredString(row.source_dataset_version, "missing_source_version"),
    sourceUrl: requiredString(row.source_url, "missing_source_url"),
    retrievedAt: readDateTime(row.source_retrieved_at, "invalid_source_retrieved_at"),
    validFrom: readDate(row.source_valid_from, "invalid_source_valid_from"),
    validTo: readDate(row.source_valid_to, "invalid_source_valid_to"),
    methodologyUrl: nullableHttpUrl(row.source_methodology_url),
    limitation: null,
  };
}

function provenanceKey(source: AtlasProvenanceItem): string {
  return [source.publisher, source.sourceName, source.datasetVersion, source.retrievedAt].join("|");
}

function assertSame(group: ReadonlyArray<Record<string, unknown>>, field: string, code: string) {
  const expected = group[0]?.[field];
  const signature = (value: unknown) => value instanceof Date
    ? value.toISOString()
    : isRecord(value) || Array.isArray(value)
      ? JSON.stringify(value)
      : value;
  if (group.some((row) => signature(row[field]) !== signature(expected))) {
    fail(code);
  }
  return expected;
}

function readNearestResource(
  group: ReadonlyArray<Record<string, unknown>>,
  slug: string,
): AtlasNearestResource | null {
  const resourceId = assertSame(group, "nearest_resource_id", "nearest_resource_mismatch");
  if (resourceId === null) {
    return null;
  }
  if (slug !== "full_service_grocery_walk_access") {
    return fail("nearest_resource_on_wrong_metric");
  }
  if (
    assertSame(group, "nearest_full_service_grocery", "nearest_resource_mismatch") !== true
    || assertSame(group, "nearest_category", "nearest_resource_mismatch") !== "full_service_grocery"
    || assertSame(group, "nearest_resource_source_matches", "nearest_resource_mismatch") !== true
    || assertSame(group, "nearest_resource_snapshot_linked", "nearest_resource_mismatch") !== true
  ) {
    return fail("unverified_nearest_resource_lineage");
  }
  return {
    name: requiredString(assertSame(group, "nearest_name", "nearest_resource_mismatch"), "missing_nearest_resource_name"),
    category: "full_service_grocery",
    address: nullableString(assertSame(group, "nearest_address", "nearest_resource_mismatch"), "invalid_nearest_address"),
    city: nullableString(assertSame(group, "nearest_city", "nearest_resource_mismatch"), "invalid_nearest_city"),
    postalCode: nullableString(assertSame(group, "nearest_postal_code", "nearest_resource_mismatch"), "invalid_nearest_postal_code"),
  };
}

function buildFoodEvidence(
  rows: ReadonlyArray<Record<string, unknown>>,
  options: AtlasProfileBuildOptions,
): Array<AtlasEvidenceItem> {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const componentId = requiredString(row.component_id, "missing_food_component_id");
    const group = groups.get(componentId) ?? [];
    group.push(row);
    groups.set(componentId, group);
  }

  const seenSlugs = new Set<string>();
  const evidence = [...groups.values()].map((group) => {
    const slug = requiredString(assertSame(group, "metric_slug", "food_component_mismatch"), "invalid_food_metric_slug");
    const spec = FOOD_METRICS[slug];
    if (!spec || seenSlugs.has(slug)) {
      return fail("unexpected_food_component");
    }
    seenSlugs.add(slug);

    if (
      assertSame(group, "food_score_run_id", "food_component_mismatch") !== options.foodRunId
      || assertSame(group, "component_geography_id", "food_component_mismatch")
        !== assertSame(group, "metric_geography_id", "food_component_mismatch")
    ) {
      return fail("food_component_run_or_geography_mismatch");
    }

    const snapshotIds = group.map((item) => requiredString(item.snapshot_id, "missing_food_snapshot"));
    if (new Set(snapshotIds).size !== snapshotIds.length) {
      return fail("duplicate_food_lineage");
    }
    const primarySnapshotId = requiredString(
      assertSame(group, "primary_snapshot_id", "food_component_mismatch"),
      "missing_primary_food_snapshot",
    );
    if (!snapshotIds.includes(primarySnapshotId)) {
      return fail("primary_snapshot_not_linked");
    }

    const metadata = assertSame(group, "metric_quality_metadata", "food_component_mismatch");
    if (!isRecord(metadata)) {
      return fail("invalid_food_quality_metadata");
    }
    const marginOfError = slug === "households_no_vehicle"
      ? metadata.margin_of_error ?? null
      : null;
    const uncertaintyMetadata = readReliabilityMetadata(
      metadata,
      "invalid_food_reliability_metadata",
    );
    const countyPercentile = requiredNumber(
      assertSame(group, "indicator_percentile", "food_component_mismatch"),
      "invalid_food_percentile",
    );
    const effectiveWeight = requiredNumber(
      assertSame(group, "effective_weight", "food_component_mismatch"),
      "invalid_food_weight",
    );

    return {
      slug,
      name: spec.name,
      definition: spec.definition,
      domain: requiredString(assertSame(group, "domain", "food_component_mismatch"), "invalid_food_domain"),
      dataYear: null,
      measurement: readMeasurement(
        assertSame(group, "metric_state", "food_component_mismatch"),
        assertSame(group, "metric_value", "food_component_mismatch"),
        assertSame(group, "metric_unit", "food_component_mismatch"),
        assertSame(group, "metric_quality_status", "food_component_mismatch"),
        {marginOfError, ...uncertaintyMetadata},
      ),
      countyPercentile,
      effectiveWeight,
      contribution: (countyPercentile - 50) * effectiveWeight,
      higherIsWorse: spec.higherIsWorse,
      provenance: group.map(readProvenance).sort(
        (left, right) => provenanceKey(left).localeCompare(provenanceKey(right)),
      ),
      nearestResource: readNearestResource(group, slug),
      limitation: spec.limitation,
    } satisfies AtlasEvidenceItem;
  });

  if (evidence.length !== Object.keys(FOOD_METRICS).length) {
    return fail("food_component_count_mismatch");
  }
  return evidence.sort((left, right) => FOOD_METRICS[left.slug]!.order - FOOD_METRICS[right.slug]!.order);
}

function buildEquityEvidence(
  rows: ReadonlyArray<Record<string, unknown>>,
  options: AtlasProfileBuildOptions,
): Array<AtlasEvidenceItem> {
  const componentIds = new Set<string>();
  const slugs = new Set<string>();
  const evidence = rows.map((row) => {
    const componentId = requiredString(row.component_id, "missing_equity_component_id");
    const slug = requiredString(row.indicator_slug, "invalid_equity_indicator_slug");
    if (componentIds.has(componentId) || slugs.has(slug)) {
      return fail("duplicate_equity_lineage");
    }
    componentIds.add(componentId);
    slugs.add(slug);

    if (
      row.baseline_score_run_id !== options.equityBaselineRunId
      || row.component_geography_id !== row.value_geography_id
    ) {
      return fail("equity_component_run_or_geography_mismatch");
    }
    if (row.component_quality_status !== row.value_quality_status) {
      return fail("equity_component_quality_mismatch");
    }

    const countyPercentile = requiredNumber(row.indicator_percentile, "invalid_equity_percentile");
    const effectiveWeight = requiredNumber(row.effective_weight, "invalid_equity_weight");
    const isEnglishAccess = slug === "limited_english_proficiency";
    const uncertaintyMetadata = readReliabilityMetadata(
      row.value_quality_metadata,
      "invalid_equity_reliability_metadata",
    );

    return {
      slug,
      name: isEnglishAccess
        ? "Speaks English less than ‘very well,’ age 5+"
        : requiredString(row.indicator_name, "invalid_equity_indicator_name"),
      definition: isEnglishAccess
        ? "Share of people age 5 and older who speak a language other than English at home and report speaking English less than ‘very well.’ This measures English-language access, not literacy."
        : requiredString(row.indicator_description, "invalid_equity_definition"),
      domain: requiredString(row.indicator_domain, "invalid_equity_domain"),
      dataYear: requiredString(row.data_year, "invalid_equity_data_year"),
      measurement: readMeasurement(
        row.indicator_value === null ? row.value_quality_status : "observed",
        row.indicator_value,
        row.indicator_unit,
        row.value_quality_status,
        {
          marginOfError: row.margin_of_error,
          confidenceLow: row.confidence_low,
          confidenceHigh: row.confidence_high,
          ...uncertaintyMetadata,
        },
      ),
      countyPercentile,
      effectiveWeight,
      contribution: (countyPercentile - 50) * effectiveWeight,
      higherIsWorse: row.higher_is_worse === true,
      provenance: [readProvenance(row)],
      nearestResource: null,
      limitation: isEnglishAccess
        ? "This Census estimate measures reported English-speaking ability. It does not measure reading or writing literacy."
        : null,
    } satisfies AtlasEvidenceItem;
  });

  if (evidence.length !== 13) {
    return fail("equity_component_count_mismatch");
  }
  return evidence.sort((left, right) => right.contribution - left.contribution
    || left.name.localeCompare(right.name));
}

function buildTract(row: Record<string, unknown>, options: AtlasProfileBuildOptions): AtlasTractProperties {
  const canonicalGeographyId = requiredString(row.canonical_geography_id, "missing_profile_geography");
  if (
    row.food_score_run_id !== options.foodRunId
    || row.baseline_score_run_id !== options.equityBaselineRunId
    || row.food_geography_id !== canonicalGeographyId
    || row.baseline_geography_id !== canonicalGeographyId
    || row.geoid !== options.geoid
    || row.food_equity_baseline_band !== row.baseline_equity_band
  ) {
    return fail("profile_header_mismatch");
  }

  const population = nullableInteger(row.population, "invalid_profile_population");
  return {
    geoid: requiredString(row.geoid, "invalid_profile_geoid"),
    name: requiredString(row.tract_name, "invalid_profile_name"),
    population,
    geographyVintage: requiredString(row.geography_vintage, "invalid_profile_vintage"),
    foodEquityPriority: nullableInteger(row.priority, "invalid_profile_priority"),
    foodAccessNeedBand: nullableString(row.food_access_need_band, "invalid_profile_food_band") as AtlasTractProperties["foodAccessNeedBand"],
    equityBaselineBand: nullableString(row.food_equity_baseline_band, "invalid_profile_equity_band") as AtlasTractProperties["equityBaselineBand"],
    qualityStatus: requiredString(row.food_quality_status, "invalid_profile_quality") as AtlasTractProperties["qualityStatus"],
    exclusionReasons: readExclusionReasons(row.exclusion_reasons),
  };
}

function bandLabel(value: string | null): string {
  return value?.replaceAll("_", " ") ?? "not available";
}

function explainProfile(tract: AtlasTractProperties): string {
  if (tract.qualityStatus === "ineligible_zero_population") {
    return "The approved 2020 Census tract data records no residents for this tract, so it is not scored. This is not a score of zero.";
  }
  if (tract.qualityStatus === "insufficient_data") {
    return tract.exclusionReasons.includes("origin_unsnapped")
      ? "No priority is shown because this tract's Census population center could not be connected reliably to the approved walking network. Missing data was not counted as zero."
      : "No priority is shown because one or more required measures were unavailable or did not pass the approved data checks. Missing data was not counted as zero.";
  }
  return `Priority ${tract.foodEquityPriority} is based on two measures: Food Access Need is ${bandLabel(tract.foodAccessNeedBand)}, and Equity Baseline is ${bandLabel(tract.equityBaselineBand)}. Priority 1 is the highest relative priority and Priority 5 is the lowest.`;
}

export function buildAtlasTractProfile(
  headerRows: ReadonlyArray<Record<string, unknown>>,
  foodRows: ReadonlyArray<Record<string, unknown>>,
  equityRows: ReadonlyArray<Record<string, unknown>>,
  options: AtlasProfileBuildOptions,
): AtlasTractProfile {
  if (headerRows.length !== 1) {
    return fail("profile_header_count_mismatch");
  }
  const header = headerRows[0] as Record<string, unknown>;
  const tract = buildTract(header, options);
  const complete = tract.qualityStatus === "complete";

  if (!complete && (foodRows.length > 0 || equityRows.length > 0)) {
    return fail("unexpected_incomplete_profile_components");
  }

  const foodComponents = complete ? buildFoodEvidence(foodRows, options) : [];
  const equityDrivers = complete ? buildEquityEvidence(equityRows, options) : [];
  const provenanceByKey = new Map<string, AtlasProvenanceItem>();
  for (const source of [...foodComponents, ...equityDrivers].flatMap((item) => item.provenance)) {
    provenanceByKey.set(provenanceKey(source), source);
  }

  const parsed = atlasTractProfileSchema.safeParse({
    runId: options.foodRunId,
    tract,
    explanation: explainProfile(tract),
    scores: {
      foodAccessNeedPercentile: nullableNumber(header.food_access_need_percentile, "invalid_food_need_percentile"),
      equityBaselinePercentile: nullableNumber(header.equity_baseline_percentile, "invalid_equity_percentile"),
      retailAccessScore: nullableNumber(header.retail_access_score, "invalid_retail_score"),
      transportationConstraintScore: nullableNumber(
        header.transportation_constraint_score,
        "invalid_transportation_score",
      ),
    },
    foodComponents,
    equityDrivers,
    neighborhoodContext: options.neighborhoodContext
      ?? {state: "unavailable", reason: "snapshot_not_configured"},
    context: {state: "unavailable", reason: "not_pinned_to_run"},
    provenance: [...provenanceByKey.values()].sort(
      (left, right) => provenanceKey(left).localeCompare(provenanceKey(right)),
    ),
    limitations: PROFILE_LIMITATIONS,
  });
  if (!parsed.success) {
    const issueCodes = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}:${issue.code}`)
      .join(",");
    return fail(`invalid_profile_contract:${issueCodes}`);
  }
  return parsed.data;
}

export async function loadAtlasTractProfile(
  selectedRun: SelectedAtlasRun,
  geoid: string,
  environment: AtlasEnvironment = process.env,
  createClient: AtlasProfileRepositoryClientFactory = createDatabaseClient,
): Promise<AtlasTractProfile> {
  if (!/^\d{11}$/.test(geoid)) {
    return fail("invalid_profile_geoid");
  }
  const client = createClient(readRuntimeDatabaseUrl(environment));

  const headerResult = await client.execute(sql`
    select
      geography.id::text as canonical_geography_id,
      geography.geoid as geoid,
      geography.name as tract_name,
      geography.population as population,
      geography.vintage as geography_vintage,
      food_score.food_score_run_id::text as food_score_run_id,
      food_score.geography_id::text as food_geography_id,
      food_score.priority as priority,
      food_score.food_access_need_band::text as food_access_need_band,
      food_score.equity_baseline_band::text as food_equity_baseline_band,
      food_score.quality_status::text as food_quality_status,
      food_score.exclusion_reasons as exclusion_reasons,
      food_score.retail_access_score as retail_access_score,
      food_score.transportation_constraint_score as transportation_constraint_score,
      food_score.food_access_need_percentile as food_access_need_percentile,
      baseline_score.id::text as baseline_score_id,
      baseline_score.score_run_id::text as baseline_score_run_id,
      baseline_score.geography_id::text as baseline_geography_id,
      baseline_score.equity_baseline_band::text as baseline_equity_band,
      baseline_score.equity_baseline_percentile as equity_baseline_percentile
    from geographies as geography
    join food_scores as food_score
      on food_score.geography_id = geography.id
      and food_score.food_score_run_id = ${selectedRun.run.id}::uuid
    join scores as baseline_score
      on baseline_score.id = food_score.equity_baseline_score_id
      and baseline_score.geography_id = geography.id
      and baseline_score.score_run_id = ${selectedRun.equityBaselineRunId}::uuid
    where geography.geoid = ${geoid}
      and geography.geography_type = 'tract'
      and geography.state_fips = '55'
      and geography.county_fips = '079'
      and geography.vintage = ${MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE}
    limit 2
  `);

  if (headerResult.rows.length !== 1) {
    return fail("profile_header_count_mismatch");
  }
  const neighborhoodContext = await loadNeighborhoodContext(
    client,
    selectedRun,
    geoid,
    environment,
  );
  const qualityStatus = headerResult.rows[0]?.food_quality_status;
  if (qualityStatus !== "complete") {
    return buildAtlasTractProfile(headerResult.rows, [], [], {
      foodRunId: selectedRun.run.id,
      equityBaselineRunId: selectedRun.equityBaselineRunId,
      geoid,
      neighborhoodContext,
    });
  }

  const [foodResult, equityResult] = await Promise.all([
    client.execute(sql`
      select
        component.id::text as component_id,
        component.food_score_run_id::text as food_score_run_id,
        component.geography_id::text as component_geography_id,
        metric.id::text as metric_id,
        metric.geography_id::text as metric_geography_id,
        metric.metric_slug as metric_slug,
        metric.value as metric_value,
        metric.state::text as metric_state,
        metric.unit as metric_unit,
        metric.quality_status::text as metric_quality_status,
        metric.quality_metadata as metric_quality_metadata,
        component.domain as domain,
        component.indicator_percentile as indicator_percentile,
        component.effective_weight as effective_weight,
        component.quality_status::text as component_quality_status,
        source_snapshot.id::text as snapshot_id,
        metric.primary_snapshot_id::text as primary_snapshot_id,
        source.name as source_name,
        source.publisher as source_publisher,
        source_snapshot.dataset_version as source_dataset_version,
        source.source_url as source_url,
        source_snapshot.retrieved_at as source_retrieved_at,
        source.valid_from as source_valid_from,
        source.valid_to as source_valid_to,
        source.methodology_url as source_methodology_url,
        nearest.id::text as nearest_resource_id,
        nearest.name as nearest_name,
        nearest.category::text as nearest_category,
        nearest.address as nearest_address,
        nearest.city as nearest_city,
        nearest.postal_code as nearest_postal_code,
        nearest.full_service_grocery as nearest_full_service_grocery,
        case when nearest.id is null then null
          else resource.source_id = nearest_snapshot.source_id end as nearest_resource_source_matches,
        case when nearest.id is null then null
          else exists (
            select 1 from food_access_metric_snapshots as nearest_link
            where nearest_link.access_metric_value_id = metric.id
              and nearest_link.snapshot_id = nearest.snapshot_id
          ) end as nearest_resource_snapshot_linked
      from food_score_components as component
      join food_access_metric_values as metric
        on metric.id = component.access_metric_value_id
        and metric.geography_id = component.geography_id
      join food_access_metric_snapshots as metric_snapshot
        on metric_snapshot.access_metric_value_id = metric.id
      join source_snapshots as source_snapshot on source_snapshot.id = metric_snapshot.snapshot_id
      join data_sources as source on source.id = source_snapshot.source_id
      left join food_resource_versions as nearest on nearest.id = metric.nearest_resource_version_id
      left join food_resources as resource on resource.id = nearest.resource_id
      left join source_snapshots as nearest_snapshot on nearest_snapshot.id = nearest.snapshot_id
      join geographies as geography on geography.id = component.geography_id
      where component.food_score_run_id = ${selectedRun.run.id}::uuid
        and geography.geoid = ${geoid}
      order by component.id, source_snapshot.id
    `),
    client.execute(sql`
      select
        component.id::text as component_id,
        component.score_run_id::text as baseline_score_run_id,
        component.geography_id::text as component_geography_id,
        indicator_value.id::text as indicator_value_id,
        indicator_value.geography_id::text as value_geography_id,
        definition.slug as indicator_slug,
        definition.name as indicator_name,
        definition.description as indicator_description,
        definition.domain::text as indicator_domain,
        definition.unit as indicator_unit,
        definition.higher_is_worse as higher_is_worse,
        indicator_value.value as indicator_value,
        indicator_value.margin_of_error as margin_of_error,
        indicator_value.confidence_low as confidence_low,
        indicator_value.confidence_high as confidence_high,
        indicator_value.data_year as data_year,
        indicator_value.quality_status::text as value_quality_status,
        indicator_value.quality_metadata as value_quality_metadata,
        component.indicator_percentile as indicator_percentile,
        component.effective_weight as effective_weight,
        component.quality_status::text as component_quality_status,
        source_snapshot.id::text as snapshot_id,
        source.name as source_name,
        source.publisher as source_publisher,
        source_snapshot.dataset_version as source_dataset_version,
        source.source_url as source_url,
        source_snapshot.retrieved_at as source_retrieved_at,
        source.valid_from as source_valid_from,
        source.valid_to as source_valid_to,
        source.methodology_url as source_methodology_url
      from food_scores as food_score
      join score_components as component
        on component.score_run_id = ${selectedRun.equityBaselineRunId}::uuid
        and component.geography_id = food_score.geography_id
      join indicator_values as indicator_value
        on indicator_value.id = component.indicator_value_id
        and indicator_value.geography_id = component.geography_id
      join indicator_definitions as definition on definition.id = indicator_value.indicator_id
      join source_snapshots as source_snapshot on source_snapshot.id = indicator_value.snapshot_id
      join data_sources as source on source.id = source_snapshot.source_id
      join geographies as geography on geography.id = food_score.geography_id
      where food_score.food_score_run_id = ${selectedRun.run.id}::uuid
        and food_score.equity_baseline_score_id = (
          select exact_score.id from scores as exact_score
          where exact_score.score_run_id = ${selectedRun.equityBaselineRunId}::uuid
            and exact_score.geography_id = food_score.geography_id
        )
        and geography.geoid = ${geoid}
      order by component.id
    `),
  ]);

  return buildAtlasTractProfile(headerResult.rows, foodResult.rows, equityResult.rows, {
    foodRunId: selectedRun.run.id,
    equityBaselineRunId: selectedRun.equityBaselineRunId,
    geoid,
    neighborhoodContext,
  });
}
