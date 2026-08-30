import {
  atlasMultiPolygonSchema,
  type AtlasTractFeature,
} from "@mke/contracts";

export function parseAtlasMultiPolygon(value: unknown): AtlasTractFeature["geometry"] {
  let candidate = value;

  if (typeof value === "string") {
    try {
      candidate = JSON.parse(value) as unknown;
    } catch {
      throw new Error("invalid_geometry");
    }
  }

  const parsed = atlasMultiPolygonSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error("invalid_geometry");
  }

  return parsed.data;
}

export function serializedGeoJsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}
