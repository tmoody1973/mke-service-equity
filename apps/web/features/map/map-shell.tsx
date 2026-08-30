import type {AtlasResponse} from "@mke/contracts";
import {AtlasDataState} from "../atlas/atlas-data-state";
import {getMapStyleUrl} from "./map-config";
import {MapCanvas} from "./map-canvas";

type MapShellProps = {
  atlas?: AtlasResponse;
};

export function MapShell({
  atlas = {state: "unavailable", reason: "no_published_run"},
}: MapShellProps) {
  return (
    <section
      aria-label="Map workspace"
      className="relative h-[calc(100dvh-3.5rem)] min-h-96 overflow-hidden border-t border-divider bg-default min-[768px]:h-[calc(100dvh-4rem)]"
      role="region"
    >
      <MapCanvas styleUrl={getMapStyleUrl()} />
      <AtlasDataState response={atlas} />
    </section>
  );
}
