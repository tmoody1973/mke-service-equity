import type {Metadata} from "next";

import {ApplicationShell} from "../components/application-shell/application-shell";
import {loadAtlas} from "../features/atlas/server/load-atlas";
import {MapShell} from "../features/map/map-shell";

// Until MOO-768 provides an immutable published-bundle cache key, Atlas run
// selection remains request-time and validated preview must never enter a shared cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "Explore how food access and community conditions vary across Milwaukee County.",
  title: "Food Equity Atlas | MKE Service Equity",
};

export default async function AtlasPage() {
  const atlas = await loadAtlas();

  return (
    <ApplicationShell>
      <h1 className="sr-only">Food Equity Atlas</h1>
      <MapShell atlas={atlas} />
    </ApplicationShell>
  );
}
