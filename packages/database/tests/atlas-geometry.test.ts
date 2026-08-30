import {describe, expect, it} from "vitest";
import {parseAtlasMultiPolygon, serializedGeoJsonBytes} from "../src/atlas/geometry";

const geometry = {
  type: "MultiPolygon",
  coordinates: [[[[-87.95, 43.03], [-87.94, 43.03], [-87.94, 43.04], [-87.95, 43.03]]]],
};

describe("parseAtlasMultiPolygon", () => {
  it("accepts PostGIS GeoJSON returned as an object or JSON string", () => {
    expect(parseAtlasMultiPolygon(geometry)).toEqual(geometry);
    expect(parseAtlasMultiPolygon(JSON.stringify(geometry))).toEqual(geometry);
  });

  it("rejects invalid, empty, or non-MultiPolygon geometry", () => {
    expect(() => parseAtlasMultiPolygon(null)).toThrow("invalid_geometry");
    expect(() => parseAtlasMultiPolygon({type: "Polygon", coordinates: []})).toThrow(
      "invalid_geometry",
    );
    expect(() => parseAtlasMultiPolygon("not JSON")).toThrow("invalid_geometry");
  });
});

describe("serializedGeoJsonBytes", () => {
  it("measures the UTF-8 serialized payload", () => {
    expect(serializedGeoJsonBytes({name: "Milwaukee"})).toBe(
      Buffer.byteLength(JSON.stringify({name: "Milwaukee"}), "utf8"),
    );
  });
});
