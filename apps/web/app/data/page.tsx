import type {Metadata} from "next";

import {ApplicationShell} from "../../components/application-shell/application-shell";
import {DataPage} from "../../features/data/data-page";
import {loadTractEvidenceExportAvailability} from "../../features/data/server/load-tract-export";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "Download the complete public tract-level data behind the MKE Food Equity Atlas.",
  title: "Download Data | MKE Service Equity",
};

export default async function DataRoute() {
  const availability = await loadTractEvidenceExportAvailability();
  return (
    <ApplicationShell mainId="data-workspace" pageTitle="Download data" skipLinkLabel="Skip to Download data">
      <DataPage availability={availability} />
    </ApplicationShell>
  );
}
