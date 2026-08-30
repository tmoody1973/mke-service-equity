"use client";

import type {AtlasResponse} from "@mke/contracts";
import {usePathname, useSearchParams} from "next/navigation";
import {useCallback, useEffect, useMemo} from "react";
import {MapCanvas} from "../map/map-canvas";
import {AtlasDataState} from "./atlas-data-state";
import {
  atlasHref,
  buildAtlasSearchParams,
  parseAtlasUrlState,
  type AtlasUrlState,
} from "./atlas-url-state";

type AtlasWorkspaceProps = {
  atlas: AtlasResponse;
  styleUrl: string;
};

export function AtlasWorkspace({atlas, styleUrl}: AtlasWorkspaceProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const availableGeoids = useMemo(() => new Set(
    atlas.state === "available"
      ? atlas.tracts.features.map((feature) => feature.properties.geoid)
      : [],
  ), [atlas]);
  const urlState = useMemo(
    () => parseAtlasUrlState(searchParams, availableGeoids),
    [availableGeoids, searchParams],
  );

  const writeUrlState = useCallback((nextState: AtlasUrlState, replace = false) => {
    const href = atlasHref(pathname, buildAtlasSearchParams(searchParams, nextState));
    if (replace) {
      window.history.replaceState(null, "", href);
    } else {
      window.history.pushState(null, "", href);
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    const normalized = buildAtlasSearchParams(searchParams, urlState);
    if (normalized.toString() !== searchParams.toString()) {
      writeUrlState(urlState, true);
    }
  }, [searchParams, urlState, writeUrlState]);

  return (
    <section
      aria-label="Map workspace"
      className="relative h-[calc(100dvh-3.5rem)] min-h-96 overflow-hidden border-t border-divider bg-default min-[768px]:h-[calc(100dvh-4rem)]"
      data-selected-tract={urlState.tract ?? ""}
      role="region"
    >
      <MapCanvas styleUrl={styleUrl} />
      <AtlasDataState response={atlas} />
    </section>
  );
}
