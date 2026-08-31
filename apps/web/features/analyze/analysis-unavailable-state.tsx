import {EmptyState} from "@heroui-pro/react";
import type {
  AtlasUnavailableReason,
  CompareUnavailableReason,
  OpportunityUnavailableReason,
} from "@mke/contracts";
import Link from "next/link";

type AnalysisUnavailableReason = AtlasUnavailableReason
  | CompareUnavailableReason
  | OpportunityUnavailableReason;

type AnalysisUnavailableStateProps = {
  reason: AnalysisUnavailableReason;
  startOverHref: string;
};

function unavailableCopy(reason: AnalysisUnavailableReason) {
  if (reason === "no_published_run") {
    return {
      description: "A reviewed Food Equity data release has not been published yet. Nothing from a private preview is shown here.",
      title: "No published Food Equity results yet",
    };
  }
  if (reason === "unknown_tract") {
    return {
      description: "At least one Census tract ID is not part of the selected data release. Start again and choose available areas.",
      title: "One area is not available",
    };
  }
  if (reason === "invalid_request" || reason === "invalid_filters") {
    return {
      description: "The link contains settings this page cannot use. Start again to create a valid analysis.",
      title: "This analysis link is not valid",
    };
  }
  if (
    reason === "preview_not_allowed"
    || reason === "run_not_found"
    || reason === "run_not_validated"
  ) {
    return {
      description: "This private preview is not available. Check the preview setup or return to the public Atlas.",
      title: "Preview unavailable",
    };
  }
  return {
    description: "We could not load complete, verified information for this analysis. Please try again later.",
    title: "Analysis temporarily unavailable",
  };
}

export function AnalysisUnavailableState({
  reason,
  startOverHref,
}: AnalysisUnavailableStateProps) {
  const copy = unavailableCopy(reason);
  const expectedUnavailable = reason === "no_published_run" || reason === "unknown_tract";

  return (
    <EmptyState
      className="rounded-[var(--mke-radius-panel)] border border-divider bg-background p-6 text-left"
      role={expectedUnavailable ? "status" : "alert"}
    >
      <EmptyState.Header>
        <h2 className="text-lg font-semibold text-foreground">{copy.title}</h2>
      </EmptyState.Header>
      <EmptyState.Content className="mt-2 space-y-4">
        <p className="max-w-2xl text-sm leading-6 text-muted">{copy.description}</p>
        <Link
          className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
          href={startOverHref}
        >
          Start over
        </Link>
      </EmptyState.Content>
    </EmptyState>
  );
}
