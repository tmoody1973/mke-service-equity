import {
  atlasSearchAvailableResponseSchema,
  atlasSearchQuerySchema,
  type AtlasSearchAvailableResponse,
  type AtlasSearchResult,
} from "@mke/contracts";
import type {SQL} from "drizzle-orm";
import {sql} from "drizzle-orm";
import {createDatabaseClient} from "../client";
import {readRuntimeDatabaseUrl} from "../env";
import type {SelectedAtlasRun} from "./run-selector";

type AtlasEnvironment = Record<string, string | undefined>;

export interface AtlasSearchRepositoryClient {
  execute(query: SQL): PromiseLike<{rows: Array<Record<string, unknown>>}>;
}
type AtlasSearchRepositoryClientFactory = (databaseUrl: string) => AtlasSearchRepositoryClient;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emptySnapshotId = "00000000-0000-0000-0000-000000000000";

export class AtlasSearchIntegrityError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "AtlasSearchIntegrityError";
  }
}

function requiredString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AtlasSearchIntegrityError(code);
  }
  return value.trim();
}

function requiredNumber(value: unknown, code: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AtlasSearchIntegrityError(code);
  }
  return parsed;
}

function requiredPositiveInteger(value: unknown, code: string): number {
  const parsed = requiredNumber(value, code);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new AtlasSearchIntegrityError(code);
  }
  return parsed;
}

function percentage(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

export function buildAtlasSearchResponse(
  query: string,
  rows: ReadonlyArray<Record<string, unknown>>,
  neighborhoodReferenceStatus: "available" | "unavailable",
): AtlasSearchAvailableResponse {
  const parsedQuery = atlasSearchQuerySchema.parse(query);
  const results = rows.map((row): AtlasSearchResult => {
    const kind = requiredString(row.kind, "invalid_search_kind");
    const geoid = requiredString(row.geoid, "invalid_search_geoid");
    const title = requiredString(row.title, "invalid_search_title");
    const tractName = requiredString(row.tract_name, "invalid_search_tract_name");
    if (kind === "tract") {
      return {
        id: `tract:${geoid}`,
        kind,
        geoid,
        title,
        subtitle: `Census tract ID ${geoid}`,
      };
    }
    if (kind !== "neighborhood" || neighborhoodReferenceStatus !== "available") {
      throw new AtlasSearchIntegrityError("invalid_search_kind");
    }
    const sourceNeighborhoodId = requiredPositiveInteger(
      row.source_neighborhood_id,
      "invalid_search_neighborhood_id",
    );
    const coveredAreaShare = requiredNumber(
      row.covered_area_share,
      "invalid_search_area_share",
    );
    return {
      id: `neighborhood:${sourceNeighborhoodId}:${geoid}`,
      kind,
      geoid,
      title,
      subtitle: `${tractName} · ${percentage(coveredAreaShare)} of its City-covered area`,
      sourceNeighborhoodId,
      coveredAreaShare,
    };
  });
  if (new Set(results.map((result) => result.id)).size !== results.length) {
    throw new AtlasSearchIntegrityError("duplicate_search_result");
  }
  const parsed = atlasSearchAvailableResponseSchema.safeParse({
    state: "available",
    query: parsedQuery,
    neighborhoodReferenceStatus,
    results,
  });
  if (!parsed.success) {
    throw new AtlasSearchIntegrityError("invalid_search_contract");
  }
  return parsed.data;
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function loadAtlasSearchResults(
  selectedRun: SelectedAtlasRun,
  query: string,
  environment: AtlasEnvironment = process.env,
  createClient: AtlasSearchRepositoryClientFactory = createDatabaseClient,
): Promise<AtlasSearchAvailableResponse> {
  const parsedQuery = atlasSearchQuerySchema.parse(query);
  const client = createClient(readRuntimeDatabaseUrl(environment));
  const configuredSnapshotId = selectedRun.mode === "validated_preview"
    ? environment.MKE_ATLAS_NEIGHBORHOOD_SNAPSHOT_ID?.trim()
    : undefined;
  const snapshotId = configuredSnapshotId && uuidPattern.test(configuredSnapshotId)
    ? configuredSnapshotId
    : emptySnapshotId;
  const prefix = `${escapeLike(parsedQuery)}%`;
  const [snapshotResult, searchResult] = await Promise.all([
    client.execute(sql`
      select validation_status::text
      from source_snapshots
      where id=${snapshotId}::uuid and validation_status='valid'
      limit 1
    `),
    client.execute(sql`
      with tract_results as (
        select 'tract'::text as kind, geography.geoid, geography.name as title,
          geography.name as tract_name, null::integer as source_neighborhood_id,
          null::numeric as covered_area_share,
          case
            when geography.geoid=${parsedQuery} then 0
            when lower(geography.name)=lower(${parsedQuery}) then 1
            when regexp_replace(geography.name, '[^0-9.]', '', 'g')=${parsedQuery} then 2
            else 4
          end as result_rank
        from geographies geography
        where geography.geography_type='tract'
          and geography.state_fips='55' and geography.county_fips='079'
          and geography.vintage='2020 TIGER/Line'
          and exists (
            select 1 from food_scores score
            where score.geography_id=geography.id
              and score.food_score_run_id=${selectedRun.run.id}::uuid
          )
          and (
            geography.geoid like ${prefix} escape '\\'
            or lower(geography.name) like lower(${prefix}) escape '\\'
            or regexp_replace(geography.name, '[^0-9.]', '', 'g') like ${prefix} escape '\\'
          )
      ),
      neighborhood_results as (
        select 'neighborhood'::text as kind, geography.geoid, version.name as title,
          geography.name as tract_name, neighborhood.source_neighborhood_id,
          overlap.covered_area_share,
          case when lower(version.name)=lower(${parsedQuery}) then 3 else 5 end as result_rank
        from tract_neighborhood_overlaps overlap
        join geographies geography on geography.id=overlap.geography_id
        join neighborhood_versions version on version.id=overlap.neighborhood_version_id
          and version.snapshot_id=overlap.snapshot_id
        join neighborhoods neighborhood on neighborhood.id=version.neighborhood_id
        join source_snapshots snapshot on snapshot.id=overlap.snapshot_id
          and snapshot.validation_status='valid'
        where overlap.snapshot_id=${snapshotId}::uuid
          and overlap.covered_area_share >= 0.01
          and lower(version.name) like lower(${prefix}) escape '\\'
          and exists (
            select 1 from food_scores score
            where score.geography_id=geography.id
              and score.food_score_run_id=${selectedRun.run.id}::uuid
          )
      )
      select kind, geoid, title, tract_name, source_neighborhood_id, covered_area_share
      from (
        select * from tract_results
        union all
        select * from neighborhood_results
      ) results
      order by result_rank, lower(title), geoid, source_neighborhood_id nulls first
      limit 20
    `),
  ]);
  const neighborhoodReferenceStatus = snapshotResult.rows.length === 1
    ? "available"
    : "unavailable";
  const rows = neighborhoodReferenceStatus === "available"
    ? searchResult.rows
    : searchResult.rows.filter((row) => row.kind === "tract");
  return buildAtlasSearchResponse(parsedQuery, rows, neighborhoodReferenceStatus);
}
