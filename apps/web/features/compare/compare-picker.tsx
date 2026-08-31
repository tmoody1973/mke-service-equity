"use client";

import {Button} from "@heroui/react";
import {useRouter} from "next/navigation";
import {useCallback, useMemo} from "react";

import {AtlasSearch} from "../atlas/atlas-search";
import {buildCompareSearchParams, compareHref} from "./compare-url-state";

const MAX_COMPARISON_TRACTS = 5;

export type ComparePickerTract = {
  geoid: string;
  name: string | undefined;
};

type ComparePickerProps = {
  currentSearchParams: string;
  selectedTracts: ReadonlyArray<ComparePickerTract>;
};

export function ComparePicker({
  currentSearchParams,
  selectedTracts,
}: ComparePickerProps) {
  const router = useRouter();
  const selectedGeoids = useMemo(
    () => selectedTracts.map((tract) => tract.geoid),
    [selectedTracts],
  );
  const selectedGeoidSet = useMemo(() => new Set(selectedGeoids), [selectedGeoids]);
  const maximumReached = selectedGeoids.length >= MAX_COMPARISON_TRACTS;

  const navigateTo = useCallback((tracts: ReadonlyArray<string>) => {
    const next = buildCompareSearchParams(
      new URLSearchParams(currentSearchParams),
      {tracts},
    );
    router.push(compareHref("/analyze/compare", next), {scroll: false});
  }, [currentSearchParams, router]);

  const addTract = useCallback((geoid: string) => {
    if (maximumReached || selectedGeoidSet.has(geoid)) {
      return;
    }
    navigateTo([...selectedGeoids, geoid]);
  }, [maximumReached, navigateTo, selectedGeoidSet, selectedGeoids]);

  const removeTract = useCallback((geoid: string) => {
    navigateTo(selectedGeoids.filter((selectedGeoid) => selectedGeoid !== geoid));
  }, [navigateTo, selectedGeoids]);

  return (
    <section
      aria-labelledby="compare-picker-heading"
      className="space-y-5 rounded-[var(--mke-radius-panel)] border border-divider bg-background p-5 sm:p-6"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold text-foreground" id="compare-picker-heading">
            Choose comparison areas
          </h2>
          <p className="text-sm font-medium text-muted">
            {selectedGeoids.length} of {MAX_COMPARISON_TRACTS} selected
          </p>
        </div>
        <p className="max-w-3xl text-sm leading-6 text-muted">
          Choose two to five Census tracts. Your choices stay in the web address, so you can
          use Back and Forward or copy the link to share the same comparison.
        </p>
      </div>

      {selectedTracts.length > 0 ? (
        <ol aria-label="Selected comparison areas" className="grid gap-2 sm:grid-cols-2">
          {selectedTracts.map((tract, index) => {
            const displayName = tract.name ?? `Census tract ID ${tract.geoid}`;
            return (
              <li
                className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-divider bg-default px-3 py-2"
                key={tract.geoid}
              >
                <span className="min-w-0 text-sm">
                  <span className="block text-xs font-medium text-muted">
                    Choice {index + 1}
                  </span>
                  <span className="block truncate font-semibold text-foreground">
                    {displayName}
                  </span>
                  {tract.name ? (
                    <span className="block text-xs text-muted">Census tract ID {tract.geoid}</span>
                  ) : null}
                </span>
                <Button
                  aria-label={`Remove ${displayName}`}
                  className="min-h-11 shrink-0"
                  size="sm"
                  variant="ghost"
                  onPress={() => removeTract(tract.geoid)}
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted">No areas selected yet.</p>
      )}

      {maximumReached ? (
        <p
          className="rounded-xl border border-divider bg-default p-3 text-sm text-foreground"
          role="status"
        >
          You selected the maximum of five areas. Remove one area before adding another.
        </p>
      ) : (
        <AtlasSearch
          disabledGeoids={selectedGeoids}
          idPrefix="compare"
          onSelect={addTract}
        />
      )}
    </section>
  );
}
