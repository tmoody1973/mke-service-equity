import {describe, expect, it, vi} from "vitest";
import {equityIndicatorSlugs, foodMetricSlugs} from "@mke/contracts";
import {
  AtlasExportDataIntegrityError,
  buildTractEvidenceExport,
  loadTractEvidenceExport,
} from "../src/atlas/export-repository";

const hash = (character: string) => character.repeat(64);

const selectedRun = {
  state: "selected" as const,
  mode: "published" as const,
  run: {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    methodologyVersion: "food-equity-v1",
    equityBaselineMethodologyVersion: "equity-baseline-v1",
    completedAt: "2026-09-02T12:00:00.000Z",
    dataVintages: {food: "2024"},
    publication: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      publishedAt: "2026-09-02T12:00:00.000Z",
      bundleFingerprint: hash("a"),
    },
  },
  equityBaselineRunId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  foodOutputHash: hash("b"),
  equityBaselineOutputHash: hash("c"),
};

function header(geoid = "55079000101", overrides: Record<string, unknown> = {}) {
  return {
    canonical_geography_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    geoid,
    tract_name: `Census Tract ${geoid}`,
    population: 100,
    geography_vintage: "2020 TIGER/Line",
    food_score_run_id: selectedRun.run.id,
    food_geography_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    food_score_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    food_quality_status: "complete",
    food_exclusion_reasons: [],
    retail_access_score: 20,
    transportation_constraint_score: 30,
    raw_food_access_need: 25,
    food_access_need_percentile: 55,
    food_access_need_band: "moderate",
    priority: 3,
    baseline_score_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    baseline_score_run_id: selectedRun.equityBaselineRunId,
    baseline_data_vintages: {equity: "2024"},
    baseline_geography_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    baseline_quality_status: "complete",
    demographic_score: 20,
    socioeconomic_score: 30,
    health_score: 40,
    composite_score: 31,
    equity_baseline_percentile: 45,
    equity_baseline_band: "moderate",
    ...overrides,
  };
}

function equityMetric(
  slug: string,
  geoid = "55079000101",
  overrides: Record<string, unknown> = {},
) {
  return {
    geoid,
    component_id: `equity-${slug}`,
    component_score_run_id: selectedRun.equityBaselineRunId,
    component_geography_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    indicator_value_id: `value-${slug}`,
    value_geography_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    indicator_slug: slug,
    indicator_name: slug.replaceAll("_", " "),
    indicator_description: `Definition for ${slug}.`,
    indicator_unit: "percent",
    indicator_value: 0,
    margin_of_error: 1.2,
    confidence_low: 0,
    confidence_high: 1.2,
    data_year: "2024",
    value_quality_status: "verified",
    value_quality_metadata: {cv_state: "reliable", source_confidence_level: "90_percent"},
    indicator_percentile: 50,
    effective_weight: 0.1,
    contribution: 0,
    higher_is_worse: true,
    limitation: "Tract-level evidence does not describe every resident.",
    ...overrides,
  };
}

function foodMetric(
  slug: string,
  geoid = "55079000101",
  overrides: Record<string, unknown> = {},
) {
  return {
    geoid,
    component_id: `food-${slug}`,
    component_food_score_run_id: selectedRun.run.id,
    component_geography_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    access_metric_value_id: `value-${slug}`,
    value_geography_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    metric_slug: slug,
    metric_value: 0,
    metric_state: "observed",
    metric_unit: "percent",
    metric_quality_status: "verified",
    metric_quality_metadata: {},
    indicator_percentile: 50,
    effective_weight: 0.1,
    contribution: 0,
    higher_is_worse: true,
    limitation: "Tract-level evidence does not describe every resident.",
    ...overrides,
  };
}

function data(overrides: {
  headers?: Array<Record<string, unknown>>;
  equity?: Array<Record<string, unknown>>;
  food?: Array<Record<string, unknown>>;
} = {}) {
  const geoids = Array.from({length: 302}, (_, index) => String(55_079_000_101 + index));
  const headers = overrides.headers ?? geoids.map((geoid) => header(geoid));
  return {
    headers,
    equity: overrides.equity ?? geoids.flatMap((geoid) => (
      equityIndicatorSlugs.map((slug) => equityMetric(slug, geoid))
    )),
    food: overrides.food ?? geoids.flatMap((geoid) => (
      foodMetricSlugs.map((slug) => foodMetric(slug, geoid))
    )),
  };
}

describe("buildTractEvidenceExport", () => {
  it("builds one strictly pinned, complete tract row with an unavailable neighborhood when none is published", () => {
    const result = buildTractEvidenceExport(selectedRun, data(), {expectedTractCount: 302});

    expect(result.rows).toHaveLength(302);
    expect(result.rows[0]).toMatchObject({
      geoid: "55079000101",
      population: 100,
      populationState: "observed",
      neighborhood: {state: "unavailable", reason: "not_pinned_to_publication"},
      foodResults: {foodEquityPriority: 3},
    });
    expect(result.rows[0]?.equityIndicators[0]).toMatchObject({
      slug: "people_of_color",
      measurement: {value: 0},
    });
    expect(result.rows[0]?.foodMetrics[0]).toMatchObject({
      slug: "sram_snap_low_access_share_1mi",
      measurement: {value: 0},
    });
    expect(result.publication.id).toBe(selectedRun.run.publication.id);
  });

  it.each([
    ["wrong Food run", data({headers: [header("55079000101", {food_score_run_id: "11111111-1111-4111-8111-111111111111"}), ...data().headers.slice(1)]})],
    ["missing tract", data({headers: []})],
    ["duplicate Equity metric", data({equity: [
      ...data().equity.slice(0, 12),
      equityMetric("people_of_color"),
      ...data().equity.slice(13),
    ]})],
    ["wrong Equity component run", data({equity: [
      equityMetric("people_of_color", "55079000101", {component_score_run_id: "11111111-1111-4111-8111-111111111111"}),
      ...data().equity.slice(1),
    ]})],
    ["wrong Food component run", data({food: [
      foodMetric("sram_snap_low_access_share_1mi", "55079000101", {component_food_score_run_id: "11111111-1111-4111-8111-111111111111"}),
      ...data().food.slice(1),
    ]})],
  ])("rejects %s", (_name, input) => {
    expect(() => buildTractEvidenceExport(selectedRun, input, {expectedTractCount: 302}))
      .toThrow(AtlasExportDataIntegrityError);
  });
});

describe("loadTractEvidenceExport", () => {
  it("uses only the exact current publication and bounded set-based evidence reads", async () => {
    const fixture = data();
    const execute = vi.fn()
      .mockResolvedValueOnce({rows: fixture.headers})
      .mockResolvedValueOnce({rows: fixture.equity})
      .mockResolvedValueOnce({rows: fixture.food});

    const result = await loadTractEvidenceExport(
      selectedRun,
      {DATABASE_URL: "postgresql://reader.example/mke"},
      () => ({execute}),
    );

    expect(result.rows).toHaveLength(302);
    expect(execute).toHaveBeenCalledTimes(3);
    const queries = JSON.stringify(execute.mock.calls);
    expect(queries).toContain("atlas_publication_score_members");
    expect(queries).toContain("atlas_publication_equity_component_members");
    expect(queries).toContain("atlas_publication_food_component_members");
    expect(queries).not.toMatch(/order by.*published_at|latest/i);
  });
});
