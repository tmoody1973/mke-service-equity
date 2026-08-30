import {z} from "zod";
import {atlasUnavailableReasonSchema} from "./run";
import {tractGeoidSchema} from "./tract";

export const atlasSearchQuerySchema = z.string().trim().min(2).max(80);

export const atlasTractSearchResultSchema = z.strictObject({
  id: z.string().regex(/^tract:\d{11}$/),
  kind: z.literal("tract"),
  geoid: tractGeoidSchema,
  title: z.string().trim().min(1),
  subtitle: z.string().trim().min(1),
});

export const atlasNeighborhoodSearchResultSchema = z.strictObject({
  id: z.string().regex(/^neighborhood:\d+:\d{11}$/),
  kind: z.literal("neighborhood"),
  geoid: tractGeoidSchema,
  title: z.string().trim().min(1),
  subtitle: z.string().trim().min(1),
  sourceNeighborhoodId: z.number().int().positive(),
  coveredAreaShare: z.number().positive().max(1),
});

export const atlasSearchResultSchema = z.discriminatedUnion("kind", [
  atlasTractSearchResultSchema,
  atlasNeighborhoodSearchResultSchema,
]);

export const atlasSearchAvailableResponseSchema = z.strictObject({
  state: z.literal("available"),
  query: atlasSearchQuerySchema,
  neighborhoodReferenceStatus: z.enum(["available", "unavailable"]),
  results: z.array(atlasSearchResultSchema).max(20),
});

export const atlasSearchUnavailableReasonSchema = z.union([
  atlasUnavailableReasonSchema,
  z.enum(["invalid_query", "search_incomplete"]),
]);

export const atlasSearchUnavailableResponseSchema = z.strictObject({
  state: z.literal("unavailable"),
  reason: atlasSearchUnavailableReasonSchema,
});

export const atlasSearchResponseSchema = z.discriminatedUnion("state", [
  atlasSearchAvailableResponseSchema,
  atlasSearchUnavailableResponseSchema,
]);

export type AtlasSearchAvailableResponse = z.infer<typeof atlasSearchAvailableResponseSchema>;
export type AtlasSearchResponse = z.infer<typeof atlasSearchResponseSchema>;
export type AtlasSearchResult = z.infer<typeof atlasSearchResultSchema>;
