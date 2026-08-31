import type {AtlasResponse, OpportunityResponse} from "@mke/contracts";
import {describe, expect, it, vi} from "vitest";

import {
  OPPORTUNITY_RESPONSE,
  OPPORTUNITY_RUN,
  OPPORTUNITY_TRACTS,
} from "../opportunity-test-fixture";
import {
  loadOpportunityWorkspace,
  type LoadOpportunityWorkspaceDependencies,
} from "./load-opportunity-workspace";

const atlas: AtlasResponse = {
  state: "available",
  mode: "validated_preview",
  run: OPPORTUNITY_RUN,
  tracts: OPPORTUNITY_TRACTS,
  contextLayers: {
    foodSites: {state: "unavailable", reason: "snapshot_not_configured"},
  },
};

function dependencies(
  opportunity: OpportunityResponse = OPPORTUNITY_RESPONSE,
  atlasResponse: AtlasResponse = atlas,
): LoadOpportunityWorkspaceDependencies {
  return {
    loadOpportunity: vi.fn(() => Promise.resolve(opportunity)),
    loadAtlas: vi.fn(() => Promise.resolve(atlasResponse)),
  };
}

describe("loadOpportunityWorkspace", () => {
  it("passes geometry and matching GEOIDs through only when the exact run agrees", async () => {
    await expect(loadOpportunityWorkspace(
      OPPORTUNITY_RESPONSE.filters,
      {},
      dependencies(),
    )).resolves.toEqual({
      response: OPPORTUNITY_RESPONSE,
      tracts: OPPORTUNITY_TRACTS,
    });
  });

  it("fails closed when Atlas geometry belongs to another run", async () => {
    const mismatch: AtlasResponse = atlas.state === "available"
      ? {...atlas, run: {...atlas.run, id: "502e2a04-b013-53cd-8b09-c9144862701a"}}
      : atlas;

    await expect(loadOpportunityWorkspace(
      OPPORTUNITY_RESPONSE.filters,
      {},
      dependencies(OPPORTUNITY_RESPONSE, mismatch),
    )).resolves.toEqual({
      response: {state: "unavailable", reason: "results_incomplete"},
      tracts: null,
    });
  });

  it("fails closed rather than highlighting a partial or disagreeing matching set", async () => {
    const missing = atlas.state === "available"
      ? {...atlas, tracts: {...atlas.tracts, features: atlas.tracts.features.slice(1)}}
      : atlas;

    await expect(loadOpportunityWorkspace(
      OPPORTUNITY_RESPONSE.filters,
      {},
      dependencies(OPPORTUNITY_RESPONSE, missing),
    )).resolves.toEqual({
      response: {state: "unavailable", reason: "results_incomplete"},
      tracts: null,
    });

    const disagreeing = atlas.state === "available"
      ? {
        ...atlas,
        tracts: {
          ...atlas.tracts,
          features: atlas.tracts.features.map((feature) => feature.id === "55079000101"
            ? {...feature, properties: {...feature.properties, population: 999}}
            : feature),
        },
      }
      : atlas;

    await expect(loadOpportunityWorkspace(
      OPPORTUNITY_RESPONSE.filters,
      {},
      dependencies(OPPORTUNITY_RESPONSE, disagreeing),
    )).resolves.toEqual({
      response: {state: "unavailable", reason: "results_incomplete"},
      tracts: null,
    });
  });

  it("preserves a safe unavailable Opportunity response without exposing geometry", async () => {
    await expect(loadOpportunityWorkspace(
      OPPORTUNITY_RESPONSE.filters,
      {},
      dependencies({state: "unavailable", reason: "no_published_run"}),
    )).resolves.toEqual({
      response: {state: "unavailable", reason: "no_published_run"},
      tracts: null,
    });
  });
});
