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

export type OpportunityFilterWorkspaceProps = {
  appliedFilters: OpportunityFilterState;
  currentSearchParams: string;
  matchingTractCount: number | null;
};

type OpportunityFilterController = {
  draft: OpportunityFilterDraft;
  errors: OpportunityFilterErrors;
  onApply: (event: FormEvent<HTMLFormElement>) => void;
  onDraftChange: (draft: OpportunityFilterDraft) => void;
  onReset: () => void;
  statusMessage: string;
};

export function useOpportunityFilterController({
  appliedFilters,
  currentSearchParams,
  matchingTractCount,
}: OpportunityFilterWorkspaceProps): OpportunityFilterController {
  const router = useRouter();
  const identity = JSON.stringify(appliedFilters);
  const [state, setState] = useState(() => ({
    identity,
    draft: draftFromOpportunityFilters(appliedFilters),
    errors: {} as OpportunityFilterErrors,
  }));
  const current = state.identity === identity
    ? state
    : {identity, draft: draftFromOpportunityFilters(appliedFilters), errors: {}};
  if (state.identity !== identity) {
    setState(current);
  }

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateOpportunityFilterDraft(current.draft);
    setState((previous) => ({...previous, errors: result.errors}));
    if (!result.success) {
      const firstInvalidKey = NUMERIC_FILTER_KEYS.find((key) => result.errors[key]);
      const target = firstInvalidKey
        ? event.currentTarget.querySelector<HTMLElement>(`[name='${firstInvalidKey}']`)
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
  const statusMessage = `${appliedCount === 0
    ? "No filters applied."
    : `${appliedCount} ${appliedCount === 1 ? "filter" : "filters"} applied.`} ${resultMessage}`;

  return {
    draft: current.draft,
    errors: current.errors,
    onApply: apply,
    onDraftChange: (draft) => setState({identity, draft, errors: current.errors}),
    onReset: () => setState({
      identity,
      draft: draftFromOpportunityFilters(appliedFilters),
      errors: {},
    }),
    statusMessage,
  };
}

export function OpportunityFilterStatus({message}: {message: string}) {
  return (
    <p
      aria-atomic="true"
      aria-label="Applied filter update"
      aria-live="polite"
      className="sr-only"
      role="status"
    >
      {message}
    </p>
  );
}

export function OpportunityFilterPanel({
  appliedFilters,
  compact = false,
  controller,
  currentSearchParams,
  idPrefix,
}: {
  appliedFilters: OpportunityFilterState;
  compact?: boolean;
  controller: OpportunityFilterController;
  currentSearchParams: string;
  idPrefix: string;
}) {
  return (
    <section
      aria-label="Opportunity filters"
      className="space-y-6 rounded-[var(--mke-radius-panel)] border border-divider bg-background p-5 sm:p-6"
    >
      <OpportunityFilterForm
        compact={compact}
        draft={controller.draft}
        errors={controller.errors}
        idPrefix={idPrefix}
        onApply={controller.onApply}
        onDraftChange={controller.onDraftChange}
        onReset={controller.onReset}
      />
      <AppliedFilterChips
        currentSearchParams={currentSearchParams}
        filters={appliedFilters}
        idPrefix={idPrefix}
      />
    </section>
  );
}

export function OpportunityFilterWorkspace(props: OpportunityFilterWorkspaceProps) {
  const controller = useOpportunityFilterController(props);
  return (
    <>
      <OpportunityFilterStatus message={controller.statusMessage} />
      <OpportunityFilterPanel
        appliedFilters={props.appliedFilters}
        controller={controller}
        currentSearchParams={props.currentSearchParams}
        idPrefix="opportunity-filter"
      />
    </>
  );
}
