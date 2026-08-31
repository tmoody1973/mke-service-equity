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
      className="relative h-[min(62dvh,36rem)] min-h-[26rem] overflow-hidden rounded-[var(--mke-radius-panel)] border border-divider bg-default lg:h-[min(70dvh,48rem)] lg:min-h-[32rem]"
    >
      <MapCanvas
        errorMessage="The map couldn’t load. Use Matching areas to review the same results."
        matchingGeoids={matchingGeoids}
        onSelectTract={onSelect}
        selectedTract={selectedGeoid}
        styleUrl={styleUrl}
        tracts={tracts}
      />
    </section>
  );
}
