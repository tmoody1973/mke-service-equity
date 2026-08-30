import type {AtlasResponse} from "@mke/contracts";
import {AtlasWorkspace} from "../atlas/atlas-workspace";
import {getMapStyleUrl} from "./map-config";

type MapShellProps = {
  atlas?: AtlasResponse;
};

export function MapShell({
  atlas = {state: "unavailable", reason: "no_published_run"},
}: MapShellProps) {
  return <AtlasWorkspace atlas={atlas} styleUrl={getMapStyleUrl()} />;
}
