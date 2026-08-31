"use client";

import type {AtlasTractFeatureCollection} from "@mke/contracts";

import {MapCanvas} from "../map/map-canvas";

export function OpportunityMap({
  matchingGeoids,
  onSelect,
  selectedGeoid,
  styleUrl,
  tracts,
}: {
  matchingGeoids: ReadonlyArray<string>;
  onSelect: (geoid: string) => void;
  selectedGeoid: string | null;
  styleUrl: string;
  tracts: AtlasTractFeatureCollection;
}) {
  return (
    <section
      aria-label="Map of matching areas"
      className="relative h-[32rem] min-h-96 overflow-hidden rounded-[var(--mke-radius-panel)] border border-divider bg-default"
    >
      <MapCanvas
        matchingGeoids={matchingGeoids}
        onSelectTract={onSelect}
        selectedTract={selectedGeoid}
        styleUrl={styleUrl}
        tracts={tracts}
      />
    </section>
  );
}
