export const DEFAULT_ATLAS_LAYER = "food_equity_priority" as const;

export type AtlasLayer = typeof DEFAULT_ATLAS_LAYER;

export type AtlasUrlState = {
  tract: string | null;
  layer: AtlasLayer;
  priorities: Array<number>;
  foodSites: boolean;
  site: string | null;
};

type SearchParamsReader = {
  get(name: string): string | null;
  toString(): string;
};

function readPriorities(value: string | null): Array<number> {
  if (!value) {
    return [];
  }

  return [...new Set(value
    .split(",")
    .map((part) => Number(part))
    .filter((priority) => Number.isInteger(priority) && priority >= 1 && priority <= 5))]
    .sort((left, right) => left - right);
}

export function parseAtlasUrlState(
  searchParams: SearchParamsReader,
  availableGeoids: ReadonlySet<string>,
  availableFoodSiteIds: ReadonlySet<string> = new Set(),
): AtlasUrlState {
  const requestedTract = searchParams.get("tract");
  const requestedSite = searchParams.get("site");
  const site = requestedSite && availableFoodSiteIds.has(requestedSite) ? requestedSite : null;
  const foodSites = site !== null || searchParams.get("context")?.split(",").includes("food_sites")
    === true;

  return {
    tract: requestedTract && availableGeoids.has(requestedTract) ? requestedTract : null,
    layer: DEFAULT_ATLAS_LAYER,
    priorities: readPriorities(searchParams.get("priority")),
    foodSites,
    site,
  };
}

export function buildAtlasSearchParams(
  current: SearchParamsReader,
  state: AtlasUrlState,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  next.delete("tract");
  next.delete("layer");
  next.delete("priority");
  next.delete("context");
  next.delete("site");

  if (state.tract) {
    next.set("tract", state.tract);
  }
  if (state.layer !== DEFAULT_ATLAS_LAYER) {
    next.set("layer", state.layer);
  }
  if (state.priorities.length > 0) {
    next.set("priority", [...new Set(state.priorities)].sort((a, b) => a - b).join(","));
  }
  if (state.foodSites || state.site) {
    next.set("context", "food_sites");
  }
  if (state.site) {
    next.set("site", state.site);
  }

  return next;
}

export function atlasHref(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}
