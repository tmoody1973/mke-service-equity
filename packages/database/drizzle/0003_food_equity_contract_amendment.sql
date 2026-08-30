ALTER TABLE "food_resource_versions" DROP CONSTRAINT "food_resource_versions_resource_snapshot_unique";--> statement-breakpoint
ALTER TABLE "food_resource_versions" DROP CONSTRAINT "food_resource_versions_verified_at_check";--> statement-breakpoint
ALTER TABLE "food_resource_versions" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "food_resource_versions" ALTER COLUMN "active" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "food_scores" ADD COLUMN "exclusion_reasons" jsonb;--> statement-breakpoint
UPDATE "food_scores" SET "exclusion_reasons" = '[]'::jsonb WHERE "quality_status" = 'complete' AND "exclusion_reasons" IS NULL;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "food_scores" WHERE "exclusion_reasons" IS NULL) THEN
    RAISE EXCEPTION 'cannot amend existing incomplete food_scores without source-backed exclusion reasons';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "food_scores" ALTER COLUMN "exclusion_reasons" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "food_resource_versions" ADD CONSTRAINT "food_resource_versions_identity_unique" UNIQUE NULLS NOT DISTINCT("resource_id","snapshot_id","valid_from","valid_to");--> statement-breakpoint
ALTER TABLE "food_resource_versions" ADD CONSTRAINT "food_resource_versions_verified_at_check" CHECK ("food_resource_versions"."verification_status" NOT IN ('override_verified', 'verified_context') OR "food_resource_versions"."verified_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "food_scores" ADD CONSTRAINT "food_scores_exclusion_reasons_check" CHECK (CASE
  WHEN jsonb_typeof("food_scores"."exclusion_reasons") = 'array'
  THEN ("food_scores"."quality_status" = 'complete' AND jsonb_array_length("food_scores"."exclusion_reasons") = 0)
    OR ("food_scores"."quality_status" <> 'complete' AND jsonb_array_length("food_scores"."exclusion_reasons") > 0)
  ELSE false
END);
