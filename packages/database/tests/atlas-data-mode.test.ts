import {describe, expect, it} from "vitest";
import {readAtlasDataMode} from "../src/atlas/data-mode";

describe("readAtlasDataMode", () => {
  it("defaults to public published-only mode", () => {
    expect(readAtlasDataMode({})).toEqual({state: "allowed", mode: "published"});
  });

  it("accepts explicit published mode in production", () => {
    expect(readAtlasDataMode({
      MKE_ATLAS_DATA_MODE: "published",
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    })).toEqual({state: "allowed", mode: "published"});
  });

  it("allows an exact validated preview only in local development", () => {
    expect(readAtlasDataMode({
      MKE_ATLAS_DATA_MODE: "validated_preview",
      MKE_ATLAS_PREVIEW_RUN_ID: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
      MKE_PIPELINE_ENV: "development",
      NODE_ENV: "development",
    })).toEqual({
      state: "allowed",
      mode: "validated_preview",
      runId: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
    });
  });

  it.each([
    {name: "missing run id", environment: {
      MKE_ATLAS_DATA_MODE: "validated_preview",
      MKE_PIPELINE_ENV: "development",
      NODE_ENV: "development",
    }},
    {name: "invalid run id", environment: {
      MKE_ATLAS_DATA_MODE: "validated_preview",
      MKE_ATLAS_PREVIEW_RUN_ID: "latest",
      MKE_PIPELINE_ENV: "development",
      NODE_ENV: "development",
    }},
    {name: "wrong pipeline environment", environment: {
      MKE_ATLAS_DATA_MODE: "validated_preview",
      MKE_ATLAS_PREVIEW_RUN_ID: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
      MKE_PIPELINE_ENV: "test",
      NODE_ENV: "development",
    }},
    {name: "production Node environment", environment: {
      MKE_ATLAS_DATA_MODE: "validated_preview",
      MKE_ATLAS_PREVIEW_RUN_ID: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
      MKE_PIPELINE_ENV: "development",
      NODE_ENV: "production",
    }},
    {name: "Vercel production", environment: {
      MKE_ATLAS_DATA_MODE: "validated_preview",
      MKE_ATLAS_PREVIEW_RUN_ID: "97bd1cdf-bf96-573f-8fcf-92e8676925d4",
      MKE_PIPELINE_ENV: "development",
      NODE_ENV: "development",
      VERCEL_ENV: "production",
    }},
    {name: "unknown mode", environment: {
      MKE_ATLAS_DATA_MODE: "latest",
    }},
  ])("fails closed for $name", ({environment}) => {
    expect(readAtlasDataMode(environment)).toEqual({
      state: "unavailable",
      reason: "preview_not_allowed",
    });
  });
});
