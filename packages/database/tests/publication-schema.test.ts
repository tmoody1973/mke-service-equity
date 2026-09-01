import {getTableConfig, type PgTable} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";
import {
  atlasPublicationAuditEvents,
  atlasPublicationEquityComponentMembers,
  atlasPublicationFoodComponentMembers,
  atlasPublicationResourceVersionMembers,
  atlasPublications,
  atlasPublicationScoreMembers,
  atlasPublicationSourceSnapshotMembers,
  atlasPublicationStateEnum,
  publicationRedistributionDecisionEnum,
} from "../src/schema";

const tables = [
  atlasPublications,
  atlasPublicationScoreMembers,
  atlasPublicationEquityComponentMembers,
  atlasPublicationFoodComponentMembers,
  atlasPublicationSourceSnapshotMembers,
  atlasPublicationResourceVersionMembers,
  atlasPublicationAuditEvents,
] as const;

function config(table: PgTable) {
  return getTableConfig(table);
}

describe("MOO-768 publication schema contract", () => {
  it("declares the seven governed release and audit tables", () => {
    expect(tables.map((table) => config(table).name)).toEqual([
      "atlas_publications",
      "atlas_publication_score_members",
      "atlas_publication_equity_component_members",
      "atlas_publication_food_component_members",
      "atlas_publication_source_snapshot_members",
      "atlas_publication_resource_version_members",
      "atlas_publication_audit_events",
    ]);
  });

  it("locks release state and redistribution decisions", () => {
    expect(atlasPublicationStateEnum.enumValues).toEqual(["published", "superseded"]);
    expect(publicationRedistributionDecisionEnum.enumValues).toEqual([
      "public_derived_results",
      "public_direct_display",
      "internal_reproduction_only",
      "prohibited_public_use",
    ]);
  });

  it("pins a release to exact Food and Equity runs with immutable identity", () => {
    const publication = config(atlasPublications);
    expect(publication.foreignKeys).toHaveLength(3);
    expect(publication.uniqueConstraints.map((item) => item.getName())).toEqual(
      expect.arrayContaining([
        "atlas_publications_food_run_unique",
        "atlas_publications_bundle_fingerprint_unique",
        "atlas_publications_idempotency_key_unique",
      ]),
    );
    expect(publication.indexes.map((item) => item.config.name)).toContain(
      "atlas_publications_one_current_idx",
    );
    expect(publication.checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "atlas_publications_hashes_check",
        "atlas_publications_state_metadata_check",
      ]),
    );
  });

  it("uses relational foreign keys for every release member", () => {
    expect(config(atlasPublicationScoreMembers).foreignKeys).toHaveLength(4);
    expect(config(atlasPublicationEquityComponentMembers).foreignKeys).toHaveLength(3);
    expect(config(atlasPublicationFoodComponentMembers).foreignKeys).toHaveLength(3);
    expect(config(atlasPublicationSourceSnapshotMembers).foreignKeys).toHaveLength(2);
    expect(config(atlasPublicationResourceVersionMembers).foreignKeys).toHaveLength(2);
  });

  it("keeps audit evidence append-only and bounded by schema checks", () => {
    const audit = config(atlasPublicationAuditEvents);
    expect(audit.foreignKeys).toHaveLength(1);
    expect(audit.checks.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        "atlas_publication_audit_events_request_hash_check",
        "atlas_publication_audit_events_error_check",
      ]),
    );
  });
});
