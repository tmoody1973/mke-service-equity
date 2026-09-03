import {z} from "zod";
import {currentAtlasPublicationSchema} from "./publication";
import {
  atlasNeighborhoodContextSchema,
  atlasMeasurementSchema,
} from "./profile";
import {
  equityBaselineBandSchema,
  foodAccessNeedBandSchema,
  foodEquityPrioritySchema,
  scoreQualityStatusSchema,
  tractGeoidSchema,
} from "./tract";

const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const boundedTextSchema = z.string().trim().min(1).max(2_000);
const nullableFiniteNumberSchema = z.number().finite().nullable();
const nullablePercentSchema = z.number().finite().min(0).max(100).nullable();

export const tractEvidenceExportSchemaVersion = "mke-tract-evidence-csv-v1" as const;

export const equityIndicatorSlugs = [
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

export const foodMetricSlugs = [
  "sram_snap_low_access_share_1mi",
  "full_service_grocery_walk_access",
  "households_no_vehicle",
  "scheduled_transit_service_intensity",
] as const;

const exportMetricSlugSchema = z.enum([...equityIndicatorSlugs, ...foodMetricSlugs]);

export type TractEvidenceColumnDefinition = {
  id: string;
  group: "tract" | "neighborhood" | "equity_indicator" | "equity_result" | "food_metric"
    | "food_result" | "release";
  label: string;
  definition: string;
};

function column(
  id: string,
  group: TractEvidenceColumnDefinition["group"],
  label: string,
  definition: string,
): TractEvidenceColumnDefinition {
  return {id, group, label, definition};
}

function metricColumns(
  slug: string,
  group: "equity_indicator" | "food_metric",
): Array<TractEvidenceColumnDefinition> {
  const label = slug.replaceAll("_", " ");
  return [
    column(`${slug}_value`, group, `${label}: value`, "Observed value; blank when unavailable."),
    column(`${slug}_value_state`, group, `${label}: value state`, "Whether the value is observed, missing, suppressed, conflicting, or unreachable."),
    column(`${slug}_unit`, group, `${label}: unit`, "Unit used for the observed value."),
    column(`${slug}_data_year`, group, `${label}: data year`, "Source period or data year."),
    column(`${slug}_county_percentile`, group, `${label}: county percentile`, "Position among Milwaukee County tracts; higher is not automatically better."),
    column(`${slug}_effective_weight`, group, `${label}: effective weight`, "Deterministic scoring weight when the metric is used."),
    column(`${slug}_contribution`, group, `${label}: contribution`, "Deterministic score contribution, not a cause or recommendation."),
    column(`${slug}_quality_status`, group, `${label}: quality status`, "Verified, provisional, stale, missing, suppressed, or conflicting."),
    column(`${slug}_margin_of_error`, group, `${label}: margin of error`, "Stored margin of error, when supplied by the source."),
    column(`${slug}_confidence_low`, group, `${label}: 90% confidence low`, "Lower bound of the stored 90% confidence range, when available."),
    column(`${slug}_confidence_high`, group, `${label}: 90% confidence high`, "Upper bound of the stored 90% confidence range, when available."),
    column(`${slug}_confidence_level`, group, `${label}: confidence level`, "Confidence level associated with the range, when available."),
    column(`${slug}_reliability`, group, `${label}: reliability`, "Reliability assessment for an ACS estimate, when available."),
    column(`${slug}_higher_is_worse`, group, `${label}: higher is worse`, "Whether a larger observed value increases measured need."),
    column(`${slug}_limitation`, group, `${label}: limitation`, "Approved limitation for interpreting this measure."),
  ];
}

export const tractEvidenceColumnRegistry: ReadonlyArray<TractEvidenceColumnDefinition> = [
  column("geoid", "tract", "Census tract ID", "Eleven-digit 2020 Census tract identifier."),
  column("tract_name", "tract", "Census tract name", "Human-readable Census tract name."),
  column("geography_vintage", "tract", "Geography vintage", "Canonical geography version used by this release."),
  column("population", "tract", "Population", "Published tract population; blank when unavailable."),
  column("population_state", "tract", "Population state", "Whether the population value is observed or unavailable."),
  column("neighborhood_state", "neighborhood", "Neighborhood reference state", "Whether the approved City reference is available for this tract."),
  column("neighborhood_label_kind", "neighborhood", "Neighborhood overlap label", "Mostly in, spans, partly covered, or no reference."),
  column("neighborhood_summary", "neighborhood", "Neighborhood overlap summary", "Plain-language area-overlap description; not a single assigned neighborhood."),
  column("city_reference_coverage", "neighborhood", "City reference coverage", "Share of tract area covered by the City neighborhood reference."),
  column("neighborhood_overlaps_json", "neighborhood", "Neighborhood overlaps", "Ordered JSON list of City neighborhood IDs, names, and tract-area shares."),
  column("other_boundary_slivers_share", "neighborhood", "Other boundary slivers", "Share of tract area in smaller City-reference overlaps not listed individually."),
  column("neighborhood_source_name", "neighborhood", "Neighborhood source", "Approved City-published neighborhood reference."),
  column("neighborhood_source_version", "neighborhood", "Neighborhood source version", "Version of the approved City neighborhood reference."),
  column("neighborhood_limitation", "neighborhood", "Neighborhood limitation", "Area overlap does not describe population or force a single neighborhood label."),
  ...equityIndicatorSlugs.flatMap((slug) => metricColumns(slug, "equity_indicator")),
  column("equity_demographic_subindex", "equity_result", "Equity demographic subindex", "Published demographic Equity Baseline subindex."),
  column("equity_socioeconomic_subindex", "equity_result", "Equity socioeconomic subindex", "Published socioeconomic Equity Baseline subindex."),
  column("equity_health_subindex", "equity_result", "Equity health subindex", "Published health Equity Baseline subindex."),
  column("equity_baseline_score", "equity_result", "Equity Baseline score", "Published composite Equity Baseline score."),
  column("equity_baseline_percentile", "equity_result", "Equity Baseline percentile", "Position among Milwaukee County tracts."),
  column("equity_baseline_band", "equity_result", "Equity Baseline band", "Very low through very high Equity Baseline need band."),
  column("equity_quality_status", "equity_result", "Equity quality status", "Whether the Equity Baseline result is complete, insufficient, or ineligible."),
  column("equity_exclusion_reasons", "equity_result", "Equity exclusion reasons", "JSON list of reasons a score is unavailable or excluded."),
  ...foodMetricSlugs.flatMap((slug) => metricColumns(slug, "food_metric")),
  column("retail_access_score", "food_result", "Retail Access score", "Published Food Equity retail-access domain score."),
  column("transportation_constraint_score", "food_result", "Transportation Constraint score", "Published Food Equity transportation-constraint domain score."),
  column("food_access_need_score", "food_result", "Food Access Need score", "Published Food Access Need score before county percentile."),
  column("food_access_need_percentile", "food_result", "Food Access Need percentile", "Position among Milwaukee County tracts."),
  column("food_access_need_band", "food_result", "Food Access Need band", "Very low through very high Food Access Need band."),
  column("food_equity_priority", "food_result", "Food Equity Priority", "Priority level from 1 to 5; a screening result, not a funding recommendation."),
  column("food_quality_status", "food_result", "Food quality status", "Whether the Food Equity result is complete, insufficient, or ineligible."),
  column("food_exclusion_reasons", "food_result", "Food exclusion reasons", "JSON list of reasons a score is unavailable or excluded."),
  column("publication_id", "release", "Publication ID", "Immutable governed public-release identifier."),
  column("published_at", "release", "Publication date", "When this governed release was published."),
  column("food_score_run_id", "release", "Food score run ID", "Exact Food Equity score run pinned by this publication."),
  column("food_methodology_version", "release", "Food methodology version", "Food Equity methodology used for this release."),
  column("food_output_hash", "release", "Food output hash", "SHA-256 identity of the Food Equity output."),
  column("equity_score_run_id", "release", "Equity score run ID", "Exact Equity Baseline score run pinned by this publication."),
  column("equity_methodology_version", "release", "Equity methodology version", "Equity Baseline methodology used for this release."),
  column("equity_output_hash", "release", "Equity output hash", "SHA-256 identity of the Equity Baseline output."),
  column("bundle_fingerprint", "release", "Publication bundle fingerprint", "SHA-256 identity of the governed publication bundle."),
  column("data_vintages_json", "release", "Data vintages", "JSON object describing deterministic source vintages used by the release."),
  column("source_versions_json", "release", "Approved source versions", "JSON object summarizing approved source versions used by the release."),
];

export const tractEvidenceCsvHeaders = tractEvidenceColumnRegistry.map((columnDefinition) => (
  columnDefinition.id
));

const tractEvidenceMetricSchema = z.strictObject({
  slug: exportMetricSlugSchema,
  name: boundedTextSchema,
  definition: boundedTextSchema,
  dataYear: boundedTextSchema.nullable(),
  measurement: atlasMeasurementSchema,
  countyPercentile: nullablePercentSchema,
  effectiveWeight: z.number().finite().positive().max(1).nullable(),
  contribution: nullableFiniteNumberSchema,
  higherIsWorse: z.boolean(),
  limitation: boundedTextSchema.nullable(),
});

function fixedMetricFamily(
  allowedSlugs: readonly [string, ...string[]],
  expectedSlugs: readonly string[],
) {
  return z.array(tractEvidenceMetricSchema).length(expectedSlugs.length).superRefine((metrics, context) => {
    metrics.forEach((metric, index) => {
      if (!allowedSlugs.includes(metric.slug)) {
        context.addIssue({
          code: "custom",
          message: "Metric does not belong to this evidence family.",
          path: [index, "slug"],
        });
      }
      if (metric.slug !== expectedSlugs[index]) {
        context.addIssue({
          code: "custom",
          message: "Metrics must use the approved stable order with no duplicate or omitted slug.",
          path: [index, "slug"],
        });
      }
    });
  });
}

const exportRunSchema = z.strictObject({
  id: z.uuid(),
  methodologyVersion: boundedTextSchema,
  outputHash: hashSchema,
  dataVintages: z.record(boundedTextSchema, boundedTextSchema),
});

const tractEvidenceRowSchema = z.strictObject({
  geoid: tractGeoidSchema,
  name: boundedTextSchema,
  population: z.number().int().nonnegative().nullable(),
  populationState: z.enum(["observed", "missing", "suppressed", "conflicting"]),
  geographyVintage: boundedTextSchema,
  neighborhood: atlasNeighborhoodContextSchema,
  equityIndicators: fixedMetricFamily(equityIndicatorSlugs, equityIndicatorSlugs),
  equityResults: z.strictObject({
    demographicSubindex: nullableFiniteNumberSchema,
    socioeconomicSubindex: nullableFiniteNumberSchema,
    healthSubindex: nullableFiniteNumberSchema,
    compositeScore: nullableFiniteNumberSchema,
    percentile: nullablePercentSchema,
    band: equityBaselineBandSchema.nullable(),
    qualityStatus: scoreQualityStatusSchema,
    exclusionReasons: z.array(boundedTextSchema),
  }),
  foodMetrics: fixedMetricFamily(foodMetricSlugs, foodMetricSlugs),
  foodResults: z.strictObject({
    retailAccessScore: nullableFiniteNumberSchema,
    transportationConstraintScore: nullableFiniteNumberSchema,
    foodAccessNeedScore: nullableFiniteNumberSchema,
    foodAccessNeedPercentile: nullablePercentSchema,
    foodAccessNeedBand: foodAccessNeedBandSchema.nullable(),
    foodEquityPriority: foodEquityPrioritySchema.nullable(),
    qualityStatus: scoreQualityStatusSchema,
    exclusionReasons: z.array(boundedTextSchema),
  }),
});

export const tractEvidenceExportSchema = z.strictObject({
  schemaVersion: z.literal(tractEvidenceExportSchemaVersion),
  publication: currentAtlasPublicationSchema,
  foodRun: exportRunSchema,
  equityBaselineRun: exportRunSchema,
  sourceVersions: z.record(boundedTextSchema, boundedTextSchema).default({}),
  rows: z.array(tractEvidenceRowSchema).length(302),
}).superRefine((value, context) => {
  for (let index = 1; index < value.rows.length; index += 1) {
    const previous = value.rows[index - 1]!;
    const current = value.rows[index]!;
    if (previous.geoid >= current.geoid) {
      context.addIssue({
        code: "custom",
        message: "Export rows must contain unique canonical GEOIDs in ascending order.",
        path: ["rows", index, "geoid"],
      });
      break;
    }
  }
});

export const tractEvidenceExportUnavailableReasonSchema = z.enum([
  "no_published_run",
  "preview_not_allowed",
  "data_incomplete",
  "export_unavailable",
]);

export const tractEvidenceExportAvailabilitySchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("available"),
    publication: currentAtlasPublicationSchema,
    tractCount: z.literal(302),
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    reason: tractEvidenceExportUnavailableReasonSchema,
  }),
]);

export type TractEvidenceExport = z.infer<typeof tractEvidenceExportSchema>;
export type TractEvidenceExportAvailability = z.infer<typeof tractEvidenceExportAvailabilitySchema>;
export type TractEvidenceMetric = z.infer<typeof tractEvidenceMetricSchema>;
export type TractEvidenceRow = z.infer<typeof tractEvidenceRowSchema>;
export type TractEvidenceExportUnavailableReason = z.infer<
  typeof tractEvidenceExportUnavailableReasonSchema
>;
