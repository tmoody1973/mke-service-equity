import {EmptyState} from "@heroui-pro/react";
import type {AtlasTractFeatureCollection, OpportunityResponse} from "@mke/contracts";
import Link from "next/link";

import {AnalysisUnavailableState} from "../analyze/analysis-unavailable-state";
import {OpportunityFilterWorkspace} from "./opportunity-filter-workspace";
import {OpportunityWorkspace} from "./opportunity-workspace";
import {
  opportunityHref,
  type OpportunityUrlParseResult,
} from "./opportunity-url-state";

type OpportunityPageProps = {
  response: OpportunityResponse | null;
  styleUrl: string;
  tracts: AtlasTractFeatureCollection | null;
  urlState: OpportunityUrlParseResult;
};

export function OpportunityPage({response, styleUrl, tracts, urlState}: OpportunityPageProps) {
  const recoveryHref = opportunityHref(
    "/analyze/opportunity",
    urlState.canonicalSearchParams,
  );
  const preview = response?.state === "available" && response.mode === "validated_preview";

  let content;
  if (urlState.state === "invalid") {
    content = (
      <EmptyState className="rounded-[var(--mke-radius-panel)] border border-divider bg-background p-6">
        <EmptyState.Header>
          <h2 className="text-lg font-semibold text-foreground">Some filter settings are not valid</h2>
        </EmptyState.Header>
        <EmptyState.Content className="mt-2 space-y-4">
          <p className="max-w-2xl text-sm leading-6 text-muted">
            We did not run a partial search. Continue with the settings we could safely understand,
            or clear the filters and start again.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
              href={recoveryHref}
            >
              Use the cleaned-up filters
            </Link>
            <Link
              className="inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4"
              href="/analyze/opportunity"
            >
              Clear all filters
            </Link>
          </div>
        </EmptyState.Content>
      </EmptyState>
    );
  } else if (response?.state === "unavailable") {
    content = (
      <AnalysisUnavailableState
        reason={response.reason}
        startOverHref="/analyze/opportunity"
      />
    );
  } else if (response?.state === "available" && tracts) {
    content = (
      <OpportunityWorkspace
        currentSearchParams={urlState.canonicalSearchParams.toString()}
        response={response}
        styleUrl={styleUrl}
        tracts={tracts}
      />
    );
  } else {
    content = (
      <AnalysisUnavailableState reason="results_incomplete" startOverHref="/analyze/opportunity" />
    );
  }

  return (
    <div className="min-h-full overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-3">
          {preview ? (
            <p
              className="w-fit rounded-full border border-divider bg-background px-3 py-1 text-xs font-semibold text-foreground"
              role="status"
            >
              Validated preview — not published
            </p>
          ) : null}
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-[-0.025em] text-foreground">
              Opportunity Explorer
            </h1>
            <p className="max-w-3xl text-base leading-7 text-muted">
              Find Census tracts that match conditions you choose. Results are not ranked and are
              not recommendations about where funding should go.
            </p>
          </div>
        </header>
        {urlState.state === "valid" && response?.state !== "available" ? (
          <OpportunityFilterWorkspace
            appliedFilters={urlState.filters}
            currentSearchParams={urlState.canonicalSearchParams.toString()}
            matchingTractCount={null}
          />
        ) : null}
        {content}
      </div>
    </div>
  );
}
