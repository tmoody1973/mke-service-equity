import {describe, expect, it} from "vitest";
import {
  decideResourcePublication,
  decideSourcePublication,
  PublicationPolicyError,
} from "../src/publication/policy";

describe("publication source policy", () => {
  it.each([
    ["acs", "United States Census Bureau"],
    ["places", "Centers for Disease Control and Prevention"],
    ["sram", "USDA Economic Research Service"],
    ["walking_network", "OpenStreetMap contributors and Geofabrik"],
    ["mcts_gtfs", "Milwaukee County Transit System"],
  ] as const)("permits attributed derived results for %s", (sourceKey, attribution) => {
    expect(decideSourcePublication(sourceKey)).toMatchObject({
      redistributionDecision: "public_derived_results",
      attribution,
    });
  });

  it("blocks the stale Plan 3 emergency-food source", () => {
    expect(decideSourcePublication("emergency_food_context")).toEqual({
      role: "food_context_input",
      redistributionDecision: "prohibited_public_use",
      termsUrl: null,
      attribution: "Milwaukee Food Council and Data You Can Use",
      warning: "Stale, unverified context with no approved public reuse terms.",
    });
  });

  it("fails closed for an unknown source", () => {
    expect(() => decideSourcePublication("latest_food_layer"))
      .toThrowError(new PublicationPolicyError("unreviewed_source"));
  });

  it.each(["constructor", "toString", "valueOf"])(
    "fails closed for the inherited object key %s",
    (sourceKey) => {
      expect(() => decideSourcePublication(sourceKey))
        .toThrowError(new PublicationPolicyError("unreviewed_source"));
    },
  );
});

describe("publication resource policy", () => {
  it("pins FNS scoring inventory without approving direct display", () => {
    expect(decideResourcePublication({
      sourceKey: "snap_retailers",
      requestedRole: "scoring_inventory",
    })).toEqual({
      role: "scoring_inventory",
      redistributionDecision: "internal_reproduction_only",
      termsUrl: null,
      attribution: "USDA Food and Nutrition Service",
      warning: null,
    });
  });

  it("rejects automatic direct display and every emergency-food resource", () => {
    expect(() => decideResourcePublication({
      sourceKey: "snap_retailers",
      requestedRole: "public_display",
    })).toThrowError(new PublicationPolicyError("direct_display_not_approved"));
    expect(() => decideResourcePublication({
      sourceKey: "emergency_food_context",
      requestedRole: "public_display",
    })).toThrowError(new PublicationPolicyError("prohibited_resource_source"));
  });
});
