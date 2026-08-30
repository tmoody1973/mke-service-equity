import {z} from "zod";

export const atlasFoodSiteTypeSchema = z.enum([
  "food_pantry",
  "meal_program",
  "food_bank",
]);

export const atlasFoodSiteVerificationStatusSchema = z.literal(
  "source_listed_check_before_visiting",
);

export const atlasFoodSitePropertiesSchema = z.strictObject({
  id: z.string().regex(/^data-you-can-use:pantries-2026:\d+$/),
  name: z.string().trim().min(1),
  siteType: atlasFoodSiteTypeSchema,
  address: z.string().trim().min(1),
  city: z.string().trim().min(1),
  zipCode: z.string().regex(/^\d{5}$/),
  phone: z.string().regex(/^\d{3}-\d{3}-\d{4}$/).nullable(),
  website: z.url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "Website must use HTTP or HTTPS.",
  }).nullable(),
  details: z.string().trim().min(1).nullable(),
  serviceArea: z.string().trim().min(1).nullable(),
  verificationStatus: atlasFoodSiteVerificationStatusSchema,
});

const atlasPointSchema = z.strictObject({
  type: z.literal("Point"),
  coordinates: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ]),
});

export const atlasFoodSiteFeatureSchema = z.strictObject({
  type: z.literal("Feature"),
  id: z.string().regex(/^data-you-can-use:pantries-2026:\d+$/),
  geometry: atlasPointSchema,
  properties: atlasFoodSitePropertiesSchema,
}).superRefine((feature, context) => {
  if (feature.id !== feature.properties.id) {
    context.addIssue({
      code: "custom",
      message: "Food-site feature id must match its properties id.",
      path: ["id"],
    });
  }
});

export const atlasFoodSiteFeatureCollectionSchema = z.strictObject({
  type: z.literal("FeatureCollection"),
  features: z.array(atlasFoodSiteFeatureSchema).min(1),
}).superRefine((collection, context) => {
  const ids = new Set<string>();
  collection.features.forEach((feature, index) => {
    if (ids.has(feature.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate food-site id: ${feature.id}`,
        path: ["features", index, "id"],
      });
    }
    ids.add(feature.id);
  });
});

export const atlasFoodSiteSourceSchema = z.strictObject({
  sourceName: z.string().trim().min(1),
  publisher: z.literal("Data You Can Use"),
  collaborators: z.tuple([
    z.literal("Milwaukee Food Council"),
    z.literal("UWM Institute for Systems Change and Peacebuilding"),
  ]),
  datasetVersion: z.string().trim().min(1),
  sourceUrl: z.url(),
  layerUrl: z.url(),
  retrievedAt: z.iso.datetime({offset: true}),
  sourceLastEditedAt: z.iso.datetime({offset: true}),
  termsUrl: z.url(),
  attribution: z.string().trim().min(1),
  sourceSnapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  featureCount: z.number().int().positive(),
  limitation: z.string().trim().min(1),
});

export const atlasFoodSitesLayerSchema = z.strictObject({
  state: z.literal("available"),
  layerId: z.literal("food_sites"),
  title: z.literal("Food pantries and meal sites"),
  description: z.string().trim().min(1),
  affectsScores: z.literal(false),
  qualityStatus: atlasFoodSiteVerificationStatusSchema,
  scoreRunRelationship: z.literal("display_context_only_not_part_of_score_run"),
  features: atlasFoodSiteFeatureCollectionSchema,
  source: atlasFoodSiteSourceSchema,
}).superRefine((layer, context) => {
  if (layer.source.featureCount !== layer.features.features.length) {
    context.addIssue({
      code: "custom",
      message: "Source feature count must match the display collection.",
      path: ["source", "featureCount"],
    });
  }
});

export const atlasFoodSitesUnavailableSchema = z.strictObject({
  state: z.literal("unavailable"),
  reason: z.enum(["snapshot_not_configured", "snapshot_not_valid"]),
});

export const atlasFoodSitesLayerResponseSchema = z.discriminatedUnion("state", [
  atlasFoodSitesLayerSchema,
  atlasFoodSitesUnavailableSchema,
]);

export type AtlasFoodSiteFeature = z.infer<typeof atlasFoodSiteFeatureSchema>;
export type AtlasFoodSiteFeatureCollection = z.infer<typeof atlasFoodSiteFeatureCollectionSchema>;
export type AtlasFoodSiteProperties = z.infer<typeof atlasFoodSitePropertiesSchema>;
export type AtlasFoodSitesLayer = z.infer<typeof atlasFoodSitesLayerSchema>;
export type AtlasFoodSitesLayerResponse = z.infer<typeof atlasFoodSitesLayerResponseSchema>;
