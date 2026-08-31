import {EmptyState} from "@heroui-pro/react";
import type {CompareResponse} from "@mke/contracts";
import Link from "next/link";

import type {AnalysisAvailability} from "../analyze/server/load-analysis-availability";
import {AnalysisUnavailableState} from "../analyze/analysis-unavailable-state";
import {ComparePicker, type ComparePickerTract} from "./compare-picker";
import {
  compareHref,
  type CompareUrlParseResult,
} from "./compare-url-state";

type ComparePageProps = {
  availability: AnalysisAvailability | null;
  comparison: CompareResponse | null;
  urlState: CompareUrlParseResult;
};

function PreviewNotice() {
  return (
    <p
      className="w-fit rounded-full border border-divider bg-background px-3 py-1 text-xs font-semibold text-foreground"
      role="status"
    >
      Validated preview — not published
    </p>
  );
}

export function ComparePage({availability, comparison, urlState}: ComparePageProps) {
  const recoveryHref = compareHref("/analyze/compare", urlState.canonicalSearchParams);
  const preview = availability?.state === "available"
    ? availability.mode === "validated_preview"
    : comparison?.state === "available" && comparison.mode === "validated_preview";
  const unavailableReason = availability?.state === "unavailable"
    ? availability.reason
    : comparison?.state === "unavailable"
      ? comparison.reason
      : null;
  const pickerBlocked = unavailableReason === "no_published_run"
    || unavailableReason === "preview_not_allowed"
    || unavailableReason === "run_not_found"
    || unavailableReason === "run_not_validated";
  const selectedTracts: Array<ComparePickerTract> = urlState.state === "invalid"
    ? []
    : urlState.value.tracts.map((geoid) => ({
        geoid,
        name: comparison?.state === "available"
          ? comparison.tracts.find((candidate) => candidate.tract.geoid === geoid)?.tract.name
          : undefined,
      }));
  const showPicker = urlState.state !== "invalid" && !pickerBlocked;

  let content;
  if (urlState.state === "invalid") {
    content = (
      <EmptyState className="rounded-[var(--mke-radius-panel)] border border-divider bg-background p-6">
        <EmptyState.Header>
          <h2 className="text-lg font-semibold text-foreground">This comparison link is not valid</h2>
        </EmptyState.Header>
        <EmptyState.Content className="mt-2 space-y-4">
          <p className="max-w-2xl text-sm leading-6 text-muted">
            Use two to five different Census tract IDs. We did not load a partial comparison.
          </p>
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
            href={recoveryHref}
          >
            Start a new comparison
          </Link>
        </EmptyState.Content>
      </EmptyState>
    );
  } else if (urlState.state === "setup") {
    if (availability?.state === "unavailable") {
      content = (
        <AnalysisUnavailableState
          reason={availability.reason}
          startOverHref="/analyze/compare"
        />
      );
    } else {
      const selectedTract = urlState.value.tracts[0];
      content = (
        <EmptyState className="rounded-[var(--mke-radius-panel)] border border-divider bg-background p-6">
          <EmptyState.Header>
            <h2 className="text-lg font-semibold text-foreground">
              {selectedTract ? "Add one more area" : "Choose areas to compare"}
            </h2>
          </EmptyState.Header>
          <EmptyState.Content className="mt-2 space-y-4">
            <p className="max-w-2xl text-sm leading-6 text-muted">
              {selectedTract
                ? `Census tract ID ${selectedTract} is selected. Add at least one more area to compare results side by side.`
                : "Choose two to five Census tracts to compare their results side by side. The order you choose is the order we show."}
            </p>
            <Link
              className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
              href="/"
            >
              Explore the Atlas
            </Link>
          </EmptyState.Content>
        </EmptyState>
      );
    }
  } else if (comparison?.state === "unavailable") {
    content = (
      <AnalysisUnavailableState
        reason={comparison.reason}
        startOverHref="/analyze/compare"
      />
    );
  } else if (comparison?.state === "available") {
    content = (
      <section aria-labelledby="loaded-comparison-heading" className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground" id="loaded-comparison-heading">
          Areas in this comparison
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2" role="list">
          {comparison.tracts.map(({tract}) => (
            <li
              className="rounded-[var(--mke-radius-panel)] border border-divider bg-background p-4"
              key={tract.geoid}
            >
              <p className="font-semibold text-foreground">{tract.name}</p>
              <p className="mt-1 text-sm text-muted">Census tract ID {tract.geoid}</p>
            </li>
          ))}
        </ul>
      </section>
    );
  } else {
    content = (
      <AnalysisUnavailableState reason="comparison_incomplete" startOverHref="/analyze/compare" />
    );
  }

  return (
    <div className="min-h-full overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-3">
          {preview ? <PreviewNotice /> : null}
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-[-0.025em] text-foreground">
              Compare Areas
            </h1>
            <p className="max-w-3xl text-base leading-7 text-muted">
              Put two to five Milwaukee County Census tracts next to each other. This shows
              differences in the data without ranking one area as better or worse.
            </p>
          </div>
        </header>
        {showPicker ? (
          <ComparePicker
            currentSearchParams={urlState.canonicalSearchParams.toString()}
            selectedTracts={selectedTracts}
          />
        ) : null}
        {content}
      </div>
    </div>
  );
}
