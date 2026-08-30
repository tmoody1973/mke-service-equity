import {
  opportunityAvailableResponseSchema,
  opportunityFilterStateSchema,
  type OpportunityAvailableResponse,
  type OpportunityFilterState,
  type OpportunityMatchingArea,
  type OpportunitySummary,
} from "@mke/contracts";
import type {SQL} from "drizzle-orm";
import {sql} from "drizzle-orm";
import {
  MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE,
  MILWAUKEE_CANONICAL_TRACT_COUNT,
} from "../atlas/atlas-repository";
import type {SelectedAtlasRun} from "../atlas/run-selector";
import {createDatabaseClient} from "../client";
import {readRuntimeDatabaseUrl} from "../env";

type OpportunityEnvironment = Record<string, string | undefined>;

export interface OpportunityRepositoryClient {
  execute(query: SQL): PromiseLike<{rows: Array<Record<string, unknown>>}>;
}

type OpportunityRepositoryClientFactory = (databaseUrl: string) => OpportunityRepositoryClient;

export class OpportunityDataIntegrityError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "OpportunityDataIntegrityError";
  }
}

function fail(code: string): never {
  throw new OpportunityDataIntegrityError(code);
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

function requiredInteger(value: unknown, code: string): number {
  const parsed = requiredNumber(value, code);
  return Number.isInteger(parsed) ? parsed : fail(code);
}

function nullableNumber(value: unknown, code: string): number | null {
  return value === null ? null : requiredNumber(value, code);
}

function nullableInteger(value: unknown, code: string): number | null {
  const parsed = nullableNumber(value, code);
  return parsed === null || Number.isInteger(parsed) ? parsed : fail(code);
}

function readExclusionReasons(value: unknown): Array<string> {
  if (!Array.isArray(value) || value.some(
    (reason) => typeof reason !== "string" || reason.trim().length === 0,
  )) {
    return fail("invalid_opportunity_exclusion_reasons");
  }
  return value.map((reason) => (reason as string).trim());
}

function readSummary(row: Record<string, unknown>): OpportunitySummary & {
  canonicalTractCount: number;
  integrityIssueCount: number;
} {
  return {
    canonicalTractCount: requiredInteger(
      row.canonical_tract_count,
      "invalid_opportunity_canonical_count",
    ),
    integrityIssueCount: requiredInteger(
      row.integrity_issue_count,
      "invalid_opportunity_integrity_count",
    ),
    matchingTractCount: requiredInteger(
      row.matching_tract_count,
      "invalid_opportunity_matching_count",
    ),
    knownPopulationLivingInMatchingTracts: requiredInteger(
      row.known_population,
      "invalid_opportunity_population_sum",
    ),
    matchingTractsMissingPopulation: requiredInteger(
      row.matching_missing_population,
      "invalid_opportunity_missing_population_count",
    ),
    excludedForMissingFilterData: requiredInteger(
      row.excluded_missing_filter_data,
      "invalid_opportunity_missing_filter_count",
    ),
  };
}

function buildMatchingArea(
  row: Record<string, unknown>,
  selectedRun: SelectedAtlasRun,
): OpportunityMatchingArea {
  if (
    row.food_score_run_id !== selectedRun.run.id
    || row.baseline_score_run_id !== selectedRun.equityBaselineRunId
  ) {
    return fail("opportunity_run_mismatch");
  }
  return {
    runId: selectedRun.run.id,
    tract: {
      geoid: requiredString(row.geoid, "invalid_opportunity_geoid"),
      name: requiredString(row.tract_name, "invalid_opportunity_tract_name"),
      population: nullableInteger(row.population, "invalid_opportunity_population"),
      geographyVintage: requiredString(
        row.geography_vintage,
        "invalid_opportunity_geography_vintage",
      ),
      foodEquityPriority: nullableInteger(
        row.priority,
        "invalid_opportunity_priority",
      ) as OpportunityMatchingArea["tract"]["foodEquityPriority"],
      foodAccessNeedBand: nullableString(
        row.food_access_need_band,
        "invalid_opportunity_food_band",
      ) as OpportunityMatchingArea["tract"]["foodAccessNeedBand"],
      equityBaselineBand: nullableString(
        row.equity_baseline_band,
        "invalid_opportunity_equity_band",
      ) as OpportunityMatchingArea["tract"]["equityBaselineBand"],
      qualityStatus: requiredString(
        row.food_quality_status,
        "invalid_opportunity_quality_status",
      ) as OpportunityMatchingArea["tract"]["qualityStatus"],
      exclusionReasons: readExclusionReasons(row.exclusion_reasons),
    },
    scores: {
      foodAccessNeedPercentile: nullableNumber(
        row.food_access_need_percentile,
        "invalid_opportunity_food_percentile",
      ),
      equityBaselinePercentile: nullableNumber(
        row.equity_baseline_percentile,
        "invalid_opportunity_equity_percentile",
      ),
      retailAccessScore: nullableNumber(
        row.retail_access_score,
        "invalid_opportunity_retail_score",
      ),
      transportationConstraintScore: nullableNumber(
        row.transportation_constraint_score,
        "invalid_opportunity_transportation_score",
      ),
    },
  };
}

export function buildOpportunityResponse(
  selectedRun: SelectedAtlasRun,
  filtersInput: unknown,
  rows: ReadonlyArray<Record<string, unknown>>,
): OpportunityAvailableResponse {
  const filters = opportunityFilterStateSchema.safeParse(filtersInput);
  if (!filters.success) {
    return fail("invalid_opportunity_filters");
  }
  if (rows.length === 0) {
    return fail("missing_opportunity_summary");
  }

  const firstSummary = readSummary(rows[0]!);
  for (const row of rows.slice(1)) {
    if (JSON.stringify(readSummary(row)) !== JSON.stringify(firstSummary)) {
      return fail("opportunity_summary_mismatch");
    }
  }
  if (firstSummary.canonicalTractCount !== MILWAUKEE_CANONICAL_TRACT_COUNT) {
    return fail("opportunity_canonical_count_mismatch");
  }
  if (firstSummary.integrityIssueCount !== 0) {
    return fail("opportunity_evidence_incomplete");
  }

  const sentinelRows = rows.filter((row) => row.geoid === null);
  if (
    sentinelRows.length > 1
    || (sentinelRows.length === 1 && (rows.length !== 1 || firstSummary.matchingTractCount !== 0))
    || (sentinelRows.length === 0 && firstSummary.matchingTractCount === 0)
  ) {
    return fail("invalid_opportunity_summary_sentinel");
  }
  const matchingAreas = sentinelRows.length === 1
    ? []
    : rows.map((row) => buildMatchingArea(row, selectedRun));

  const parsed = opportunityAvailableResponseSchema.safeParse({
    state: "available",
    mode: selectedRun.mode,
    run: selectedRun.run,
    filters: filters.data,
    summary: {
      matchingTractCount: firstSummary.matchingTractCount,
      knownPopulationLivingInMatchingTracts:
        firstSummary.knownPopulationLivingInMatchingTracts,
      matchingTractsMissingPopulation: firstSummary.matchingTractsMissingPopulation,
      excludedForMissingFilterData: firstSummary.excludedForMissingFilterData,
    },
    matchingAreas,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}:${issue.code}`)
      .join(",");
    return fail(`invalid_opportunity_contract:${issues}`);
  }
  return parsed.data;
}

function listPredicate(column: SQL, values: ReadonlyArray<string | number>): SQL {
  if (values.length === 0) {
    return sql`true`;
  }
  return sql`case when ${column} is null then null else ${column} in (${
    sql.join(values.map((value) => sql`${value}`), sql`, `)
  }) end`;
}

function minimumPredicate(column: SQL, threshold: number | null): SQL {
  return threshold === null
    ? sql`true`
    : sql`case when ${column} is null then null else ${column} >= ${threshold} end`;
}

function observedMinimumPredicate(
  stateColumn: SQL,
  valueColumn: SQL,
  threshold: number | null,
): SQL {
  return threshold === null
    ? sql`true`
    : sql`case
        when ${stateColumn} = 'observed' then ${valueColumn} >= ${threshold}
        when ${stateColumn} is null
          or ${stateColumn} in ('missing', 'suppressed', 'conflicting') then null
        else null
      end`;
}

function observedMaximumPredicate(
  stateColumn: SQL,
  valueColumn: SQL,
  threshold: number | null,
): SQL {
  return threshold === null
    ? sql`true`
    : sql`case
        when ${stateColumn} = 'observed' then ${valueColumn} <= ${threshold}
        when ${stateColumn} is null
          or ${stateColumn} in ('missing', 'suppressed', 'conflicting') then null
        else null
      end`;
}

function groceryPredicate(filters: OpportunityFilterState): SQL {
  const active = filters.groceryWalkMinimumMinutes !== null
    || filters.includeUnreachableGrocery;
  if (!active) {
    return sql`true`;
  }
  const observedResult = filters.groceryWalkMinimumMinutes === null
    ? sql`false`
    : sql`grocery_value >= ${filters.groceryWalkMinimumMinutes}`;
  return sql`case
    when grocery_state = 'observed' then ${observedResult}
    when grocery_state = 'unreachable' then ${filters.includeUnreachableGrocery}
    when grocery_state is null
      or grocery_state in ('missing', 'suppressed', 'conflicting') then null
    else null
  end`;
}

function buildOpportunityQuery(
  selectedRun: SelectedAtlasRun,
  filters: OpportunityFilterState,
): SQL {
  const priorityMatch = listPredicate(sql`priority::integer`, filters.priorities);
  const equityBandMatch = listPredicate(
    sql`equity_baseline_band::text`,
    filters.equityBands,
  );
  const equityPercentileMatch = minimumPredicate(
    sql`equity_baseline_percentile`,
    filters.equityPercentileMinimum,
  );
  const foodBandMatch = listPredicate(
    sql`food_access_need_band::text`,
    filters.foodNeedBands,
  );
  const foodPercentileMatch = minimumPredicate(
    sql`food_access_need_percentile`,
    filters.foodNeedPercentileMinimum,
  );
  const noVehicleMatch = observedMinimumPredicate(
    sql`no_vehicle_state`,
    sql`no_vehicle_value`,
    filters.noVehicleMinimumPercent,
  );
  const snapMatch = observedMinimumPredicate(
    sql`snap_state`,
    sql`snap_value`,
    filters.snapLowAccessMinimumPercent,
  );
  const groceryMatch = groceryPredicate(filters);
  const transitMatch = observedMaximumPredicate(
    sql`transit_state`,
    sql`transit_value`,
    filters.transitMaximumTripsPerHour,
  );

  return sql`
    with canonical as (
      select geography.*
      from geographies as geography
      where geography.geography_type = 'tract'
        and geography.state_fips = '55'
        and geography.county_fips = '079'
        and geography.vintage = ${MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE}
    ),
    component_pivot as (
      select
        component.geography_id,
        count(*)::integer as component_count,
        count(*) filter (
          where metric.metric_slug = 'sram_snap_low_access_share_1mi'
        )::integer as snap_count,
        max(metric.state::text) filter (
          where metric.metric_slug = 'sram_snap_low_access_share_1mi'
        ) as snap_state,
        max(metric.value) filter (
          where metric.metric_slug = 'sram_snap_low_access_share_1mi'
        ) as snap_value,
        count(*) filter (
          where metric.metric_slug = 'full_service_grocery_walk_access'
        )::integer as grocery_count,
        max(metric.state::text) filter (
          where metric.metric_slug = 'full_service_grocery_walk_access'
        ) as grocery_state,
        max(metric.value) filter (
          where metric.metric_slug = 'full_service_grocery_walk_access'
        ) as grocery_value,
        count(*) filter (
          where metric.metric_slug = 'households_no_vehicle'
        )::integer as no_vehicle_count,
        max(metric.state::text) filter (
          where metric.metric_slug = 'households_no_vehicle'
        ) as no_vehicle_state,
        max(metric.value) filter (
          where metric.metric_slug = 'households_no_vehicle'
        ) as no_vehicle_value,
        count(*) filter (
          where metric.metric_slug = 'scheduled_transit_service_intensity'
        )::integer as transit_count,
        max(metric.state::text) filter (
          where metric.metric_slug = 'scheduled_transit_service_intensity'
        ) as transit_state,
        max(metric.value) filter (
          where metric.metric_slug = 'scheduled_transit_service_intensity'
        ) as transit_value,
        bool_and(component.quality_status = metric.quality_status)
          as component_quality_matches,
        bool_and(exists (
          select 1
          from food_access_metric_snapshots as metric_snapshot
          where metric_snapshot.access_metric_value_id = metric.id
            and metric_snapshot.snapshot_id = metric.primary_snapshot_id
        )) as primary_snapshot_linked,
        count(*) filter (where
          (metric.metric_slug in (
            'sram_snap_low_access_share_1mi',
            'households_no_vehicle'
          ) and metric.unit <> 'percent')
          or (metric.metric_slug = 'full_service_grocery_walk_access'
            and metric.unit <> 'minutes')
          or (metric.metric_slug = 'scheduled_transit_service_intensity'
            and metric.unit <> 'unique_trips_per_hour')
        )::integer as invalid_unit_count,
        count(*) filter (where
          (metric.metric_slug in (
            'sram_snap_low_access_share_1mi',
            'households_no_vehicle',
            'scheduled_transit_service_intensity'
          ) and metric.state <> 'observed')
          or (metric.metric_slug = 'full_service_grocery_walk_access'
            and metric.state not in ('observed', 'unreachable'))
        )::integer as invalid_state_count
      from food_score_components as component
      join food_access_metric_values as metric
        on metric.id = component.access_metric_value_id
        and metric.geography_id = component.geography_id
      where component.food_score_run_id = ${selectedRun.run.id}::uuid
      group by component.geography_id
    ),
    evidence as (
      select
        geography.id::text as canonical_geography_id,
        geography.geoid as geoid,
        geography.name as tract_name,
        geography.population as population,
        geography.vintage as geography_vintage,
        food_score.id::text as food_score_id,
        food_score.food_score_run_id::text as food_score_run_id,
        food_score.geography_id::text as food_geography_id,
        baseline_score.id::text as baseline_score_id,
        baseline_score.score_run_id::text as baseline_score_run_id,
        baseline_score.geography_id::text as baseline_geography_id,
        food_score.priority as priority,
        food_score.food_access_need_band::text as food_access_need_band,
        food_score.equity_baseline_band::text as equity_baseline_band,
        baseline_score.equity_baseline_band::text as baseline_equity_band,
        food_score.quality_status::text as food_quality_status,
        food_score.exclusion_reasons as exclusion_reasons,
        food_score.food_access_need_percentile as food_access_need_percentile,
        baseline_score.equity_baseline_percentile as equity_baseline_percentile,
        food_score.retail_access_score as retail_access_score,
        food_score.transportation_constraint_score as transportation_constraint_score,
        component_pivot.component_count,
        component_pivot.snap_count,
        component_pivot.snap_state,
        component_pivot.snap_value,
        component_pivot.grocery_count,
        component_pivot.grocery_state,
        component_pivot.grocery_value,
        component_pivot.no_vehicle_count,
        component_pivot.no_vehicle_state,
        component_pivot.no_vehicle_value,
        component_pivot.transit_count,
        component_pivot.transit_state,
        component_pivot.transit_value,
        component_pivot.component_quality_matches,
        component_pivot.primary_snapshot_linked,
        component_pivot.invalid_unit_count,
        component_pivot.invalid_state_count,
        case when
          food_score.id is null
          or baseline_score.id is null
          or food_score.food_score_run_id::text <> ${selectedRun.run.id}
          or baseline_score.score_run_id::text <> ${selectedRun.equityBaselineRunId}
          or food_score.geography_id <> geography.id
          or baseline_score.geography_id <> geography.id
          or food_score.equity_baseline_band is distinct from baseline_score.equity_baseline_band
          or (
            food_score.quality_status = 'complete'
            and (
              coalesce(component_pivot.component_count, 0) <> 4
              or coalesce(component_pivot.snap_count, 0) <> 1
              or coalesce(component_pivot.grocery_count, 0) <> 1
              or coalesce(component_pivot.no_vehicle_count, 0) <> 1
              or coalesce(component_pivot.transit_count, 0) <> 1
              or component_pivot.component_quality_matches is not true
              or component_pivot.primary_snapshot_linked is not true
              or coalesce(component_pivot.invalid_unit_count, 0) <> 0
              or coalesce(component_pivot.invalid_state_count, 0) <> 0
            )
          )
          or (
            food_score.quality_status <> 'complete'
            and coalesce(component_pivot.component_count, 0) <> 0
          )
          or component_pivot.snap_state = 'unreachable'
          or component_pivot.no_vehicle_state = 'unreachable'
          or component_pivot.transit_state = 'unreachable'
        then 1 else 0 end as integrity_issue
      from canonical as geography
      left join food_scores as food_score
        on food_score.geography_id = geography.id
        and food_score.food_score_run_id = ${selectedRun.run.id}::uuid
      left join scores as baseline_score
        on baseline_score.id = food_score.equity_baseline_score_id
        and baseline_score.geography_id = geography.id
        and baseline_score.score_run_id = ${selectedRun.equityBaselineRunId}::uuid
      left join component_pivot on component_pivot.geography_id = geography.id
    ),
    evaluated as (
      select
        evidence.*,
        ${priorityMatch} as priority_match,
        ${equityBandMatch} as equity_band_match,
        ${equityPercentileMatch} as equity_percentile_match,
        ${foodBandMatch} as food_band_match,
        ${foodPercentileMatch} as food_percentile_match,
        ${noVehicleMatch} as no_vehicle_match,
        ${snapMatch} as snap_match,
        ${groceryMatch} as grocery_match,
        ${transitMatch} as transit_match
      from evidence
    ),
    classified as (
      select
        evaluated.*,
        case
          when priority_match is true
            and equity_band_match is true
            and equity_percentile_match is true
            and food_band_match is true
            and food_percentile_match is true
            and no_vehicle_match is true
            and snap_match is true
            and grocery_match is true
            and transit_match is true
          then 'match'
          when priority_match is not false
            and equity_band_match is not false
            and equity_percentile_match is not false
            and food_band_match is not false
            and food_percentile_match is not false
            and no_vehicle_match is not false
            and snap_match is not false
            and grocery_match is not false
            and transit_match is not false
            and (
              priority_match is null
              or equity_band_match is null
              or equity_percentile_match is null
              or food_band_match is null
              or food_percentile_match is null
              or no_vehicle_match is null
              or snap_match is null
              or grocery_match is null
              or transit_match is null
            )
          then 'missing'
          else 'nonmatch'
        end as classification
      from evaluated
    ),
    result_summary as (
      select
        count(*)::integer as canonical_tract_count,
        coalesce(sum(integrity_issue), 0)::integer as integrity_issue_count,
        count(*) filter (where classification = 'match')::integer as matching_tract_count,
        coalesce(
          sum(population) filter (where classification = 'match'),
          0
        )::bigint as known_population,
        count(*) filter (
          where classification = 'match' and population is null
        )::integer as matching_missing_population,
        count(*) filter (
          where classification = 'missing'
        )::integer as excluded_missing_filter_data
      from classified
    ),
    matching as (
      select * from classified where classification = 'match'
    )
    select
      result_summary.*,
      matching.geoid,
      matching.tract_name,
      matching.population,
      matching.geography_vintage,
      matching.food_score_run_id,
      matching.baseline_score_run_id,
      matching.priority,
      matching.food_access_need_band,
      matching.equity_baseline_band,
      matching.food_quality_status,
      matching.exclusion_reasons,
      matching.food_access_need_percentile,
      matching.equity_baseline_percentile,
      matching.retail_access_score,
      matching.transportation_constraint_score
    from result_summary
    left join matching on true
    order by matching.tract_name collate "C", matching.geoid collate "C"
  `;
}

export async function loadOpportunity(
  selectedRun: SelectedAtlasRun,
  filtersInput: unknown,
  environment: OpportunityEnvironment = process.env,
  createClient: OpportunityRepositoryClientFactory = createDatabaseClient,
): Promise<OpportunityAvailableResponse> {
  const filters = opportunityFilterStateSchema.safeParse(filtersInput);
  if (!filters.success) {
    return fail("invalid_opportunity_filters");
  }
  const client = createClient(readRuntimeDatabaseUrl(environment));
  const result = await client.execute(buildOpportunityQuery(selectedRun, filters.data));
  return buildOpportunityResponse(selectedRun, filters.data, result.rows);
}
