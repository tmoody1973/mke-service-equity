"use client";

import type {OpportunityFilterState} from "@mke/contracts";
import {useRouter} from "next/navigation";
import {useState, type FormEvent} from "react";

import {AppliedFilterChips} from "./applied-filter-chips";
import {OpportunityFilterForm} from "./opportunity-filter-form";
import {
  countOpportunityFilters,
  draftFromOpportunityFilters,
  NUMERIC_FILTER_KEYS,
  type OpportunityFilterDraft,
  type OpportunityFilterErrors,
  validateOpportunityFilterDraft,
} from "./opportunity-filter-state";
import {buildOpportunitySearchParams, opportunityHref} from "./opportunity-url-state";

type OpportunityFilterWorkspaceProps = {
  appliedFilters: OpportunityFilterState;
  currentSearchParams: string;
  matchingTractCount: number | null;
};

function OpportunityFilterWorkspaceState({
  appliedFilters,
  currentSearchParams,
  matchingTractCount,
}: OpportunityFilterWorkspaceProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<OpportunityFilterDraft>(() => (
    draftFromOpportunityFilters(appliedFilters)
  ));
  const [errors, setErrors] = useState<OpportunityFilterErrors>({});

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateOpportunityFilterDraft(draft);
    setErrors(result.errors);
    if (!result.success) {
      const firstInvalidKey = NUMERIC_FILTER_KEYS.find((key) => result.errors[key]);
      const target = firstInvalidKey
        ? document.getElementById(`opportunity-filter-${firstInvalidKey}`)
        : event.currentTarget.querySelector<HTMLElement>("[role='alert']");
      target?.focus();
      return;
    }
    const next = buildOpportunitySearchParams(
      new URLSearchParams(currentSearchParams),
      result.filters,
    );
    router.push(opportunityHref("/analyze/opportunity", next), {scroll: false});
  };

  const appliedCount = countOpportunityFilters(appliedFilters);
  const resultMessage = matchingTractCount === null
    ? "Results are unavailable."
    : `${matchingTractCount.toLocaleString("en-US")} matching ${matchingTractCount === 1 ? "area" : "areas"}.`;
  return (
    <section
      aria-label="Opportunity filters"
      className="space-y-6 rounded-[var(--mke-radius-panel)] border border-divider bg-background p-5 sm:p-6"
    >
      <p
        aria-atomic="true"
        aria-label="Applied filter update"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {appliedCount === 0
          ? "No filters applied."
          : `${appliedCount} ${appliedCount === 1 ? "filter" : "filters"} applied.`}{" "}
        {resultMessage}
      </p>
      <OpportunityFilterForm
        draft={draft}
        errors={errors}
        onApply={apply}
        onDraftChange={setDraft}
        onReset={() => {
          setDraft(draftFromOpportunityFilters(appliedFilters));
          setErrors({});
        }}
      />
      <AppliedFilterChips
        currentSearchParams={currentSearchParams}
        filters={appliedFilters}
      />
    </section>
  );
}

export function OpportunityFilterWorkspace(props: OpportunityFilterWorkspaceProps) {
  return (
    <OpportunityFilterWorkspaceState
      {...props}
      key={JSON.stringify(props.appliedFilters)}
    />
  );
}
