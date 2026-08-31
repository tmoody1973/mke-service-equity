import {createHash} from "node:crypto";
import {
  compareAvailableResponseSchema,
  compareRequestSchema,
  type AtlasEvidenceItem,
  type AtlasProvenanceItem,
  type CompareAvailableResponse,
  type ComparisonMetric,
  type ComparisonSource,
  type ComparisonTract,
} from "@mke/contracts";
import type {SQL} from "drizzle-orm";
import {sql} from "drizzle-orm";
import {buildAtlasTractProfile, AtlasProfileDataIntegrityError} from "../atlas/profile-repository";
import {MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE} from "../atlas/atlas-repository";
import type {SelectedAtlasRun} from "../atlas/run-selector";
import {createDatabaseClient} from "../client";
import {readRuntimeDatabaseUrl} from "../env";

type ComparisonEnvironment = Record<string, string | undefined>;

export interface ComparisonRepositoryClient {
  execute(query: SQL): PromiseLike<{rows: Array<Record<string, unknown>>}>;
}

type ComparisonRepositoryClientFactory = (databaseUrl: string) => ComparisonRepositoryClient;

const EQUITY_INDICATOR_ORDER = [
  "people_of_color",
  "limited_english_proficiency",
  "foreign_born",
  "below_200_percent_fpl",
  "unemployment",
  "less_than_high_school",
  "housing_cost_burden",
  "diagnosed_diabetes",
  "obesity",
  "current_asthma",
  "any_disability",
  "frequent_mental_distress",
  "no_leisure_time_physical_activity",
] as const;

const EQUITY_INDICATOR_POSITION = new Map<string, number>(
  EQUITY_INDICATOR_ORDER.map((slug, index) => [slug, index]),
);

export class ComparisonDataIntegrityError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "ComparisonDataIntegrityError";
  }
}

function fail(code: string): never {
  throw new ComparisonDataIntegrityError(code);
}

function rowGeoid(row: Record<string, unknown>): string {
  return typeof row.geoid === "string" && /^\d{11}$/.test(row.geoid)
    ? row.geoid
    : fail("invalid_comparison_row_geoid");
}

function groupRows(
  rows: ReadonlyArray<Record<string, unknown>>,
  requestedGeoids: ReadonlySet<string>,
): Map<string, Array<Record<string, unknown>>> {
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const geoid = rowGeoid(row);
    if (!requestedGeoids.has(geoid)) {
      fail("unexpected_comparison_evidence");
    }
    const group = groups.get(geoid) ?? [];
    group.push(row);
    groups.set(geoid, group);
  }
  return groups;
}

function provenanceKey(source: AtlasProvenanceItem): string {
  return JSON.stringify([
    source.sourceName,
    source.publisher,
    source.datasetVersion,
    source.sourceUrl,
    source.retrievedAt,
    source.validFrom,
    source.validTo,
    source.methodologyUrl,
    source.limitation,
  ]);
}

function sourceId(source: AtlasProvenanceItem): string {
  return `source:${createHash("sha256").update(provenanceKey(source)).digest("hex")}`;
}

function projectMetric(
  category: "food_access" | "equity_baseline",
  evidence: AtlasEvidenceItem,
): ComparisonMetric {
  return {
    category,
    slug: evidence.slug,
    name: evidence.name,
    definition: evidence.definition,
    domain: evidence.domain,
    dataYear: evidence.dataYear,
    measurement: evidence.measurement,
    countyPercentile: evidence.countyPercentile,
    contribution: evidence.contribution,
    higherIsWorse: evidence.higherIsWorse,
    sourceIds: [...new Set(evidence.provenance.map(sourceId))].sort(),
    limitation: evidence.limitation,
  } as ComparisonMetric;
}

export function buildComparisonResponse(
  selectedRun: SelectedAtlasRun,
  requestedGeoids: ReadonlyArray<string>,
  headerRows: ReadonlyArray<Record<string, unknown>>,
  foodRows: ReadonlyArray<Record<string, unknown>>,
  equityRows: ReadonlyArray<Record<string, unknown>>,
): CompareAvailableResponse {
  const request = compareRequestSchema.safeParse({tracts: requestedGeoids});
  if (!request.success) {
    return fail("invalid_comparison_request");
  }

  const requestedSet = new Set(request.data.tracts);
  const headersByGeoid = groupRows(headerRows, requestedSet);
  const foodByGeoid = groupRows(foodRows, requestedSet);
  const equityByGeoid = groupRows(equityRows, requestedSet);
  if (headersByGeoid.size !== request.data.tracts.length) {
    return fail("comparison_requested_tract_unavailable");
  }
  if ([...headersByGeoid.values()].some((headers) => headers.length !== 1)) {
    return fail("comparison_header_count_mismatch");
  }

  let profiles;
  try {
    profiles = request.data.tracts.map((geoid) => buildAtlasTractProfile(
      headersByGeoid.get(geoid) ?? [],
      foodByGeoid.get(geoid) ?? [],
      equityByGeoid.get(geoid) ?? [],
      {
        foodRunId: selectedRun.run.id,
        equityBaselineRunId: selectedRun.equityBaselineRunId,
        geoid,
      },
    ));
  } catch (error) {
    if (error instanceof AtlasProfileDataIntegrityError) {
      return fail(`comparison_profile_incomplete:${error.message}`);
    }
    throw error;
  }

  const sourceByKey = new Map<string, AtlasProvenanceItem>();
  for (const source of profiles.flatMap((profile) => [
    ...profile.foodComponents,
    ...profile.equityDrivers,
  ]).flatMap((evidence) => evidence.provenance)) {
    sourceByKey.set(provenanceKey(source), source);
  }
  const sources: Array<ComparisonSource> = [...sourceByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, source]) => ({id: sourceId(source), source}));

  const tracts: Array<ComparisonTract> = profiles.map((profile) => ({
    runId: profile.runId,
    tract: profile.tract,
    scores: profile.scores,
    foodAccessMeasures: profile.foodComponents.map(
      (evidence) => projectMetric("food_access", evidence),
    ) as ComparisonTract["foodAccessMeasures"],
    equityIndicators: profile.equityDrivers
      .map((evidence) => projectMetric("equity_baseline", evidence))
      .sort((left, right) => (EQUITY_INDICATOR_POSITION.get(left.slug) ?? Number.MAX_SAFE_INTEGER)
        - (EQUITY_INDICATOR_POSITION.get(right.slug) ?? Number.MAX_SAFE_INTEGER)) as ComparisonTract["equityIndicators"],
  }));

  const parsed = compareAvailableResponseSchema.safeParse({
    state: "available",
    mode: selectedRun.mode,
    run: selectedRun.run,
    request: request.data,
    tracts,
    sources,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}:${issue.code}`)
      .join(",");
    return fail(`invalid_comparison_contract:${issues}`);
  }
  return parsed.data;
}

export async function loadComparison(
  selectedRun: SelectedAtlasRun,
  requestedGeoids: ReadonlyArray<string>,
  environment: ComparisonEnvironment = process.env,
  createClient: ComparisonRepositoryClientFactory = createDatabaseClient,
): Promise<CompareAvailableResponse> {
  const request = compareRequestSchema.safeParse({tracts: requestedGeoids});
  if (!request.success) {
    return fail("invalid_comparison_request");
  }
  const client = createClient(readRuntimeDatabaseUrl(environment));
  const geoidList = () => sql.join(request.data.tracts.map((geoid) => sql`${geoid}`), sql`, `);

  const [headerResult, foodResult, equityResult] = await Promise.all([
    client.execute(sql`
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
      where geography.geoid in (${geoidList()})
        and geography.geography_type = 'tract'
        and geography.state_fips = '55'
        and geography.county_fips = '079'
        and geography.vintage = ${MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE}
      order by geography.geoid
    `),
    client.execute(sql`
      select
        geography.geoid as geoid,
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
      join food_scores as food_score
        on food_score.food_score_run_id = component.food_score_run_id
        and food_score.geography_id = component.geography_id
        and food_score.quality_status = 'complete'
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
        and geography.geoid in (${geoidList()})
      order by geography.geoid, component.id, source_snapshot.id
    `),
    client.execute(sql`
      select
        geography.geoid as geoid,
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
        and food_score.quality_status = 'complete'
        and food_score.equity_baseline_score_id = (
          select exact_score.id from scores as exact_score
          where exact_score.score_run_id = ${selectedRun.equityBaselineRunId}::uuid
            and exact_score.geography_id = food_score.geography_id
        )
        and geography.geoid in (${geoidList()})
      order by geography.geoid, component.id
    `),
  ]);

  return buildComparisonResponse(
    selectedRun,
    request.data.tracts,
    headerResult.rows,
    foodResult.rows,
    equityResult.rows,
  );
}
