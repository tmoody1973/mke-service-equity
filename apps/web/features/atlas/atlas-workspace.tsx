"use client";

import type {AtlasResponse} from "@mke/contracts";
import {usePathname, useSearchParams} from "next/navigation";
import {useCallback, useEffect, useMemo} from "react";
import {MapCanvas} from "../map/map-canvas";
import {AtlasDataState} from "./atlas-data-state";
import {PriorityLegend} from "./priority-legend";
import {TractList} from "./tract-list";
import {TractSummary} from "./tract-summary";
import {
  atlasHref,
  buildAtlasSearchParams,
  parseAtlasUrlState,
  type AtlasUrlState,
} from "./atlas-url-state";

type AtlasWorkspaceProps = {
  atlas: AtlasResponse;
  styleUrl: string;
};

export function AtlasWorkspace({atlas, styleUrl}: AtlasWorkspaceProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const availableGeoids = useMemo(() => new Set(
    atlas.state === "available"
      ? atlas.tracts.features.map((feature) => feature.properties.geoid)
      : [],
  ), [atlas]);
  const urlState = useMemo(
    () => parseAtlasUrlState(searchParams, availableGeoids),
    [availableGeoids, searchParams],
  );
  const tractFeatures = useMemo(
    () => atlas.state === "available" ? atlas.tracts.features : [],
    [atlas],
  );
  const visibleTracts = useMemo(() => urlState.priorities.length === 0
    ? tractFeatures
    : tractFeatures.filter((feature) => feature.properties.qualityStatus !== "complete"
      || (feature.properties.foodEquityPriority !== null
        && urlState.priorities.includes(feature.properties.foodEquityPriority))),
  [tractFeatures, urlState.priorities]);
  const selectedFeature = tractFeatures.find((feature) => feature.id === urlState.tract);

  const writeUrlState = useCallback((nextState: AtlasUrlState, replace = false) => {
    const href = atlasHref(pathname, buildAtlasSearchParams(searchParams, nextState));
    if (replace) {
      window.history.replaceState(null, "", href);
    } else {
      window.history.pushState(null, "", href);
    }
  }, [pathname, searchParams]);

  const handleSelectTract = useCallback((tract: string) => {
    writeUrlState({...urlState, tract});
  }, [urlState, writeUrlState]);

  const handlePriorityChange = useCallback((priorities: Array<number>) => {
    writeUrlState({...urlState, priorities});
  }, [urlState, writeUrlState]);

  useEffect(() => {
    const normalized = buildAtlasSearchParams(searchParams, urlState);
    if (normalized.toString() !== searchParams.toString()) {
      writeUrlState(urlState, true);
    }
  }, [searchParams, urlState, writeUrlState]);

  return (
    <section
      aria-label="Map workspace"
      className="relative h-[calc(100dvh-3.5rem)] min-h-96 overflow-hidden border-t border-divider bg-default min-[768px]:h-[calc(100dvh-4rem)]"
      data-selected-tract={urlState.tract ?? ""}
      role="region"
    >
      <MapCanvas
        onSelectTract={handleSelectTract}
        priorities={urlState.priorities}
        selectedTract={urlState.tract}
        styleUrl={styleUrl}
        tracts={atlas.state === "available" ? atlas.tracts : undefined}
      />
      {atlas.state === "available" ? (
        <>
          <aside className="absolute inset-y-3 left-3 z-10 hidden w-72 flex-col gap-5 overflow-hidden rounded-[var(--mke-radius-panel)] border border-divider bg-background p-4 shadow-sm md:flex">
            <PriorityLegend
              activePriorities={urlState.priorities}
              idPrefix="desktop"
              onChange={handlePriorityChange}
            />
            <TractList
              idPrefix="desktop"
              onSelect={handleSelectTract}
              selectedTract={urlState.tract}
              tracts={visibleTracts}
            />
          </aside>
          <details className="absolute inset-x-3 top-3 z-20 max-h-[70dvh] overflow-auto rounded-[var(--mke-radius-panel)] border border-divider bg-background shadow-sm md:hidden">
            <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">
              Browse tracts and priority legend
            </summary>
            <div className="flex max-h-[calc(70dvh-3rem)] flex-col gap-5 border-t border-divider p-4">
              <PriorityLegend
                activePriorities={urlState.priorities}
                idPrefix="mobile"
                onChange={handlePriorityChange}
              />
              {selectedFeature ? (
                <TractSummary idPrefix="mobile" tract={selectedFeature.properties} />
              ) : null}
              <TractList
                idPrefix="mobile"
                onSelect={handleSelectTract}
                selectedTract={urlState.tract}
                tracts={visibleTracts}
              />
            </div>
          </details>
          {selectedFeature ? (
            <aside
              aria-label="Selected tract summary"
              className="absolute right-20 top-3 z-10 hidden w-80 lg:block"
            >
              <TractSummary idPrefix="desktop" tract={selectedFeature.properties} />
            </aside>
          ) : null}
        </>
      ) : null}
      <AtlasDataState response={atlas} />
    </section>
  );
}
