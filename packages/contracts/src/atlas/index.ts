import {z} from "zod";
import {atlasFoodSitesLayerResponseSchema} from "./context-layers";
import {
  atlasModeSchema,
  atlasRunSummarySchema,
  atlasUnavailableReasonSchema,
} from "./run";
import {atlasTractFeatureCollectionSchema} from "./tract";

export const atlasAvailableResponseSchema = z.strictObject({
  state: z.literal("available"),
  mode: atlasModeSchema,
  run: atlasRunSummarySchema,
  tracts: atlasTractFeatureCollectionSchema,
  contextLayers: z.strictObject({
    foodSites: atlasFoodSitesLayerResponseSchema,
  }),
});

export const atlasUnavailableResponseSchema = z.strictObject({
  state: z.literal("unavailable"),
  reason: atlasUnavailableReasonSchema,
});

export const atlasResponseSchema = z.discriminatedUnion("state", [
  atlasAvailableResponseSchema,
  atlasUnavailableResponseSchema,
]).superRefine((value, context) => {
  if (value.state !== "available") {
    return;
  }
  if (value.mode === "published" && value.run.publication === null) {
    context.addIssue({
      code: "custom",
      message: "Published Atlas data requires immutable publication identity.",
      path: ["run", "publication"],
    });
  }
  if (value.mode === "validated_preview" && value.run.publication !== null) {
    context.addIssue({
      code: "custom",
      message: "Validated preview cannot claim publication identity.",
      path: ["run", "publication"],
    });
  }
});

export * from "./profile";
export * from "./context-layers";
export * from "./publication";
export * from "./run";
export * from "./search";
export * from "./tract";

export type AtlasAvailableResponse = z.infer<typeof atlasAvailableResponseSchema>;
export type AtlasResponse = z.infer<typeof atlasResponseSchema>;
export type AtlasUnavailableResponse = z.infer<typeof atlasUnavailableResponseSchema>;
