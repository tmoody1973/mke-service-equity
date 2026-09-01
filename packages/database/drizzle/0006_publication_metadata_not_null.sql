ALTER TABLE "atlas_publication_audit_events" DROP CONSTRAINT "atlas_publication_audit_events_error_check";--> statement-breakpoint
ALTER TABLE "atlas_publications" DROP CONSTRAINT "atlas_publications_state_metadata_check";--> statement-breakpoint
ALTER TABLE "atlas_publication_audit_events" ADD CONSTRAINT "atlas_publication_audit_events_error_check" CHECK (("atlas_publication_audit_events"."outcome" IN ('rejected', 'failed')
        AND "atlas_publication_audit_events"."error_code" IS NOT NULL
        AND btrim("atlas_publication_audit_events"."error_code") <> '')
        OR ("atlas_publication_audit_events"."outcome" IN ('attempted', 'succeeded') AND "atlas_publication_audit_events"."error_code" IS NULL));--> statement-breakpoint
ALTER TABLE "atlas_publications" ADD CONSTRAINT "atlas_publications_state_metadata_check" CHECK ((
        "atlas_publications"."state" = 'published'
        AND "atlas_publications"."superseded_at" IS NULL
        AND "atlas_publications"."superseded_by" IS NULL
        AND "atlas_publications"."superseded_reason" IS NULL
        AND "atlas_publications"."superseded_by_publication_id" IS NULL
      ) OR (
        "atlas_publications"."state" = 'superseded'
        AND "atlas_publications"."superseded_at" IS NOT NULL
        AND "atlas_publications"."superseded_by" IS NOT NULL
        AND btrim("atlas_publications"."superseded_by") <> ''
        AND "atlas_publications"."superseded_reason" IS NOT NULL
        AND btrim("atlas_publications"."superseded_reason") <> ''
      ));