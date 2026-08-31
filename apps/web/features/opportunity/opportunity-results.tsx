"use client";

import type {OpportunityAvailableResponse, OpportunityMatchingArea} from "@mke/contracts";

import {countOpportunityFilters} from "./opportunity-filter-state";

function resultStateLabel(area: OpportunityMatchingArea): string {
  if (area.tract.qualityStatus === "insufficient_data") {
    return "Insufficient data";
  }
  if (area.tract.qualityStatus === "ineligible_zero_population") {
    return "Not scored — no recorded population";
  }
  return `Priority ${area.tract.foodEquityPriority}`;
}

export function OpportunityResults({
  idPrefix = "opportunity-results",
  onSelect,
  response,
  selectedGeoid,
}: {
  idPrefix?: string;
  onSelect: (geoid: string) => void;
  response: OpportunityAvailableResponse;
  selectedGeoid: string | null;
}) {
  const count = response.summary.matchingTractCount;
  const missingPopulation = response.summary.matchingTractsMissingPopulation;
  const exclusions = response.summary.excludedForMissingFilterData;
  const noFilters = countOpportunityFilters(response.filters) === 0;
  return (
    <section
      aria-labelledby={`${idPrefix}-heading`}
      className="space-y-5 rounded-[var(--mke-radius-panel)] border border-divider bg-background p-5 sm:p-6"
    >
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground" id={`${idPrefix}-heading`}>
          Matching areas
        </h2>
        <p className="text-3xl font-semibold tracking-[-0.025em] text-foreground">
          {count.toLocaleString("en-US")} matching {count === 1 ? "census tract" : "census tracts"}
        </p>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          {response.summary.knownPopulationLivingInMatchingTracts.toLocaleString("en-US")} people
          live in matching tracts with known population.
        </p>
        {missingPopulation > 0 ? (
          <p className="max-w-2xl text-sm leading-6 text-muted">
            {missingPopulation.toLocaleString("en-US")} matching {missingPopulation === 1
              ? "census tract has"
              : "census tracts have"} population data unavailable and {missingPopulation === 1
              ? "is"
              : "are"} not included in the people total.
          </p>
        ) : null}
        {exclusions > 0 ? (
          <div className="space-y-1">
            <p className="max-w-2xl text-sm leading-6 text-muted">
              {exclusions.toLocaleString("en-US")} other {exclusions === 1
                ? "census tract was"
                : "census tracts were"} left out because a value required by the filters was
              missing.
            </p>
            <p className="max-w-2xl text-xs leading-5 text-muted">
              This missing-data count does not include tracts that had values and did not match.
            </p>
          </div>
        ) : null}
        {noFilters ? (
          <p className="max-w-2xl text-sm leading-6 text-muted">
            No filters are applied. Add conditions to narrow the matching areas.
          </p>
        ) : null}
        <p className="text-xs leading-5 text-muted">
          Results use Census tract order. They are not ranked recommendations.
        </p>
      </div>

      {response.matchingAreas.length > 0 ? (
        <ol aria-label="Matching areas" className="space-y-2">
          {response.matchingAreas.map((area) => {
            const selected = area.tract.geoid === selectedGeoid;
            const stateLabel = resultStateLabel(area);
            return (
              <li key={area.tract.geoid}>
                <button
                  aria-label={`${area.tract.name}, Census tract ID ${area.tract.geoid}, ${stateLabel}`}
                  aria-pressed={selected}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-divider px-3 py-3 text-left hover:bg-default focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--mke-focus)] aria-pressed:bg-default"
                  type="button"
                  onClick={() => onSelect(area.tract.geoid)}
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-foreground">{area.tract.name}</span>
                    <span className="block text-xs text-muted">
                      Census tract ID {area.tract.geoid}
                      {area.tract.population === null
                        ? " · Population unavailable"
                        : ` · Population ${area.tract.population.toLocaleString("en-US")}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-foreground">
                    {stateLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-divider p-4 text-sm text-muted">
          No Census tracts match every applied condition. Remove a condition or clear the filters
          to see more areas.
        </p>
      )}
    </section>
  );
}
