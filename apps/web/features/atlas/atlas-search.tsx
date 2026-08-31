"use client";

import type {AtlasSearchResponse} from "@mke/contracts";
import {Button, Description, Label, SearchField} from "@heroui/react";
import {useEffect, useState} from "react";

type AtlasSearchProps = {
  disabledGeoids?: ReadonlyArray<string>;
  idPrefix?: string;
  onSelect: (geoid: string) => void;
};

type StoredSearch = {
  query: string;
  response: AtlasSearchResponse;
};

function statusText(
  normalizedQuery: string,
  stored: StoredSearch | null,
): string {
  if (normalizedQuery.length < 2) {
    return "Enter at least 2 characters.";
  }
  if (stored?.query !== normalizedQuery) {
    return "Searching…";
  }
  if (stored.response.state === "unavailable") {
    return "Search is not available right now.";
  }
  if (stored.response.results.length === 0) {
    return stored.response.neighborhoodReferenceStatus === "available"
      ? "No matching census tracts or City neighborhoods."
      : "No matching census tracts. City neighborhood search is unavailable for this data version.";
  }
  const count = `${stored.response.results.length} ${stored.response.results.length === 1 ? "result" : "results"}.`;
  return stored.response.neighborhoodReferenceStatus === "available"
    ? count
    : `${count} City neighborhood search is unavailable for this data version.`;
}

export function AtlasSearch({
  disabledGeoids = [],
  idPrefix = "atlas",
  onSelect,
}: AtlasSearchProps) {
  const [query, setQuery] = useState("");
  const [stored, setStored] = useState<StoredSearch | null>(null);
  const normalizedQuery = query.trim();

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void fetch(`/api/atlas/search?q=${encodeURIComponent(normalizedQuery)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => response.json() as Promise<AtlasSearchResponse>)
        .then((response) => setStored({query: normalizedQuery, response}))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setStored({
            query: normalizedQuery,
            response: {state: "unavailable", reason: "search_incomplete"},
          });
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [normalizedQuery]);

  const response = stored?.query === normalizedQuery ? stored.response : null;

  return (
    <section aria-labelledby={`${idPrefix}-search-label`} className="space-y-2">
      <SearchField name={`${idPrefix}-atlas-search`} value={query} onChange={setQuery}>
        <Label id={`${idPrefix}-search-label`}>Find a tract or neighborhood</Label>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Tract ID or neighborhood" />
          <SearchField.ClearButton />
        </SearchField.Group>
        <Description>
          Search by census tract or City neighborhood. ZIP and address search are not available yet.
        </Description>
      </SearchField>
      <p aria-live="polite" className="text-xs text-muted" role="status">
        {statusText(normalizedQuery, stored)}
      </p>
      {response?.state === "available" && response.results.length > 0 ? (
        <ol aria-label="Search results" className="max-h-64 space-y-1 overflow-y-auto pe-1">
          {response.results.map((result) => {
            const isAlreadySelected = disabledGeoids.includes(result.geoid);
            return (
              <li key={result.id}>
                <Button
                  className="h-auto min-h-11 w-full justify-start px-2 py-2 text-left"
                  isDisabled={isAlreadySelected}
                  variant="ghost"
                  onPress={() => onSelect(result.geoid)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{result.title}</span>
                    <span className="block text-xs font-normal text-muted">
                      {isAlreadySelected ? "Already selected" : result.subtitle}
                    </span>
                  </span>
                </Button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
