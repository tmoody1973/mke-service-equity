import {ApplicationShell} from "../components/application-shell/application-shell";
import {MapShell} from "../features/map/map-shell";

export default function AtlasPage() {
  return (
    <ApplicationShell>
      <h1 className="sr-only">Food Equity Atlas</h1>
      <MapShell />
    </ApplicationShell>
  );
}
