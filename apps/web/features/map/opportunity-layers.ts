import type {
  ExpressionSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  Map,
} from "maplibre-gl";

import {
  TRACT_FILL_LAYER_ID,
  TRACT_LINE_LAYER_ID,
  TRACT_SOURCE_ID,
} from "./tract-layers";

type FillOpacity = NonNullable<FillLayerSpecification["paint"]>["fill-opacity"];
type LineColor = NonNullable<LineLayerSpecification["paint"]>["line-color"];
type LineWidth = NonNullable<LineLayerSpecification["paint"]>["line-width"];

const selected: ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];
const matching: ExpressionSpecification = ["boolean", ["feature-state", "matching"], false];
const qualityStatus: ExpressionSpecification = ["get", "qualityStatus"];

export const OPPORTUNITY_FILL_OPACITY: FillOpacity = [
  "case",
  selected, 0.94,
  ["==", qualityStatus, "insufficient_data"], ["case", matching, 0.72, 0.12],
  ["==", qualityStatus, "ineligible_zero_population"], ["case", matching, 0.72, 0.12],
  matching, 0.8,
  0.12,
];

export const OPPORTUNITY_LINE_COLOR: LineColor = [
  "case",
  selected, "#111827",
  ["==", qualityStatus, "insufficient_data"], "#475569",
  ["==", qualityStatus, "ineligible_zero_population"], "#475569",
  matching, "#ffffff",
  "#94a3b8",
];

export const OPPORTUNITY_LINE_WIDTH: LineWidth = [
  "case",
  selected, 4,
  matching, 1.75,
  0.5,
];

type OpportunityLayerMap = Pick<Map, "setPaintProperty">;
type OpportunityFeatureStateMap = Pick<Map, "setFeatureState">;

export function applyOpportunityLayerStyles(map: OpportunityLayerMap): void {
  map.setPaintProperty(TRACT_FILL_LAYER_ID, "fill-opacity", OPPORTUNITY_FILL_OPACITY);
  map.setPaintProperty(TRACT_LINE_LAYER_ID, "line-color", OPPORTUNITY_LINE_COLOR);
  map.setPaintProperty(TRACT_LINE_LAYER_ID, "line-width", OPPORTUNITY_LINE_WIDTH);
}

export function synchronizeOpportunityMatchingStates(
  map: OpportunityFeatureStateMap,
  previousGeoids: ReadonlyArray<string>,
  nextGeoids: ReadonlyArray<string>,
): void {
  const previous = new Set(previousGeoids);
  const next = new Set(nextGeoids);

  for (const geoid of previous) {
    if (!next.has(geoid)) {
      map.setFeatureState({source: TRACT_SOURCE_ID, id: geoid}, {matching: false});
    }
  }
  for (const geoid of next) {
    if (!previous.has(geoid)) {
      map.setFeatureState({source: TRACT_SOURCE_ID, id: geoid}, {matching: true});
    }
  }
}
