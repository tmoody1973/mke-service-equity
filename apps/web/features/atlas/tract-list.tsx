"use client";

import type {AtlasTractFeature} from "@mke/contracts";

type TractListProps = {
  idPrefix?: string;
  onSelect: (geoid: string) => void;
  selectedTract: string | null;
  tracts: ReadonlyArray<AtlasTractFeature>;
};

function tractStateLabel(tract: AtlasTractFeature): string {
  if (tract.properties.qualityStatus === "insufficient_data") {
    return "Insufficient data";
  }
  if (tract.properties.qualityStatus === "ineligible_zero_population") {
    return "No recorded population — not scored";
  }
  return `Priority ${tract.properties.foodEquityPriority}`;
}

export function TractList({idPrefix = "atlas", onSelect, selectedTract, tracts}: TractListProps) {
  return (
    <section aria-labelledby={`${idPrefix}-tract-list-title`} className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold" id={`${idPrefix}-tract-list-title`}>Census tracts</h2>
        <span className="text-xs text-muted">
          {tracts.length} {tracts.length === 1 ? "tract" : "tracts"}
        </span>
      </div>
      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto pe-1">
        {tracts.map((tract) => {
          const selected = tract.id === selectedTract;
          const stateLabel = tractStateLabel(tract);
          return (
            <li key={tract.id}>
              <button
                aria-label={`${tract.properties.name}, Census tract ID ${tract.id}, ${stateLabel}`}
                aria-pressed={selected}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-2 text-left text-sm hover:bg-default focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--mke-focus)] aria-pressed:border-divider aria-pressed:bg-default"
                onClick={() => onSelect(String(tract.id))}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{tract.properties.name}</span>
                  <span className="block text-xs text-muted">Census tract ID {tract.id}</span>
                </span>
                <span className="shrink-0 text-xs font-medium">{stateLabel}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
