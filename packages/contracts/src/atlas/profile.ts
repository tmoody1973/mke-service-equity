import {z} from "zod";
import {atlasUnavailableReasonSchema} from "./run";
import {atlasTractPropertiesSchema} from "./tract";

export const presentationQualityStatusSchema = z.enum([
  "verified",
  "provisional",
  "stale",
  "missing",
  "suppressed",
  "conflicting",
]);

const measurementUnitSchema = z.string().trim().min(1);
const nullablePercentSchema = z.number().finite().min(0).max(100).nullable();

export const atlasReliabilityStateSchema = z.enum([
  "reliable",
  "use_with_caution",
  "high_uncertainty",
  "cv_not_computable",
]);

export const observedMeasurementSchema = z.strictObject({
  state: z.literal("observed"),
  value: z.number().finite(),
  unit: measurementUnitSchema,
  qualityStatus: z.enum(["verified", "provisional", "stale"]),
  marginOfError: z.number().finite().nonnegative().nullable(),
  confidenceLow: z.number().finite().min(0).max(100).nullable(),
  confidenceHigh: z.number().finite().min(0).max(100).nullable(),
  confidenceLevel: z.literal(90).nullable(),
  reliability: atlasReliabilityStateSchema.nullable(),
}).superRefine((measurement, context) => {
  const oneConfidenceBoundMissing = (measurement.confidenceLow === null)
    !== (measurement.confidenceHigh === null);
  if (oneConfidenceBoundMissing) {
    context.addIssue({
      code: "custom",
      message: "Confidence bounds must be provided together.",
    });
  }
  if (
    measurement.confidenceLow !== null
    && measurement.confidenceHigh !== null
    && measurement.confidenceLow > measurement.confidenceHigh
  ) {
    context.addIssue({
      code: "custom",
      message: "The lower confidence bound cannot exceed the upper bound.",
    });
  }
  if (
    measurement.reliability !== null
    && (
      measurement.marginOfError === null
      || measurement.confidenceLow === null
      || measurement.confidenceHigh === null
      || measurement.confidenceLevel !== 90
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "An ACS reliability state requires its 90% margin and range.",
    });
  }
  if (measurement.confidenceLevel === 90 && measurement.marginOfError === null) {
    context.addIssue({
      code: "custom",
      message: "A Census 90% confidence level requires its margin of error.",
    });
  }
});

export const unavailableMeasurementSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("unreachable"),
    value: z.null(),
    unit: measurementUnitSchema,
    qualityStatus: z.enum(["verified", "provisional", "stale"]),
  }),
  z.strictObject({
    state: z.literal("missing"),
    value: z.null(),
    unit: measurementUnitSchema,
    qualityStatus: z.literal("missing"),
  }),
  z.strictObject({
    state: z.literal("suppressed"),
    value: z.null(),
    unit: measurementUnitSchema,
    qualityStatus: z.literal("suppressed"),
  }),
  z.strictObject({
    state: z.literal("conflicting"),
    value: z.null(),
    unit: measurementUnitSchema,
    qualityStatus: z.literal("conflicting"),
  }),
]);

export const atlasMeasurementSchema = z.union([
  observedMeasurementSchema,
  unavailableMeasurementSchema,
]);

export const atlasProvenanceItemSchema = z.strictObject({
  sourceName: z.string().trim().min(1),
  publisher: z.string().trim().min(1),
  datasetVersion: z.string().trim().min(1),
  sourceUrl: z.url(),
  retrievedAt: z.iso.datetime({offset: true}),
  validFrom: z.iso.date().nullable(),
  validTo: z.iso.date().nullable(),
  methodologyUrl: z.url().nullable(),
  limitation: z.string().trim().min(1).nullable(),
});

export const atlasNearestResourceSchema = z.strictObject({
  name: z.string().trim().min(1),
  category: z.literal("full_service_grocery"),
  address: z.string().trim().min(1).nullable(),
  city: z.string().trim().min(1).nullable(),
  postalCode: z.string().trim().min(1).nullable(),
});

export const atlasEvidenceItemSchema = z.strictObject({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  definition: z.string().trim().min(1),
  domain: z.string().trim().min(1),
  dataYear: z.string().trim().min(1).nullable(),
  measurement: atlasMeasurementSchema,
  countyPercentile: z.number().finite().min(0).max(100),
  effectiveWeight: z.number().finite().positive().max(1),
  contribution: z.number().finite(),
  higherIsWorse: z.boolean(),
  provenance: z.array(atlasProvenanceItemSchema).min(1),
  nearestResource: atlasNearestResourceSchema.nullable(),
  limitation: z.string().trim().min(1).nullable(),
});

export const atlasContextItemSchema = z.strictObject({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  measurement: atlasMeasurementSchema,
  scoringRole: z.literal("context_only"),
});

export const atlasContextSectionSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("available"),
    items: z.array(atlasContextItemSchema),
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    reason: z.enum(["not_pinned_to_run", "not_approved_for_publication"]),
  }),
]);

export const atlasNeighborhoodOverlapSchema = z.strictObject({
  sourceNeighborhoodId: z.number().int().positive(),
  name: z.string().trim().min(1),
  coveredAreaShare: z.number().finite().positive().max(1),
});

export const atlasNeighborhoodContextSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("available"),
    labelKind: z.enum(["mostly_in", "spans", "partly_covered", "no_reference"]),
    cityReferenceCoverage: z.number().finite().min(0).max(1),
    overlaps: z.array(atlasNeighborhoodOverlapSchema),
    otherBoundarySliversShare: z.number().finite().min(0).max(1),
    source: atlasProvenanceItemSchema,
    limitation: z.string().trim().min(1),
  }).superRefine((value, context) => {
    const first = value.overlaps[0];
    if (value.labelKind === "no_reference") {
      if (value.cityReferenceCoverage !== 0 || value.overlaps.length > 0) {
        context.addIssue({code: "custom", message: "No-reference context cannot carry overlaps."});
      }
      return;
    }
    if (!first) {
      context.addIssue({code: "custom", message: "Covered context requires a reportable overlap."});
      return;
    }
    if (value.labelKind === "partly_covered" && value.cityReferenceCoverage >= 0.5) {
      context.addIssue({code: "custom", message: "Partly covered requires under 50% coverage."});
    }
    if (value.labelKind !== "partly_covered" && value.cityReferenceCoverage < 0.5) {
      context.addIssue({code: "custom", message: "Majority labels require at least 50% coverage."});
    }
    if (value.labelKind === "mostly_in" && first.coveredAreaShare < 0.5) {
      context.addIssue({code: "custom", message: "Mostly in requires a majority overlap."});
    }
    if (value.labelKind === "spans" && first.coveredAreaShare >= 0.5) {
      context.addIssue({code: "custom", message: "Spans cannot hide a majority overlap."});
    }
    for (let index = 1; index < value.overlaps.length; index += 1) {
      const previous = value.overlaps[index - 1]!;
      const current = value.overlaps[index]!;
      if (previous.coveredAreaShare < current.coveredAreaShare) {
        context.addIssue({code: "custom", message: "Overlaps must be ordered by area share."});
        break;
      }
    }
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    reason: z.enum([
      "snapshot_not_configured",
      "snapshot_not_valid",
      "not_pinned_to_publication",
    ]),
  }),
]);

export const atlasProfileScoreSummarySchema = z.strictObject({
  foodAccessNeedPercentile: nullablePercentSchema,
  equityBaselinePercentile: nullablePercentSchema,
  retailAccessScore: nullablePercentSchema,
  transportationConstraintScore: nullablePercentSchema,
});

export const atlasTractProfileSchema = z.strictObject({
  runId: z.uuid(),
  tract: atlasTractPropertiesSchema,
  explanation: z.string().trim().min(1),
  scores: atlasProfileScoreSummarySchema,
  foodComponents: z.array(atlasEvidenceItemSchema),
  equityDrivers: z.array(atlasEvidenceItemSchema),
  neighborhoodContext: atlasNeighborhoodContextSchema,
  context: atlasContextSectionSchema,
  provenance: z.array(atlasProvenanceItemSchema),
  limitations: z.array(z.string().trim().min(1)),
}).superRefine((profile, context) => {
  if (profile.tract.qualityStatus === "complete" && profile.foodComponents.length !== 4) {
    context.addIssue({
      code: "custom",
      message: "A complete profile requires exactly four Food Access components.",
      path: ["foodComponents"],
    });
  }
  if (profile.tract.qualityStatus === "complete" && profile.equityDrivers.length !== 13) {
    context.addIssue({
      code: "custom",
      message: "A complete profile requires exactly thirteen Equity Baseline drivers.",
      path: ["equityDrivers"],
    });
  }
});

export const atlasProfileUnavailableReasonSchema = z.union([
  atlasUnavailableReasonSchema,
  z.enum(["invalid_tract", "profile_incomplete"]),
]);

export const atlasTractProfileResponseSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("available"),
    profile: atlasTractProfileSchema,
  }),
  z.strictObject({
    state: z.literal("unavailable"),
    reason: atlasProfileUnavailableReasonSchema,
  }),
]);

export type AtlasContextItem = z.infer<typeof atlasContextItemSchema>;
export type AtlasContextSection = z.infer<typeof atlasContextSectionSchema>;
export type AtlasEvidenceItem = z.infer<typeof atlasEvidenceItemSchema>;
export type AtlasMeasurement = z.infer<typeof atlasMeasurementSchema>;
export type AtlasNearestResource = z.infer<typeof atlasNearestResourceSchema>;
export type AtlasNeighborhoodContext = z.infer<typeof atlasNeighborhoodContextSchema>;
export type AtlasNeighborhoodOverlap = z.infer<typeof atlasNeighborhoodOverlapSchema>;
export type AtlasProfileUnavailableReason = z.infer<typeof atlasProfileUnavailableReasonSchema>;
export type AtlasProvenanceItem = z.infer<typeof atlasProvenanceItemSchema>;
export type AtlasReliabilityState = z.infer<typeof atlasReliabilityStateSchema>;
export type AtlasTractProfile = z.infer<typeof atlasTractProfileSchema>;
export type AtlasTractProfileResponse = z.infer<typeof atlasTractProfileResponseSchema>;
