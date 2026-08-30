import {
  atlasTractFeatureCollectionSchema,
  type AtlasTractFeature,
  type AtlasTractFeatureCollection,
} from "@mke/contracts";
import type {SQL} from "drizzle-orm";
import {sql} from "drizzle-orm";
import {createDatabaseClient} from "../client";
import {readRuntimeDatabaseUrl} from "../env";
import {parseAtlasMultiPolygon} from "./geometry";
import type {SelectedAtlasRun} from "./run-selector";

type AtlasEnvironment = Record<string, string | undefined>;

export const MILWAUKEE_CANONICAL_TRACT_COUNT = 302;
export const MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE = "2020 TIGER/Line";

export interface AtlasRepositoryClient {
  execute(query: SQL): PromiseLike<{rows: Array<Record<string, unknown>>}>;
}

type AtlasRepositoryClientFactory = (databaseUrl: string) => AtlasRepositoryClient;

type AtlasBuildOptions = {
  expectedCount: number;
  foodRunId: string;
  equityBaselineRunId: string;
};

export class AtlasDataIntegrityError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "AtlasDataIntegrityError";
  }
}

function fail(code: string): never {
  throw new AtlasDataIntegrityError(code);
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail(code);
  }
  return value.trim();
}

function nullableBand(value: unknown): string | null {
  return value === null ? null : requiredString(value, "invalid_score_band");
}

function nullableInteger(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fail("invalid_integer");
  }
  return value;
}

function readExclusionReasons(value: unknown): Array<string> {
  if (!Array.isArray(value) || value.some(
    (reason) => typeof reason !== "string" || reason.trim().length === 0,
  )) {
    return fail("invalid_exclusion_reasons");
  }
  return value.map((reason) => (reason as string).trim());
}

function buildFeature(row: Record<string, unknown>, options: AtlasBuildOptions): AtlasTractFeature {
  const canonicalGeographyId = requiredString(
    row.canonical_geography_id,
    "missing_canonical_geography",
  );
  const foodScoreId = requiredString(row.food_score_id, "missing_food_score");
  const baselineScoreId = requiredString(row.baseline_score_id, "missing_baseline_score");
  const foodRunId = requiredString(row.food_score_run_id, "missing_food_run");
  const baselineRunId = requiredString(row.baseline_score_run_id, "missing_baseline_run");
  const foodGeographyId = requiredString(row.food_geography_id, "missing_food_geography");
  const baselineGeographyId = requiredString(
    row.baseline_geography_id,
    "missing_baseline_geography",
  );

  if (!foodScoreId || !baselineScoreId) {
    return fail("missing_score");
  }
  if (foodRunId !== options.foodRunId) {
    return fail("wrong_food_run");
  }
  if (baselineRunId !== options.equityBaselineRunId) {
    return fail("wrong_baseline_run");
  }
  if (
    foodGeographyId !== canonicalGeographyId
    || baselineGeographyId !== canonicalGeographyId
  ) {
    return fail("score_geography_mismatch");
  }
  if (row.geometry_valid !== true) {
    return fail("invalid_geometry");
  }

  const foodBaselineBand = nullableBand(row.food_equity_baseline_band);
  const baselineBand = nullableBand(row.baseline_equity_band);
  if (foodBaselineBand !== baselineBand) {
    return fail("baseline_band_mismatch");
  }

  const population = row.population;
  if (population !== null && (typeof population !== "number" || !Number.isInteger(population))) {
    return fail("invalid_population");
  }

  return {
    type: "Feature",
    id: requiredString(row.geoid, "invalid_geoid"),
    geometry: parseAtlasMultiPolygon(row.geometry),
    properties: {
      geoid: requiredString(row.geoid, "invalid_geoid"),
      name: requiredString(row.tract_name, "invalid_tract_name"),
      population,
      geographyVintage: requiredString(row.geography_vintage, "invalid_geography_vintage"),
      foodEquityPriority: nullableInteger(row.priority),
      foodAccessNeedBand: nullableBand(row.food_access_need_band) as AtlasTractFeature["properties"]["foodAccessNeedBand"],
      equityBaselineBand: foodBaselineBand as AtlasTractFeature["properties"]["equityBaselineBand"],
      qualityStatus: requiredString(row.quality_status, "invalid_quality_status") as AtlasTractFeature["properties"]["qualityStatus"],
      exclusionReasons: readExclusionReasons(row.exclusion_reasons),
    },
  };
}

export function buildAtlasFeatureCollection(
  rows: ReadonlyArray<Record<string, unknown>>,
  options: AtlasBuildOptions,
): AtlasTractFeatureCollection {
  if (rows.length !== options.expectedCount) {
    return fail("canonical_tract_count_mismatch");
  }

  const features = rows
    .map((row) => buildFeature(row, options))
    .sort((left, right) => left.id.localeCompare(right.id));

  const parsed = atlasTractFeatureCollectionSchema.safeParse({
    type: "FeatureCollection",
    features,
  });
  if (!parsed.success) {
    return fail("invalid_atlas_contract");
  }

  return parsed.data;
}

export async function loadAtlasTracts(
  selectedRun: SelectedAtlasRun,
  environment: AtlasEnvironment = process.env,
  createClient: AtlasRepositoryClientFactory = createDatabaseClient,
): Promise<AtlasTractFeatureCollection> {
  const client = createClient(readRuntimeDatabaseUrl(environment));
  const result = await client.execute(sql`
    select
      geography.id::text as canonical_geography_id,
      geography.geoid as geoid,
      geography.name as tract_name,
      geography.population as population,
      geography.vintage as geography_vintage,
      ST_AsGeoJSON(geography.geometry)::jsonb as geometry,
      ST_IsValid(geography.geometry) as geometry_valid,
      food_score.id::text as food_score_id,
      food_score.food_score_run_id::text as food_score_run_id,
      food_score.geography_id::text as food_geography_id,
      food_score.priority as priority,
      food_score.food_access_need_band::text as food_access_need_band,
      food_score.equity_baseline_band::text as food_equity_baseline_band,
      food_score.quality_status::text as quality_status,
      food_score.exclusion_reasons as exclusion_reasons,
      baseline_score.id::text as baseline_score_id,
      baseline_score.score_run_id::text as baseline_score_run_id,
      baseline_score.geography_id::text as baseline_geography_id,
      baseline_score.equity_baseline_band::text as baseline_equity_band
    from geographies as geography
    left join food_scores as food_score
      on food_score.geography_id = geography.id
      and food_score.food_score_run_id = ${selectedRun.run.id}::uuid
    left join scores as baseline_score
      on baseline_score.id = food_score.equity_baseline_score_id
      and baseline_score.geography_id = geography.id
      and baseline_score.score_run_id = ${selectedRun.equityBaselineRunId}::uuid
    where geography.geography_type = 'tract'
      and geography.state_fips = '55'
      and geography.county_fips = '079'
      and geography.vintage = ${MILWAUKEE_CANONICAL_GEOGRAPHY_VINTAGE}
    order by geography.geoid
  `);

  return buildAtlasFeatureCollection(result.rows, {
    expectedCount: MILWAUKEE_CANONICAL_TRACT_COUNT,
    foodRunId: selectedRun.run.id,
    equityBaselineRunId: selectedRun.equityBaselineRunId,
  });
}
