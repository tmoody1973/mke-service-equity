"use client";

import {Sheet} from "@heroui-pro/react";
import {Button} from "@heroui/react";
import type {
  AtlasTractFeatureCollection,
  OpportunityAvailableResponse,
} from "@mke/contracts";
import {useCallback, useMemo, useState} from "react";

import {TractProfileState} from "../atlas/profile/profile-state";
import {useTractProfile} from "../atlas/profile/use-tract-profile";
import {
  OpportunityFilterPanel,
  OpportunityFilterStatus,
  useOpportunityFilterController,
} from "./opportunity-filter-workspace";
import {OpportunityMap} from "./opportunity-map";
import {OpportunityResults} from "./opportunity-results";

export function OpportunityWorkspace({
  currentSearchParams,
  response,
  styleUrl,
  tracts,
}: {
  currentSearchParams: string;
  response: OpportunityAvailableResponse;
  styleUrl: string;
  tracts: AtlasTractFeatureCollection;
}) {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [resultsSheetOpen, setResultsSheetOpen] = useState(false);
  const selectionIdentity = `${response.run.id}:${currentSearchParams}`;
  const [selection, setSelection] = useState({
    identity: selectionIdentity,
    geoid: null as string | null,
  });
  if (selection.identity !== selectionIdentity) {
    setSelection({identity: selectionIdentity, geoid: null});
  }
  const selectedGeoid = selection.identity === selectionIdentity ? selection.geoid : null;
  const matchingGeoids = useMemo(
    () => response.matchingAreas.map((area) => area.tract.geoid),
    [response.matchingAreas],
  );
  const matchingGeoidSet = useMemo(() => new Set(matchingGeoids), [matchingGeoids]);
  const selectedArea = response.matchingAreas.find(
    (area) => area.tract.geoid === selectedGeoid,
  ) ?? null;
  const profile = useTractProfile(selectedArea?.tract.geoid ?? null, response.run.id);
  const filterController = useOpportunityFilterController({
    appliedFilters: response.filters,
    currentSearchParams,
    matchingTractCount: response.summary.matchingTractCount,
  });

  const selectMatchingArea = useCallback((geoid: string) => {
    if (matchingGeoidSet.has(geoid)) {
      setSelection({identity: selectionIdentity, geoid});
    }
  }, [matchingGeoidSet, selectionIdentity]);

  const selectFromResultsSheet = useCallback((geoid: string) => {
    selectMatchingArea(geoid);
    setResultsSheetOpen(false);
  }, [selectMatchingArea]);

  const resultCount = response.summary.matchingTractCount;

  return (
    <div className="space-y-4">
      <OpportunityFilterStatus message={filterController.statusMessage} />
      <div
        className="grid gap-4 lg:grid-cols-[minmax(10rem,0.75fr)_minmax(18rem,1.5fr)_minmax(11rem,1fr)] lg:items-start xl:gap-6"
        data-testid="opportunity-wide-workspace"
      >
        <aside
          aria-label="Opportunity filters"
          className="hidden max-h-[48rem] overflow-y-auto lg:block"
        >
          <OpportunityFilterPanel
            appliedFilters={response.filters}
            compact
            controller={filterController}
            currentSearchParams={currentSearchParams}
            idPrefix="opportunity-desktop-filter"
          />
        </aside>

        <div className="min-w-0 space-y-4 lg:col-start-2">
          <div
            aria-label="Opportunity Explorer tools"
            className="grid grid-cols-2 gap-3 lg:hidden"
            role="toolbar"
          >
            <Sheet
              isHandleOnly
              isOpen={filterSheetOpen}
              snapPoints={[1]}
              onOpenChange={setFilterSheetOpen}
            >
              <Sheet.Trigger>
                <Button
                  aria-label="Open filters"
                  className="min-h-11 w-full"
                  variant="secondary"
                >
                  Filters
                </Button>
              </Sheet.Trigger>
              <Sheet.Backdrop>
                <Sheet.Content className="mx-auto max-w-3xl lg:hidden">
                  <Sheet.Dialog aria-label="Choose conditions">
                    <Sheet.Handle />
                    <Sheet.CloseTrigger aria-label="Close filters" />
                    <Sheet.Header>
                      <Sheet.Heading>Choose conditions</Sheet.Heading>
                    </Sheet.Header>
                    <Sheet.Body className="min-h-0 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                      <OpportunityFilterPanel
                        appliedFilters={response.filters}
                        controller={filterController}
                        currentSearchParams={currentSearchParams}
                        idPrefix="opportunity-mobile-filter"
                      />
                    </Sheet.Body>
                  </Sheet.Dialog>
                </Sheet.Content>
              </Sheet.Backdrop>
            </Sheet>

            <Sheet
              isHandleOnly
              isOpen={resultsSheetOpen}
              snapPoints={[1]}
              onOpenChange={setResultsSheetOpen}
            >
              <Sheet.Trigger>
                <Button
                  aria-label={`Open ${resultCount.toLocaleString("en-US")} matching ${resultCount === 1 ? "area" : "areas"}`}
                  className="min-h-11 w-full"
                  variant="secondary"
                >
                  Matching areas ({resultCount.toLocaleString("en-US")})
                </Button>
              </Sheet.Trigger>
              <Sheet.Backdrop>
                <Sheet.Content className="mx-auto max-w-3xl lg:hidden">
                  <Sheet.Dialog aria-label="Matching areas">
                    <Sheet.Handle />
                    <Sheet.CloseTrigger aria-label="Close matching areas" />
                    <Sheet.Header>
                      <Sheet.Heading>Matching areas</Sheet.Heading>
                    </Sheet.Header>
                    <Sheet.Body className="min-h-0 overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                      <OpportunityResults
                        idPrefix="opportunity-mobile-results"
                        onSelect={selectFromResultsSheet}
                        response={response}
                        selectedGeoid={selectedArea?.tract.geoid ?? null}
                      />
                    </Sheet.Body>
                  </Sheet.Dialog>
                </Sheet.Content>
              </Sheet.Backdrop>
            </Sheet>
          </div>

          <OpportunityMap
            matchingGeoids={matchingGeoids}
            onSelect={selectMatchingArea}
            selectedGeoid={selectedArea?.tract.geoid ?? null}
            styleUrl={styleUrl}
            tracts={tracts}
          />

          {selectedArea ? (
            <aside
              aria-label={`Evidence for ${selectedArea.tract.name}`}
              className="rounded-[var(--mke-radius-panel)] border border-divider bg-background p-5 sm:p-6 lg:hidden"
            >
              <TractProfileState
                idPrefix="opportunity-mobile"
                isLoading={profile.isLoading}
                response={profile.response}
                tract={selectedArea.tract}
              />
            </aside>
          ) : null}
        </div>

        <aside
          aria-label="Matching areas and selected-area evidence"
          className="hidden max-h-[48rem] space-y-4 overflow-y-auto lg:col-start-3 lg:block"
        >
          <OpportunityResults
            idPrefix="opportunity-desktop-results"
            onSelect={selectMatchingArea}
            response={response}
            selectedGeoid={selectedArea?.tract.geoid ?? null}
          />
          {selectedArea ? (
            <aside
              aria-label={`Evidence for ${selectedArea.tract.name}`}
              className="rounded-[var(--mke-radius-panel)] border border-divider bg-background p-5 sm:p-6"
            >
              <TractProfileState
                idPrefix="opportunity-desktop"
                isLoading={profile.isLoading}
                response={profile.response}
                tract={selectedArea.tract}
              />
            </aside>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
