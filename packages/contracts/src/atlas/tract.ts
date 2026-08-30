import {z} from "zod";

export const tractGeoidSchema = z.string().regex(/^\d{11}$/);

export const scoreQualityStatusSchema = z.enum([
  "complete",
  "insufficient_data",
  "ineligible_zero_population",
]);

export const foodAccessNeedBandSchema = z.enum([
  "very_low",
  "low",
  "moderate",
  "high",
  "very_high",
]);

export const equityBaselineBandSchema = z.enum([
  "very_low",
  "low",
  "moderate",
  "high",
  "very_high",
]);

export const foodEquityPrioritySchema = z.number().int().min(1).max(5);

export const atlasTractPropertiesSchema = z.strictObject({
  geoid: tractGeoidSchema,
  name: z.string().trim().min(1),
  population: z.number().int().nonnegative().nullable(),
  geographyVintage: z.string().trim().min(1),
  foodEquityPriority: foodEquityPrioritySchema.nullable(),
  foodAccessNeedBand: foodAccessNeedBandSchema.nullable(),
  equityBaselineBand: equityBaselineBandSchema.nullable(),
  qualityStatus: scoreQualityStatusSchema,
  exclusionReasons: z.array(z.string().trim().min(1)),
}).superRefine((tract, context) => {
  if (
    tract.qualityStatus === "complete"
    && (
      tract.foodEquityPriority === null
      || tract.foodAccessNeedBand === null
      || tract.equityBaselineBand === null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "A complete tract requires a priority and both score bands.",
    });
  }

  if (tract.qualityStatus !== "complete" && tract.foodEquityPriority !== null) {
    context.addIssue({
      code: "custom",
      message: "An incomplete or ineligible tract cannot carry a priority.",
      path: ["foodEquityPriority"],
    });
  }
});

const positionSchema = z.tuple([z.number(), z.number()]);
const linearRingSchema = z.array(positionSchema).min(4);
const polygonCoordinatesSchema = z.array(linearRingSchema).min(1);
const multiPolygonCoordinatesSchema = z.array(polygonCoordinatesSchema).min(1);

export const atlasMultiPolygonSchema = z.strictObject({
  type: z.literal("MultiPolygon"),
  coordinates: multiPolygonCoordinatesSchema,
});

export const atlasTractFeatureSchema = z.strictObject({
  type: z.literal("Feature"),
  id: tractGeoidSchema,
  geometry: atlasMultiPolygonSchema,
  properties: atlasTractPropertiesSchema,
}).superRefine((feature, context) => {
  if (feature.id !== feature.properties.geoid) {
    context.addIssue({
      code: "custom",
      message: "Feature id must match the tract GEOID.",
      path: ["id"],
    });
  }
});

export const atlasTractFeatureCollectionSchema = z.strictObject({
  type: z.literal("FeatureCollection"),
  features: z.array(atlasTractFeatureSchema).min(1),
}).superRefine((collection, context) => {
  const ids = new Set<string>();

  collection.features.forEach((feature, index) => {
    if (ids.has(feature.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate tract GEOID: ${feature.id}`,
        path: ["features", index, "id"],
      });
    }
    ids.add(feature.id);
  });
});

export type AtlasTractFeature = z.infer<typeof atlasTractFeatureSchema>;
export type AtlasTractFeatureCollection = z.infer<typeof atlasTractFeatureCollectionSchema>;
export type AtlasTractProperties = z.infer<typeof atlasTractPropertiesSchema>;
export type EquityBaselineBand = z.infer<typeof equityBaselineBandSchema>;
export type FoodAccessNeedBand = z.infer<typeof foodAccessNeedBandSchema>;
export type FoodEquityPriority = z.infer<typeof foodEquityPrioritySchema>;
export type ScoreQualityStatus = z.infer<typeof scoreQualityStatusSchema>;
