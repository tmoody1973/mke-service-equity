import type {Metadata} from "next";

import {ApplicationShell} from "../../../components/application-shell/application-shell";
import {
  toUrlSearchParams,
  type NextSearchParams,
} from "../../../features/analyze/next-search-params";
import {loadAnalysisAvailability} from "../../../features/analyze/server/load-analysis-availability";
import {ComparePage} from "../../../features/compare/compare-page";
import {parseCompareUrlState} from "../../../features/compare/compare-url-state";
import {loadComparison} from "../../../features/compare/server/load-comparison";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "Compare Food Equity results for two to five Milwaukee County Census tracts.",
  title: "Compare Areas | MKE Service Equity",
};

type CompareRouteProps = {
  searchParams: Promise<NextSearchParams>;
};

export default async function CompareRoute({searchParams}: CompareRouteProps) {
  const urlState = parseCompareUrlState(toUrlSearchParams(await searchParams));
  const availability = urlState.state === "setup"
    ? await loadAnalysisAvailability()
    : null;
  const comparison = urlState.state === "ready"
    ? await loadComparison(urlState.value.tracts)
    : null;

  return (
    <ApplicationShell
      mainId="compare-workspace"
      pageTitle="Compare Areas"
      skipLinkLabel="Skip to Compare Areas"
    >
      <ComparePage
        availability={availability}
        comparison={comparison}
        urlState={urlState}
      />
    </ApplicationShell>
  );
}
