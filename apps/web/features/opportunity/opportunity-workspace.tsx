"use client";

import type {
  AtlasTractFeatureCollection,
  OpportunityAvailableResponse,
} from "@mke/contracts";
import {useCallback, useMemo, useState} from "react";

import {TractProfileState} from "../atlas/profile/profile-state";
import {useTractProfile} from "../atlas/profile/use-tract-profile";
import {OpportunityFilterWorkspace} from "./opportunity-filter-workspace";
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

  const selectMatchingArea = useCallback((geoid: string) => {
    if (matchingGeoidSet.has(geoid)) {
      setSelection({identity: selectionIdentity, geoid});
    }
  }, [matchingGeoidSet, selectionIdentity]);

  return (
    <div className="space-y-6">
      <OpportunityFilterWorkspace
        appliedFilters={response.filters}
        currentSearchParams={currentSearchParams}
        matchingTractCount={response.summary.matchingTractCount}
      />
      <OpportunityMap
        matchingGeoids={matchingGeoids}
        onSelect={selectMatchingArea}
        selectedGeoid={selectedArea?.tract.geoid ?? null}
        styleUrl={styleUrl}
        tracts={tracts}
      />
      <OpportunityResults
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
            idPrefix="opportunity"
            isLoading={profile.isLoading}
            response={profile.response}
            tract={selectedArea.tract}
          />
        </aside>
      ) : null}
    </div>
  );
}
