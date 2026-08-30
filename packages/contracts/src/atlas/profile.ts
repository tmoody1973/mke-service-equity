import {z} from "zod";
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

export const observedMeasurementSchema = z.strictObject({
  state: z.literal("observed"),
  value: z.number().finite(),
  unit: measurementUnitSchema,
  qualityStatus: z.enum(["verified", "provisional", "stale"]),
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

export const atlasEvidenceItemSchema = z.strictObject({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  domain: z.string().trim().min(1),
  measurement: atlasMeasurementSchema,
  contribution: z.number().finite().nullable(),
  higherIsWorse: z.boolean(),
});

export const atlasContextItemSchema = z.strictObject({
  slug: z.string().trim().min(1),
  name: z.string().trim().min(1),
  measurement: atlasMeasurementSchema,
  scoringRole: z.literal("context_only"),
});

export const atlasProvenanceItemSchema = z.strictObject({
  sourceName: z.string().trim().min(1),
  publisher: z.string().trim().min(1),
  datasetVersion: z.string().trim().min(1),
  validFrom: z.iso.date().nullable(),
  validTo: z.iso.date().nullable(),
  methodologyUrl: z.url().nullable(),
  limitation: z.string().trim().min(1).nullable(),
});

export const atlasTractProfileSchema = z.strictObject({
  runId: z.uuid(),
  tract: atlasTractPropertiesSchema,
  explanation: z.string().trim().min(1),
  foodComponents: z.array(atlasEvidenceItemSchema),
  equityDrivers: z.array(atlasEvidenceItemSchema),
  context: z.array(atlasContextItemSchema),
  provenance: z.array(atlasProvenanceItemSchema),
});

export type AtlasContextItem = z.infer<typeof atlasContextItemSchema>;
export type AtlasEvidenceItem = z.infer<typeof atlasEvidenceItemSchema>;
export type AtlasMeasurement = z.infer<typeof atlasMeasurementSchema>;
export type AtlasProvenanceItem = z.infer<typeof atlasProvenanceItemSchema>;
export type AtlasTractProfile = z.infer<typeof atlasTractProfileSchema>;
