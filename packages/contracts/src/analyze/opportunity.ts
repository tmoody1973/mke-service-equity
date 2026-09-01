import {z} from "zod";
import {atlasProfileScoreSummarySchema} from "../atlas/profile";
import {
  atlasModeSchema,
  refineAtlasRunPublication,
  atlasRunSummarySchema,
  atlasUnavailableReasonSchema,
} from "../atlas/run";
import {
  equityBaselineBandSchema,
  foodAccessNeedBandSchema,
  foodEquityPrioritySchema,
  atlasTractPropertiesSchema,
} from "../atlas/tract";

const BAND_ORDER = ["very_low", "low", "moderate", "high", "very_high"] as const;
const bandOrder = new Map<string, number>(BAND_ORDER.map((band, index) => [band, index]));

const prioritiesSchema = z.array(foodEquityPrioritySchema).max(5).transform((values) => (
  [...new Set(values)].sort((left, right) => left - right)
)).default([]);

function canonicalBands(values: Array<(typeof BAND_ORDER)[number]>) {
  return [...new Set(values)].sort(
    (left, right) => (bandOrder.get(left) ?? 0) - (bandOrder.get(right) ?? 0),
  );
}

const equityBandsSchema = z.array(equityBaselineBandSchema).max(5)
  .transform(canonicalBands)
  .default([]);
const foodNeedBandsSchema = z.array(foodAccessNeedBandSchema).max(5)
  .transform(canonicalBands)
  .default([]);

const nullablePercentThresholdSchema = z.number().finite().min(0).max(100).nullable().default(null);
const nullableNonnegativeThresholdSchema = z.number().finite().nonnegative().nullable().default(null);

export const opportunityFilterStateSchema = z.strictObject({
  priorities: prioritiesSchema,
  equityBands: equityBandsSchema,
  equityPercentileMinimum: nullablePercentThresholdSchema,
  foodNeedBands: foodNeedBandsSchema,
  foodNeedPercentileMinimum: nullablePercentThresholdSchema,
  noVehicleMinimumPercent: nullablePercentThresholdSchema,
  snapLowAccessMinimumPercent: nullablePercentThresholdSchema,
  groceryWalkMinimumMinutes: nullableNonnegativeThresholdSchema,
  includeUnreachableGrocery: z.boolean().default(false),
  transitMaximumTripsPerHour: nullableNonnegativeThresholdSchema,
});

export const opportunityRequestSchema = z.strictObject({
  filters: opportunityFilterStateSchema,
});

export const opportunityMatchingAreaSchema = z.strictObject({
  runId: z.uuid(),
  tract: atlasTractPropertiesSchema,
  scores: atlasProfileScoreSummarySchema,
}).superRefine((value, context) => {
  const scores = Object.values(value.scores);
  if (value.tract.qualityStatus === "complete") {
    if (scores.some((score) => score === null)) {
      context.addIssue({
        code: "custom",
        message: "A complete matching area requires every approved summary score.",
        path: ["scores"],
      });
    }
    return;
  }

  if (value.tract.qualityStatus === "insufficient_data") {
    if (
      value.tract.foodAccessNeedBand !== null
      || value.scores.foodAccessNeedPercentile !== null
      || value.scores.retailAccessScore !== null
      || value.scores.transportationConstraintScore !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "An insufficient Food area cannot carry Food Access summary scores or a band.",
        path: ["scores"],
      });
    }
    const hasEquityBaselineBand = value.tract.equityBaselineBand !== null;
    const hasEquityBaselinePercentile = value.scores.equityBaselinePercentile !== null;
    if (hasEquityBaselineBand !== hasEquityBaselinePercentile) {
      context.addIssue({
        code: "custom",
        message: "An insufficient Food area must carry its Equity Baseline band and percentile together or omit both.",
        path: ["scores", "equityBaselinePercentile"],
      });
    }
    return;
  }

  if (
    value.tract.population !== 0
    || scores.some((score) => score !== null)
    || value.tract.foodAccessNeedBand !== null
    || value.tract.equityBaselineBand !== null
    || value.tract.foodEquityPriority !== null
  ) {
    context.addIssue({
      code: "custom",
      message: "A zero-population matching area requires population zero and null scores, bands, and Priority.",
      path: ["scores"],
    });
  }
});

export const opportunitySummarySchema = z.strictObject({
  matchingTractCount: z.number().int().nonnegative().max(302),
  knownPopulationLivingInMatchingTracts: z.number().int().nonnegative()
    .max(Number.MAX_SAFE_INTEGER),
  matchingTractsMissingPopulation: z.number().int().nonnegative().max(302),
  excludedForMissingFilterData: z.number().int().nonnegative().max(302),
});

function compareAreaOrder(
  left: z.infer<typeof opportunityMatchingAreaSchema>,
  right: z.infer<typeof opportunityMatchingAreaSchema>,
): number {
  if (left.tract.name < right.tract.name) {
    return -1;
  }
  if (left.tract.name > right.tract.name) {
    return 1;
  }
  return left.tract.geoid.localeCompare(right.tract.geoid);
}

export const opportunityAvailableResponseSchema = z.strictObject({
  state: z.literal("available"),
  mode: atlasModeSchema,
  run: atlasRunSummarySchema,
  filters: opportunityFilterStateSchema,
  summary: opportunitySummarySchema,
  matchingAreas: z.array(opportunityMatchingAreaSchema).max(302),
}).superRefine((value, context) => {
  refineAtlasRunPublication(value, context);
  value.matchingAreas.forEach((area, index) => {
    if (area.runId !== value.run.id) {
      context.addIssue({
        code: "custom",
        message: "Every matching area must belong to the response run.",
        path: ["matchingAreas", index, "runId"],
      });
    }
  });

  const geoids = value.matchingAreas.map((area) => area.tract.geoid);
  if (new Set(geoids).size !== geoids.length) {
    context.addIssue({
      code: "custom",
      message: "Matching census tract IDs must be unique.",
      path: ["matchingAreas"],
    });
  }

  for (let index = 1; index < value.matchingAreas.length; index += 1) {
    const previous = value.matchingAreas[index - 1];
    const current = value.matchingAreas[index];
    if (previous && current && compareAreaOrder(previous, current) > 0) {
      context.addIssue({
        code: "custom",
        message: "Matching areas must use canonical tract-name and Census-tract-ID order.",
        path: ["matchingAreas", index],
      });
      break;
    }
  }

  if (value.summary.matchingTractCount !== value.matchingAreas.length) {
    context.addIssue({
      code: "custom",
      message: "Matching tract count must equal the number of matching rows.",
      path: ["summary", "matchingTractCount"],
    });
  }

  const knownPopulation = value.matchingAreas.reduce(
    (total, area) => total + (area.tract.population ?? 0),
    0,
  );
  if (value.summary.knownPopulationLivingInMatchingTracts !== knownPopulation) {
    context.addIssue({
      code: "custom",
      message: "Known population must equal the sum of non-missing matching populations.",
      path: ["summary", "knownPopulationLivingInMatchingTracts"],
    });
  }

  const missingPopulationCount = value.matchingAreas.filter(
    (area) => area.tract.population === null,
  ).length;
  if (value.summary.matchingTractsMissingPopulation !== missingPopulationCount) {
    context.addIssue({
      code: "custom",
      message: "Missing-population count must match the matching rows with unavailable population.",
      path: ["summary", "matchingTractsMissingPopulation"],
    });
  }
});

export const opportunityUnavailableReasonSchema = z.union([
  atlasUnavailableReasonSchema,
  z.enum(["invalid_filters", "results_incomplete"]),
]);

export const opportunityUnavailableResponseSchema = z.strictObject({
  state: z.literal("unavailable"),
  reason: opportunityUnavailableReasonSchema,
});

export const opportunityResponseSchema = z.discriminatedUnion("state", [
  opportunityAvailableResponseSchema,
  opportunityUnavailableResponseSchema,
]);

export type OpportunityAvailableResponse = z.infer<typeof opportunityAvailableResponseSchema>;
export type OpportunityFilterState = z.infer<typeof opportunityFilterStateSchema>;
export type OpportunityMatchingArea = z.infer<typeof opportunityMatchingAreaSchema>;
export type OpportunityRequest = z.infer<typeof opportunityRequestSchema>;
export type OpportunityResponse = z.infer<typeof opportunityResponseSchema>;
export type OpportunitySummary = z.infer<typeof opportunitySummarySchema>;
export type OpportunityUnavailableReason = z.infer<typeof opportunityUnavailableReasonSchema>;
