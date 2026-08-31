import type {Metadata} from "next";

import {ApplicationShell} from "../../../components/application-shell/application-shell";
import {
  toUrlSearchParams,
  type NextSearchParams,
} from "../../../features/analyze/next-search-params";
import {OpportunityPage} from "../../../features/opportunity/opportunity-page";
import {parseOpportunityUrlState} from "../../../features/opportunity/opportunity-url-state";
import {loadOpportunityWorkspace} from "../../../features/opportunity/server/load-opportunity-workspace";
import {getMapStyleUrl} from "../../../features/map/map-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "Find Milwaukee County Census tracts that match explicit Food Equity conditions.",
  title: "Opportunity Explorer | MKE Service Equity",
};

type OpportunityRouteProps = {
  searchParams: Promise<NextSearchParams>;
};

export default async function OpportunityRoute({searchParams}: OpportunityRouteProps) {
  const urlState = parseOpportunityUrlState(toUrlSearchParams(await searchParams));
  const workspace = urlState.state === "valid"
    ? await loadOpportunityWorkspace(urlState.filters)
    : {response: null, tracts: null};

  return (
    <ApplicationShell
      mainId="opportunity-workspace"
      pageTitle="Opportunity Explorer"
      skipLinkLabel="Skip to Opportunity Explorer"
    >
      <OpportunityPage
        response={workspace.response}
        styleUrl={getMapStyleUrl()}
        tracts={workspace.tracts}
        urlState={urlState}
      />
    </ApplicationShell>
  );
}
