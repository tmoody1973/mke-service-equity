"use client";

import type {AtlasResponse} from "@mke/contracts";
import {Sheet} from "@heroui-pro/react";
import {Button, EmptyState} from "@heroui/react";
import {usePathname, useSearchParams} from "next/navigation";
import {useCallback, useEffect, useMemo, useState} from "react";
import {MapCanvas} from "../map/map-canvas";
import {AtlasDataState} from "./atlas-data-state";
import {PriorityLegend} from "./priority-legend";
import {TractProfileState} from "./profile/profile-state";
import {useTractProfile} from "./profile/use-tract-profile";
import {TractList} from "./tract-list";
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
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSnapPoint, setMobileSnapPoint] = useState<string | number | null>(1);
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
  const profile = useTractProfile(
    selectedFeature?.properties.geoid ?? null,
    atlas.state === "available" ? atlas.run.id : null,
  );

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
    if (window.matchMedia?.("(max-width: 768px)").matches) {
      if (!mobileSheetOpen) {
        setMobileSnapPoint(0.65);
      }
      setMobileSheetOpen(true);
    }
  }, [mobileSheetOpen, urlState, writeUrlState]);

  const handlePriorityChange = useCallback((priorities: Array<number>) => {
    writeUrlState({...urlState, priorities});
  }, [urlState, writeUrlState]);

  const handleMobileSheetOpenChange = useCallback((open: boolean) => {
    if (open) {
      setMobileSnapPoint(1);
    }
    setMobileSheetOpen(open);
  }, []);

  useEffect(() => {
    const normalized = buildAtlasSearchParams(searchParams, urlState);
    if (normalized.toString() !== searchParams.toString()) {
      writeUrlState(urlState, true);
    }
  }, [searchParams, urlState, writeUrlState]);

  return (
    <section
      aria-label="Map workspace"
      className="relative flex h-[calc(100dvh-3.5rem)] min-h-96 overflow-hidden border-t border-divider bg-default min-[769px]:h-dvh"
      data-selected-tract={urlState.tract ?? ""}
      role="region"
    >
      {atlas.state === "available" ? (
        <aside className="hidden w-[17rem] shrink-0 flex-col gap-5 overflow-hidden border-r border-divider bg-background p-4 min-[1200px]:flex">
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
      ) : null}
      <div className="relative min-w-0 flex-1">
        <MapCanvas
          onSelectTract={handleSelectTract}
          priorities={urlState.priorities}
          selectedTract={urlState.tract}
          styleUrl={styleUrl}
          tracts={atlas.state === "available" ? atlas.tracts : undefined}
        />
        {selectedFeature ? (
          <aside
            aria-label="Selected tract summary"
            className="absolute right-20 top-3 z-10 hidden max-h-[calc(100dvh-1.5rem)] w-80 overflow-y-auto min-[1200px]:block min-[1280px]:hidden"
          >
            <TractProfileState
              idPrefix="tablet"
              isLoading={profile.isLoading}
              response={profile.response}
              tract={selectedFeature.properties}
            />
          </aside>
        ) : null}
        {atlas.state === "available" ? (
          <Sheet
            isHandleOnly
            activeSnapPoint={mobileSnapPoint}
            isOpen={mobileSheetOpen}
            snapPoints={["180px", 0.65, 1]}
            onActiveSnapPointChange={setMobileSnapPoint}
            onOpenChange={handleMobileSheetOpenChange}
          >
            <Sheet.Trigger>
              <Button
                className="absolute bottom-4 left-1/2 z-20 min-h-11 -translate-x-1/2 shadow-sm min-[1200px]:hidden"
                variant="secondary"
              >
                {selectedFeature ? "View tract details" : "Browse census tracts"}
              </Button>
            </Sheet.Trigger>
            <Sheet.Backdrop variant="transparent">
              <Sheet.Content className="mx-auto max-w-[42rem] min-[1200px]:hidden">
                <Sheet.Dialog>
                  <Sheet.Handle />
                  <Sheet.CloseTrigger aria-label="Close census tract explorer" />
                  <Sheet.Header>
                    <Sheet.Heading>
                      {selectedFeature?.properties.name ?? "Explore census tracts"}
                    </Sheet.Heading>
                  </Sheet.Header>
                  <Sheet.Body className="flex min-h-0 flex-col gap-5 overflow-y-auto pb-6">
                    {selectedFeature ? (
                      <TractProfileState
                        idPrefix="mobile"
                        isLoading={profile.isLoading}
                        response={profile.response}
                        tract={selectedFeature.properties}
                      />
                    ) : null}
                    <PriorityLegend
                      activePriorities={urlState.priorities}
                      idPrefix="mobile"
                      onChange={handlePriorityChange}
                    />
                    <TractList
                      idPrefix="mobile"
                      onSelect={handleSelectTract}
                      selectedTract={urlState.tract}
                      tracts={visibleTracts}
                    />
                  </Sheet.Body>
                </Sheet.Dialog>
              </Sheet.Content>
            </Sheet.Backdrop>
          </Sheet>
        ) : null}
      </div>
      {atlas.state === "available" ? (
        <aside className="hidden w-[22.5rem] shrink-0 overflow-y-auto border-l border-divider bg-background p-4 min-[1280px]:block">
          {selectedFeature ? (
            <TractProfileState
              idPrefix="desktop"
              isLoading={profile.isLoading}
              response={profile.response}
              tract={selectedFeature.properties}
            />
          ) : (
            <EmptyState className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <h2 className="text-base font-semibold">Select a census tract</h2>
              <p className="max-w-64 text-sm text-muted">
                Choose a tract on the map or from the list to see its priority and why it received that result.
              </p>
            </EmptyState>
          )}
        </aside>
      ) : null}
      <AtlasDataState response={atlas} />
    </section>
  );
}
