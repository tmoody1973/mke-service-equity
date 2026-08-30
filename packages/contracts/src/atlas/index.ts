import {z} from "zod";
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
});

export const atlasUnavailableResponseSchema = z.strictObject({
  state: z.literal("unavailable"),
  reason: atlasUnavailableReasonSchema,
});

export const atlasResponseSchema = z.discriminatedUnion("state", [
  atlasAvailableResponseSchema,
  atlasUnavailableResponseSchema,
]);

export * from "./profile";
export * from "./run";
export * from "./search";
export * from "./tract";

export type AtlasAvailableResponse = z.infer<typeof atlasAvailableResponseSchema>;
export type AtlasResponse = z.infer<typeof atlasResponseSchema>;
export type AtlasUnavailableResponse = z.infer<typeof atlasUnavailableResponseSchema>;
