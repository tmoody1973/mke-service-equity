import type {LngLatBoundsLike} from "maplibre-gl";

export const MILWAUKEE_COUNTY_BOUNDS: LngLatBoundsLike = [
  [-88.12, 42.84],
  [-87.80, 43.20],
];

type CameraMap = {
  fitBounds(
    bounds: LngLatBoundsLike,
    options: {duration: number; padding: number},
  ): unknown;
};

export function resetMilwaukeeExtent(map: CameraMap, reduceMotion: boolean): void {
  map.fitBounds(MILWAUKEE_COUNTY_BOUNDS, {
    duration: reduceMotion ? 0 : 450,
    padding: 32,
  });
}
