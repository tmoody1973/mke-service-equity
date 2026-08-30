import {
  atlasNeighborhoodContextSchema,
  type AtlasNeighborhoodContext,
  type AtlasNeighborhoodOverlap,
  type AtlasProvenanceItem,
} from "@mke/contracts";
import type {SQL} from "drizzle-orm";
import {sql} from "drizzle-orm";
import type {SelectedAtlasRun} from "./run-selector";

type AtlasEnvironment = Record<string, string | undefined>;

export interface NeighborhoodContextClient {
  execute(query: SQL): PromiseLike<{rows: Array<Record<string, unknown>>}>;
}

export class NeighborhoodContextIntegrityError extends Error {
  constructor(code: string) {
    super(code);
    this.name = "NeighborhoodContextIntegrityError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const limitation = "This City-published reference is not an official City or neighborhood-association boundary and is not updated continuously. Area shares describe the part of the tract covered by this reference, not its population.";

function number(value: unknown, code: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new NeighborhoodContextIntegrityError(code);
  }
  return parsed;
}

function text(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new NeighborhoodContextIntegrityError(code);
  }
  return value.trim();
}

function dateTime(value: unknown): string {
  const parsed = value instanceof Date ? value : new Date(text(value, "invalid_retrieved_at"));
  if (Number.isNaN(parsed.getTime())) {
    throw new NeighborhoodContextIntegrityError("invalid_retrieved_at");
  }
  return parsed.toISOString();
}

export function buildNeighborhoodContext(
  contextRows: ReadonlyArray<Record<string, unknown>>,
  overlapRows: ReadonlyArray<Record<string, unknown>>,
): AtlasNeighborhoodContext {
  if (contextRows.length !== 1) {
    throw new NeighborhoodContextIntegrityError("neighborhood_context_count_mismatch");
  }
  const row = contextRows[0]!;
  const coverage = number(row.city_reference_coverage, "invalid_reference_coverage");
  if (coverage < 0 || coverage > 1 || row.validation_status !== "valid") {
    throw new NeighborhoodContextIntegrityError("invalid_neighborhood_snapshot");
  }
  const source: AtlasProvenanceItem = {
    sourceName: text(row.source_name, "invalid_neighborhood_source_name"),
    publisher: text(row.source_publisher, "invalid_neighborhood_publisher"),
    datasetVersion: text(row.dataset_version, "invalid_neighborhood_version"),
    sourceUrl: text(row.source_url, "invalid_neighborhood_source_url"),
    retrievedAt: dateTime(row.retrieved_at),
    validFrom: null,
    validTo: null,
    methodologyUrl: text(row.methodology_url, "invalid_neighborhood_methodology_url"),
    limitation,
  };

  const allOverlaps = overlapRows.map((overlap) => ({
    sourceNeighborhoodId: number(
      overlap.source_neighborhood_id,
      "invalid_source_neighborhood_id",
    ),
    name: text(overlap.name, "invalid_neighborhood_name"),
    coveredAreaShare: number(overlap.covered_area_share, "invalid_covered_area_share"),
  } satisfies AtlasNeighborhoodOverlap));
  if (allOverlaps.some((overlap) => overlap.coveredAreaShare <= 0 || overlap.coveredAreaShare > 1)) {
    throw new NeighborhoodContextIntegrityError("invalid_covered_area_share");
  }
  const sorted = [...allOverlaps].sort((left, right) =>
    right.coveredAreaShare - left.coveredAreaShare
    || left.name.localeCompare(right.name)
    || left.sourceNeighborhoodId - right.sourceNeighborhoodId);
  if (sorted.some((overlap, index) => overlap !== allOverlaps[index])) {
    throw new NeighborhoodContextIntegrityError("neighborhood_overlap_order_mismatch");
  }
  const total = allOverlaps.reduce((sum, overlap) => sum + overlap.coveredAreaShare, 0);
  if ((coverage === 0 && allOverlaps.length > 0) || (coverage > 0 && Math.abs(total - 1) > 1e-6)) {
    throw new NeighborhoodContextIntegrityError("neighborhood_overlap_sum_mismatch");
  }
  const reportable = allOverlaps.filter((overlap) => overlap.coveredAreaShare >= 0.01);
  const slivers = allOverlaps
    .filter((overlap) => overlap.coveredAreaShare < 0.01)
    .reduce((sum, overlap) => sum + overlap.coveredAreaShare, 0);
  const first = reportable[0];
  const labelKind = coverage === 0
    ? "no_reference"
    : coverage < 0.5
      ? "partly_covered"
      : first && first.coveredAreaShare >= 0.5
        ? "mostly_in"
        : "spans";
  return atlasNeighborhoodContextSchema.parse({
    state: "available",
    labelKind,
    cityReferenceCoverage: coverage,
    overlaps: reportable,
    otherBoundarySliversShare: slivers,
    source,
    limitation,
  });
}

export async function loadNeighborhoodContext(
  client: NeighborhoodContextClient,
  selectedRun: SelectedAtlasRun,
  geoid: string,
  environment: AtlasEnvironment,
): Promise<AtlasNeighborhoodContext> {
  if (selectedRun.mode === "published") {
    return {state: "unavailable", reason: "not_pinned_to_publication"};
  }
  const snapshotId = environment.MKE_ATLAS_NEIGHBORHOOD_SNAPSHOT_ID?.trim();
  if (!snapshotId || !uuidPattern.test(snapshotId)) {
    return {state: "unavailable", reason: "snapshot_not_configured"};
  }
  const [contextResult, overlapResult] = await Promise.all([
    client.execute(sql`
      select context.city_reference_coverage, snapshot.validation_status::text,
        source.name as source_name, source.publisher as source_publisher,
        snapshot.dataset_version, source.source_url, snapshot.retrieved_at,
        source.methodology_url
      from geographies geography
      join tract_neighborhood_contexts context on context.geography_id=geography.id
        and context.snapshot_id=${snapshotId}::uuid
      join source_snapshots snapshot on snapshot.id=context.snapshot_id
      join data_sources source on source.id=snapshot.source_id
      where geography.geoid=${geoid} and geography.geography_type='tract'
        and geography.vintage='2020 TIGER/Line'
      limit 2
    `),
    client.execute(sql`
      select neighborhood.source_neighborhood_id, version.name, overlap.covered_area_share
      from geographies geography
      join tract_neighborhood_overlaps overlap on overlap.geography_id=geography.id
        and overlap.snapshot_id=${snapshotId}::uuid
      join neighborhood_versions version on version.id=overlap.neighborhood_version_id
        and version.snapshot_id=overlap.snapshot_id
      join neighborhoods neighborhood on neighborhood.id=version.neighborhood_id
      where geography.geoid=${geoid} and geography.geography_type='tract'
        and geography.vintage='2020 TIGER/Line'
      order by overlap.covered_area_share desc, lower(version.name),
        neighborhood.source_neighborhood_id
    `),
  ]);
  if (contextResult.rows.length !== 1) {
    return {state: "unavailable", reason: "snapshot_not_valid"};
  }
  return buildNeighborhoodContext(contextResult.rows, overlapResult.rows);
}
