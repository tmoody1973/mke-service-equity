import {z} from "zod";
import {
  atlasMeasurementSchema,
  atlasProfileScoreSummarySchema,
  atlasProvenanceItemSchema,
} from "../atlas/profile";
import {
  atlasModeSchema,
  atlasRunSummarySchema,
  atlasUnavailableReasonSchema,
} from "../atlas/run";
import {atlasTractPropertiesSchema, tractGeoidSchema} from "../atlas/tract";

export const comparisonFoodMetricSlugSchema = z.enum([
  "sram_snap_low_access_share_1mi",
  "full_service_grocery_walk_access",
  "households_no_vehicle",
  "scheduled_transit_service_intensity",
]);

export const comparisonEquityMetricSlugSchema = z.enum([
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
]);

const uniqueTractIds = (values: ReadonlyArray<string>) => new Set(values).size === values.length;

const orderedUrlTractsSchema = z.array(tractGeoidSchema).max(5).refine(uniqueTractIds, {
  message: "Comparison tract IDs must be unique.",
});

const orderedRequestTractsSchema = z.array(tractGeoidSchema).min(2).max(5).refine(
  uniqueTractIds,
  {message: "Comparison tract IDs must be unique."},
);

export const compareUrlStateSchema = z.strictObject({
  tracts: orderedUrlTractsSchema,
});

export const compareRequestSchema = z.strictObject({
  tracts: orderedRequestTractsSchema,
});

const comparisonSourceIdSchema = z.string().trim().min(1).max(200);

const sourceIdsSchema = z.array(comparisonSourceIdSchema).min(1).max(16).refine(
  (values) => new Set(values).size === values.length,
  {message: "Measure source references must be unique."},
);

const comparisonMetricShape = {
  name: z.string().trim().min(1),
  definition: z.string().trim().min(1),
  domain: z.string().trim().min(1),
  dataYear: z.string().trim().min(1).nullable(),
  measurement: atlasMeasurementSchema,
  countyPercentile: z.number().finite().min(0).max(100),
  contribution: z.number().finite().nullable(),
  higherIsWorse: z.boolean(),
  sourceIds: sourceIdsSchema,
  limitation: z.string().trim().min(1).nullable(),
} as const;

export const comparisonFoodMetricSchema = z.strictObject({
  ...comparisonMetricShape,
  category: z.literal("food_access"),
  slug: comparisonFoodMetricSlugSchema,
});

export const comparisonEquityMetricSchema = z.strictObject({
  ...comparisonMetricShape,
  category: z.literal("equity_baseline"),
  slug: comparisonEquityMetricSlugSchema,
});

export const comparisonMetricSchema = z.discriminatedUnion("category", [
  comparisonFoodMetricSchema,
  comparisonEquityMetricSchema,
]);

export const comparisonSourceSchema = z.strictObject({
  id: comparisonSourceIdSchema,
  source: atlasProvenanceItemSchema,
});

const foodMeasuresSchema = z.array(comparisonFoodMetricSchema).max(4).refine(
  (values) => new Set(values.map((value) => value.slug)).size === values.length,
  {message: "Food Access measures must be unique."},
);

const equityIndicatorsSchema = z.array(comparisonEquityMetricSchema).max(13).refine(
  (values) => new Set(values.map((value) => value.slug)).size === values.length,
  {message: "Equity Baseline indicators must be unique."},
);

export const comparisonTractSchema = z.strictObject({
  runId: z.uuid(),
  tract: atlasTractPropertiesSchema,
  scores: atlasProfileScoreSummarySchema,
  foodAccessMeasures: foodMeasuresSchema,
  equityIndicators: equityIndicatorsSchema,
}).superRefine((value, context) => {
  const scoreValues = Object.values(value.scores);
  if (value.tract.qualityStatus === "complete") {
    if (value.foodAccessMeasures.length !== 4) {
      context.addIssue({
        code: "custom",
        message: "A complete comparison tract requires exactly four Food Access measures.",
        path: ["foodAccessMeasures"],
      });
    }
    if (value.equityIndicators.length !== 13) {
      context.addIssue({
        code: "custom",
        message: "A complete comparison tract requires exactly thirteen Equity Baseline indicators.",
        path: ["equityIndicators"],
      });
    }
    if (scoreValues.some((score) => score === null)) {
      context.addIssue({
        code: "custom",
        message: "A complete comparison tract requires every approved summary score.",
        path: ["scores"],
      });
    }
    return;
  }

  if (value.foodAccessMeasures.length > 0 || value.equityIndicators.length > 0) {
    context.addIssue({
      code: "custom",
      message: "An incomplete or zero-population tract cannot carry invented comparison evidence.",
    });
  }
  if (scoreValues.some((score) => score !== null)) {
    context.addIssue({
      code: "custom",
      message: "An incomplete or zero-population tract requires explicit null summary scores.",
      path: ["scores"],
    });
  }
});

export const compareAvailableResponseSchema = z.strictObject({
  state: z.literal("available"),
  mode: atlasModeSchema,
  run: atlasRunSummarySchema,
  request: compareRequestSchema,
  tracts: z.array(comparisonTractSchema).min(2).max(5),
  sources: z.array(comparisonSourceSchema).max(64),
}).superRefine((value, context) => {
  const requestedIds = value.request.tracts;
  const tractIds = value.tracts.map((tract) => tract.tract.geoid);
  if (
    requestedIds.length !== tractIds.length
    || requestedIds.some((geoid, index) => geoid !== tractIds[index])
  ) {
    context.addIssue({
      code: "custom",
      message: "Comparison tract output must exactly preserve the requested tract order.",
      path: ["tracts"],
    });
  }

  value.tracts.forEach((tract, index) => {
    if (tract.runId !== value.run.id) {
      context.addIssue({
        code: "custom",
        message: "Every comparison tract must belong to the response run.",
        path: ["tracts", index, "runId"],
      });
    }
  });

  const sourceIds = value.sources.map((source) => source.id);
  const sourceIdSet = new Set(sourceIds);
  if (sourceIdSet.size !== sourceIds.length) {
    context.addIssue({
      code: "custom",
      message: "Comparison source definitions must be unique.",
      path: ["sources"],
    });
  }

  const referencedSourceIds = new Set(
    value.tracts.flatMap((tract) => [
      ...tract.foodAccessMeasures.flatMap((metric) => metric.sourceIds),
      ...tract.equityIndicators.flatMap((metric) => metric.sourceIds),
    ]),
  );
  for (const sourceId of referencedSourceIds) {
    if (!sourceIdSet.has(sourceId)) {
      context.addIssue({
        code: "custom",
        message: `Comparison measure references an unavailable source: ${sourceId}`,
        path: ["sources"],
      });
    }
  }
  for (const sourceId of sourceIdSet) {
    if (!referencedSourceIds.has(sourceId)) {
      context.addIssue({
        code: "custom",
        message: `Comparison response contains an unreferenced source: ${sourceId}`,
        path: ["sources"],
      });
    }
  }
});

export const compareUnavailableReasonSchema = z.union([
  atlasUnavailableReasonSchema,
  z.enum(["invalid_request", "unknown_tract", "comparison_incomplete"]),
]);

export const compareUnavailableResponseSchema = z.strictObject({
  state: z.literal("unavailable"),
  reason: compareUnavailableReasonSchema,
});

export const compareResponseSchema = z.discriminatedUnion("state", [
  compareAvailableResponseSchema,
  compareUnavailableResponseSchema,
]);

export type CompareAvailableResponse = z.infer<typeof compareAvailableResponseSchema>;
export type CompareRequest = z.infer<typeof compareRequestSchema>;
export type CompareResponse = z.infer<typeof compareResponseSchema>;
export type CompareUnavailableReason = z.infer<typeof compareUnavailableReasonSchema>;
export type CompareUrlState = z.infer<typeof compareUrlStateSchema>;
export type ComparisonEquityMetric = z.infer<typeof comparisonEquityMetricSchema>;
export type ComparisonFoodMetric = z.infer<typeof comparisonFoodMetricSchema>;
export type ComparisonMetric = z.infer<typeof comparisonMetricSchema>;
export type ComparisonSource = z.infer<typeof comparisonSourceSchema>;
export type ComparisonTract = z.infer<typeof comparisonTractSchema>;
