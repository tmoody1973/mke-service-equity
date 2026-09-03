import type {
  PublicationRedistributionDecision,
} from "@mke/contracts";

type SourceDecision = {
  role: "canonical_geography" | "equity_input" | "food_scoring_input" | "food_context_input";
  redistributionDecision: PublicationRedistributionDecision;
  termsUrl: string | null;
  attribution: string;
  warning: string | null;
};

type ResourceDecision = {
  role: "scoring_inventory" | "public_display";
  redistributionDecision: PublicationRedistributionDecision;
  termsUrl: string | null;
  attribution: string;
  warning: string | null;
};

export class PublicationPolicyError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PublicationPolicyError";
  }
}

const sourceDecisions: Record<string, SourceDecision> = {
  tiger: {
    role: "canonical_geography",
    redistributionDecision: "public_derived_results",
    termsUrl: "https://www.census.gov/data/developers/about/terms-of-service.html",
    attribution: "United States Census Bureau",
    warning: null,
  },
  acs: {
    role: "equity_input",
    redistributionDecision: "public_derived_results",
    termsUrl: "https://www.census.gov/data/developers/about/terms-of-service.html",
    attribution: "United States Census Bureau",
    warning: null,
  },
  places: {
    role: "equity_input",
    redistributionDecision: "public_derived_results",
    termsUrl: "https://www.cdc.gov/other/agencymaterials.html",
    attribution: "Centers for Disease Control and Prevention",
    warning: null,
  },
  sram: {
    role: "food_scoring_input",
    redistributionDecision: "public_derived_results",
    termsUrl: "https://www.usda.gov/policies-and-links",
    attribution: "USDA Economic Research Service",
    warning: null,
  },
  snap_retailers: {
    role: "food_scoring_input",
    redistributionDecision: "public_derived_results",
    termsUrl: "https://www.usda.gov/policies-and-links",
    attribution: "USDA Food and Nutrition Service",
    warning: null,
  },
  acs_vehicle: {
    role: "food_scoring_input",
    redistributionDecision: "public_derived_results",
    termsUrl: "https://www.census.gov/data/developers/about/terms-of-service.html",
    attribution: "United States Census Bureau",
    warning: null,
  },
  tract_origins: {
    role: "food_scoring_input",
    redistributionDecision: "public_derived_results",
    termsUrl: "https://www.census.gov/data/developers/about/terms-of-service.html",
    attribution: "United States Census Bureau",
    warning: null,
  },
  mcts_gtfs: {
    role: "food_scoring_input",
    redistributionDecision: "public_derived_results",
    termsUrl: "https://www.ridemcts.com/policies/developer-terms",
    attribution: "Milwaukee County Transit System",
    warning: "Static schedule data; not sponsored or operated by MTS or MCTS.",
  },
  walking_network: {
    role: "food_scoring_input",
    redistributionDecision: "public_derived_results",
    termsUrl: "https://www.openstreetmap.org/copyright",
    attribution: "OpenStreetMap contributors and Geofabrik",
    warning: "Derived from OpenStreetMap data under ODbL 1.0.",
  },
  milwaukee_dcd_neighborhoods: {
    role: "food_context_input",
    redistributionDecision: "public_derived_results",
    termsUrl: "https://city.milwaukee.gov/mapmilwaukee/DownloadMapData3497",
    attribution: "City of Milwaukee Department of City Development and ITMD-GIS",
    warning: "City-published reference, not an official City or neighborhood-association boundary; City of Milwaukee coverage only.",
  },
  emergency_food_context: {
    role: "food_context_input",
    redistributionDecision: "prohibited_public_use",
    termsUrl: null,
    attribution: "Milwaukee Food Council and Data You Can Use",
    warning: "Stale, unverified context with no approved public reuse terms.",
  },
};

export function decideSourcePublication(sourceKey: string): SourceDecision {
  const normalizedKey = sourceKey.startsWith("acs-") ? "acs" : sourceKey;
  const decision = Object.hasOwn(sourceDecisions, normalizedKey)
    ? sourceDecisions[normalizedKey]
    : undefined;
  if (!decision) {
    throw new PublicationPolicyError("unreviewed_source");
  }
  return {...decision};
}

export function decideResourcePublication(input: {
  sourceKey: string;
  requestedRole: "scoring_inventory" | "public_display";
}): ResourceDecision {
  if (input.sourceKey === "emergency_food_context") {
    throw new PublicationPolicyError("prohibited_resource_source");
  }
  if (input.sourceKey !== "snap_retailers") {
    throw new PublicationPolicyError("unreviewed_resource_source");
  }
  if (input.requestedRole === "public_display") {
    throw new PublicationPolicyError("direct_display_not_approved");
  }
  return {
    role: "scoring_inventory",
    redistributionDecision: "internal_reproduction_only",
    termsUrl: null,
    attribution: "USDA Food and Nutrition Service",
    warning: null,
  };
}
