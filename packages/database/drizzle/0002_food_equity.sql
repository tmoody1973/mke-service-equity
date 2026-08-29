CREATE TYPE "public"."food_access_need_band" AS ENUM('very_low', 'low', 'moderate', 'high', 'very_high');--> statement-breakpoint
CREATE TYPE "public"."food_metric_state" AS ENUM('observed', 'unreachable', 'missing', 'suppressed', 'conflicting');--> statement-breakpoint
CREATE TYPE "public"."food_resource_category" AS ENUM('full_service_grocery', 'candidate_full_service', 'grocery_other', 'convenience', 'combination_grocery_other', 'specialty_bakery', 'specialty_produce', 'specialty_meat', 'specialty_seafood', 'seasonal_or_direct', 'restricted_access', 'non_fixed_or_online', 'emergency_food_bank', 'emergency_food_pantry', 'emergency_pantry_recovery', 'emergency_meal_program', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."food_resource_coordinate_status" AS ENUM('source_coordinate', 'authoritative_geocode', 'manually_verified', 'invalid', 'missing');--> statement-breakpoint
CREATE TYPE "public"."food_resource_verification_status" AS ENUM('verified', 'override_verified', 'unverified', 'verified_context', 'stale_unverified_context', 'unroutable_context');--> statement-breakpoint
CREATE TYPE "public"."food_score_run_status" AS ENUM('draft', 'validated', 'failed');--> statement-breakpoint
CREATE TABLE "food_access_metric_snapshots" (
	"access_metric_value_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	CONSTRAINT "food_access_metric_snapshots_pk" PRIMARY KEY("access_metric_value_id","snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "food_access_metric_values" (
	"id" uuid PRIMARY KEY NOT NULL,
	"geography_id" uuid NOT NULL,
	"primary_snapshot_id" uuid NOT NULL,
	"nearest_resource_version_id" uuid,
	"metric_slug" text NOT NULL,
	"value" numeric(15, 12),
	"state" "food_metric_state" NOT NULL,
	"unit" text NOT NULL,
	"calculation_version" text NOT NULL,
	"calculation_fingerprint" char(64) NOT NULL,
	"quality_status" "data_quality_status" NOT NULL,
	"quality_metadata" jsonb NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "food_access_metric_values_calculation_unique" UNIQUE("geography_id","metric_slug","calculation_fingerprint"),
	CONSTRAINT "food_access_metric_values_id_geography_unique" UNIQUE("id","geography_id"),
	CONSTRAINT "food_access_metric_values_hash_check" CHECK ("food_access_metric_values"."calculation_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "food_access_metric_values_slug_check" CHECK (btrim("food_access_metric_values"."metric_slug") <> ''),
	CONSTRAINT "food_access_metric_values_unit_check" CHECK (btrim("food_access_metric_values"."unit") <> '' AND btrim("food_access_metric_values"."calculation_version") <> ''),
	CONSTRAINT "food_access_metric_values_value_state_check" CHECK ((
        "food_access_metric_values"."state" = 'observed' AND "food_access_metric_values"."value" IS NOT NULL
      ) OR (
        "food_access_metric_values"."state" IN ('unreachable', 'missing', 'suppressed', 'conflicting')
        AND "food_access_metric_values"."value" IS NULL
      )),
	CONSTRAINT "food_access_metric_values_quality_check" CHECK ((
        "food_access_metric_values"."state" IN ('observed', 'unreachable')
        AND "food_access_metric_values"."quality_status" IN ('verified', 'provisional', 'stale')
      ) OR (
        "food_access_metric_values"."state" = 'missing' AND "food_access_metric_values"."quality_status" = 'missing'
      ) OR (
        "food_access_metric_values"."state" = 'suppressed' AND "food_access_metric_values"."quality_status" = 'suppressed'
      ) OR (
        "food_access_metric_values"."state" = 'conflicting' AND "food_access_metric_values"."quality_status" = 'conflicting'
      ))
);
--> statement-breakpoint
CREATE TABLE "food_resource_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"resource_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"version_fingerprint" char(64) NOT NULL,
	"category" "food_resource_category" NOT NULL,
	"name" text NOT NULL,
	"subtype" text,
	"address" text,
	"city" text,
	"postal_code" text,
	"website" text,
	"phone" text,
	"hours" jsonb,
	"geometry" geometry(Point,4326),
	"coordinate_status" "food_resource_coordinate_status" NOT NULL,
	"verification_status" "food_resource_verification_status" NOT NULL,
	"classification_evidence" jsonb NOT NULL,
	"full_service_grocery" boolean NOT NULL,
	"snap_authorized" boolean,
	"active" boolean NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "food_resource_versions_fingerprint_unique" UNIQUE("version_fingerprint"),
	CONSTRAINT "food_resource_versions_resource_snapshot_unique" UNIQUE("resource_id","snapshot_id"),
	CONSTRAINT "food_resource_versions_hash_check" CHECK ("food_resource_versions"."version_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "food_resource_versions_name_check" CHECK (btrim("food_resource_versions"."name") <> ''),
	CONSTRAINT "food_resource_versions_coordinate_check" CHECK ((
        "food_resource_versions"."coordinate_status" IN ('source_coordinate', 'authoritative_geocode', 'manually_verified')
        AND "food_resource_versions"."geometry" IS NOT NULL
      ) OR (
        "food_resource_versions"."coordinate_status" IN ('invalid', 'missing')
        AND "food_resource_versions"."geometry" IS NULL
      )),
	CONSTRAINT "food_resource_versions_classification_check" CHECK ((
        "food_resource_versions"."full_service_grocery" = true
        AND "food_resource_versions"."category" = 'full_service_grocery'
        AND "food_resource_versions"."verification_status" IN ('verified', 'override_verified')
      ) OR (
        "food_resource_versions"."full_service_grocery" = false
        AND "food_resource_versions"."category" <> 'full_service_grocery'
      )),
	CONSTRAINT "food_resource_versions_valid_dates_check" CHECK ("food_resource_versions"."valid_to" IS NULL OR "food_resource_versions"."valid_from" IS NULL OR "food_resource_versions"."valid_to" >= "food_resource_versions"."valid_from"),
	CONSTRAINT "food_resource_versions_verified_at_check" CHECK ("food_resource_versions"."verification_status" NOT IN ('verified', 'override_verified', 'verified_context') OR "food_resource_versions"."verified_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "food_resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"source_record_id" text NOT NULL,
	"canonical_resource_key" char(64) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "food_resources_source_record_unique" UNIQUE("source_id","source_record_id"),
	CONSTRAINT "food_resources_canonical_key_unique" UNIQUE("canonical_resource_key"),
	CONSTRAINT "food_resources_canonical_key_check" CHECK ("food_resources"."canonical_resource_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "food_resources_source_record_id_check" CHECK (btrim("food_resources"."source_record_id") <> '')
);
--> statement-breakpoint
CREATE TABLE "food_score_components" (
	"id" uuid PRIMARY KEY NOT NULL,
	"food_score_run_id" uuid NOT NULL,
	"geography_id" uuid NOT NULL,
	"access_metric_value_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"indicator_percentile" numeric(15, 12) NOT NULL,
	"effective_weight" numeric(15, 12) NOT NULL,
	"quality_status" "data_quality_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "food_score_components_run_geography_metric_unique" UNIQUE("food_score_run_id","geography_id","access_metric_value_id"),
	CONSTRAINT "food_score_components_domain_check" CHECK ("food_score_components"."domain" IN ('retail_access', 'transportation_constraint')),
	CONSTRAINT "food_score_components_percentile_check" CHECK ("food_score_components"."indicator_percentile" BETWEEN 0 AND 100),
	CONSTRAINT "food_score_components_weight_check" CHECK ("food_score_components"."effective_weight" > 0 AND "food_score_components"."effective_weight" <= 1),
	CONSTRAINT "food_score_components_quality_check" CHECK ("food_score_components"."quality_status" IN ('verified', 'provisional', 'stale'))
);
--> statement-breakpoint
CREATE TABLE "food_score_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"methodology_version" text NOT NULL,
	"registry_hash" char(64) NOT NULL,
	"input_manifest_hash" char(64) NOT NULL,
	"run_fingerprint" char(64) NOT NULL,
	"scoring_implementation_version" text NOT NULL,
	"equity_baseline_run_id" uuid NOT NULL,
	"equity_baseline_output_hash" char(64) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"data_vintages" jsonb NOT NULL,
	"git_commit" text NOT NULL,
	"status" "food_score_run_status" NOT NULL,
	"validation_result" jsonb,
	"failure_metadata" jsonb,
	"output_hash" char(64),
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "food_score_runs_run_fingerprint_unique" UNIQUE("run_fingerprint"),
	CONSTRAINT "food_score_runs_registry_hash_check" CHECK ("food_score_runs"."registry_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "food_score_runs_input_manifest_hash_check" CHECK ("food_score_runs"."input_manifest_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "food_score_runs_run_fingerprint_check" CHECK ("food_score_runs"."run_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "food_score_runs_baseline_output_hash_check" CHECK ("food_score_runs"."equity_baseline_output_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "food_score_runs_output_hash_check" CHECK ((
        "food_score_runs"."status" = 'validated'
        AND "food_score_runs"."output_hash" IS NOT NULL
        AND "food_score_runs"."output_hash" ~ '^[0-9a-f]{64}$'
      ) OR (
        "food_score_runs"."status" IN ('draft', 'failed')
        AND "food_score_runs"."output_hash" IS NULL
      )),
	CONSTRAINT "food_score_runs_completion_check" CHECK (("food_score_runs"."status" = 'draft' AND "food_score_runs"."completed_at" IS NULL) OR ("food_score_runs"."status" IN ('validated', 'failed') AND "food_score_runs"."completed_at" IS NOT NULL)),
	CONSTRAINT "food_score_runs_failure_metadata_check" CHECK (("food_score_runs"."status" = 'failed' AND "food_score_runs"."failure_metadata" IS NOT NULL) OR ("food_score_runs"."status" <> 'failed' AND "food_score_runs"."failure_metadata" IS NULL)),
	CONSTRAINT "food_score_runs_validation_result_check" CHECK ("food_score_runs"."status" <> 'validated' OR "food_score_runs"."validation_result" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "food_scores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"food_score_run_id" uuid NOT NULL,
	"geography_id" uuid NOT NULL,
	"equity_baseline_score_id" uuid NOT NULL,
	"retail_access_score" numeric(15, 12),
	"transportation_constraint_score" numeric(15, 12),
	"raw_food_access_need" numeric(15, 12),
	"food_access_need_percentile" numeric(15, 12),
	"food_access_need_band" "food_access_need_band",
	"equity_baseline_band" "equity_baseline_band",
	"priority" integer,
	"quality_status" "score_quality_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "food_scores_run_geography_unique" UNIQUE("food_score_run_id","geography_id"),
	CONSTRAINT "food_scores_numeric_range_check" CHECK (("food_scores"."retail_access_score" IS NULL OR "food_scores"."retail_access_score" BETWEEN 0 AND 100)
        AND ("food_scores"."transportation_constraint_score" IS NULL OR "food_scores"."transportation_constraint_score" BETWEEN 0 AND 100)
        AND ("food_scores"."raw_food_access_need" IS NULL OR "food_scores"."raw_food_access_need" BETWEEN 0 AND 100)
        AND ("food_scores"."food_access_need_percentile" IS NULL OR "food_scores"."food_access_need_percentile" BETWEEN 0 AND 100)),
	CONSTRAINT "food_scores_priority_check" CHECK ("food_scores"."priority" IS NULL OR "food_scores"."priority" BETWEEN 1 AND 5),
	CONSTRAINT "food_scores_output_quality_check" CHECK ((
        "food_scores"."quality_status" = 'complete'
        AND "food_scores"."retail_access_score" IS NOT NULL
        AND "food_scores"."transportation_constraint_score" IS NOT NULL
        AND "food_scores"."raw_food_access_need" IS NOT NULL
        AND "food_scores"."food_access_need_percentile" IS NOT NULL
        AND "food_scores"."food_access_need_band" IS NOT NULL
        AND "food_scores"."equity_baseline_band" IS NOT NULL
        AND "food_scores"."priority" IS NOT NULL
      ) OR (
        "food_scores"."quality_status" = 'insufficient_data'
        AND "food_scores"."retail_access_score" IS NULL
        AND "food_scores"."transportation_constraint_score" IS NULL
        AND "food_scores"."raw_food_access_need" IS NULL
        AND "food_scores"."food_access_need_percentile" IS NULL
        AND "food_scores"."food_access_need_band" IS NULL
        AND "food_scores"."priority" IS NULL
      ) OR (
        "food_scores"."quality_status" = 'ineligible_zero_population'
        AND "food_scores"."retail_access_score" IS NULL
        AND "food_scores"."transportation_constraint_score" IS NULL
        AND "food_scores"."raw_food_access_need" IS NULL
        AND "food_scores"."food_access_need_percentile" IS NULL
        AND "food_scores"."food_access_need_band" IS NULL
        AND "food_scores"."equity_baseline_band" IS NULL
        AND "food_scores"."priority" IS NULL
      ))
);
--> statement-breakpoint
ALTER TABLE "food_access_metric_snapshots" ADD CONSTRAINT "food_access_metric_snapshots_metric_value_id_fk" FOREIGN KEY ("access_metric_value_id") REFERENCES "public"."food_access_metric_values"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_access_metric_snapshots" ADD CONSTRAINT "food_access_metric_snapshots_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_access_metric_values" ADD CONSTRAINT "food_access_metric_values_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_access_metric_values" ADD CONSTRAINT "food_access_metric_values_primary_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("primary_snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_access_metric_values" ADD CONSTRAINT "food_access_metric_values_nearest_resource_version_id_fk" FOREIGN KEY ("nearest_resource_version_id") REFERENCES "public"."food_resource_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_resource_versions" ADD CONSTRAINT "food_resource_versions_resource_id_food_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."food_resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_resource_versions" ADD CONSTRAINT "food_resource_versions_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_resources" ADD CONSTRAINT "food_resources_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_score_components" ADD CONSTRAINT "food_score_components_food_score_run_id_fk" FOREIGN KEY ("food_score_run_id") REFERENCES "public"."food_score_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_score_components" ADD CONSTRAINT "food_score_components_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_score_components" ADD CONSTRAINT "food_score_components_metric_value_geography_fk" FOREIGN KEY ("access_metric_value_id","geography_id") REFERENCES "public"."food_access_metric_values"("id","geography_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_score_runs" ADD CONSTRAINT "food_score_runs_equity_baseline_run_id_score_runs_id_fk" FOREIGN KEY ("equity_baseline_run_id") REFERENCES "public"."score_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_id_geography_unique" UNIQUE("id","geography_id");--> statement-breakpoint
ALTER TABLE "food_scores" ADD CONSTRAINT "food_scores_food_score_run_id_food_score_runs_id_fk" FOREIGN KEY ("food_score_run_id") REFERENCES "public"."food_score_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_scores" ADD CONSTRAINT "food_scores_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_scores" ADD CONSTRAINT "food_scores_equity_baseline_score_geography_fk" FOREIGN KEY ("equity_baseline_score_id","geography_id") REFERENCES "public"."scores"("id","geography_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "food_access_metric_snapshots_snapshot_idx" ON "food_access_metric_snapshots" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "food_access_metric_values_geography_idx" ON "food_access_metric_values" USING btree ("geography_id");--> statement-breakpoint
CREATE INDEX "food_access_metric_values_metric_idx" ON "food_access_metric_values" USING btree ("metric_slug");--> statement-breakpoint
CREATE INDEX "food_access_metric_values_primary_snapshot_idx" ON "food_access_metric_values" USING btree ("primary_snapshot_id");--> statement-breakpoint
CREATE INDEX "food_resource_versions_geometry_gist" ON "food_resource_versions" USING gist ("geometry");--> statement-breakpoint
CREATE INDEX "food_resource_versions_resource_idx" ON "food_resource_versions" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "food_resource_versions_snapshot_idx" ON "food_resource_versions" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "food_resource_versions_category_active_idx" ON "food_resource_versions" USING btree ("category","active");--> statement-breakpoint
CREATE INDEX "food_resources_source_idx" ON "food_resources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "food_score_components_run_geography_idx" ON "food_score_components" USING btree ("food_score_run_id","geography_id");--> statement-breakpoint
CREATE INDEX "food_score_runs_status_idx" ON "food_score_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "food_score_runs_equity_baseline_idx" ON "food_score_runs" USING btree ("equity_baseline_run_id");--> statement-breakpoint
CREATE INDEX "food_scores_run_quality_idx" ON "food_scores" USING btree ("food_score_run_id","quality_status");--> statement-breakpoint

ALTER TABLE "food_resource_versions" ADD CONSTRAINT "food_resource_versions_geometry_srid_check"
  CHECK ("geometry" IS NULL OR ST_SRID("geometry") = 4326);--> statement-breakpoint
ALTER TABLE "food_resource_versions" ADD CONSTRAINT "food_resource_versions_geometry_not_empty_check"
  CHECK ("geometry" IS NULL OR NOT ST_IsEmpty("geometry"));--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_plan3_food_score_run_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "score_runs"
    WHERE "id" = NEW.equity_baseline_run_id
      AND "status" = 'validated'
      AND "output_hash" = NEW.equity_baseline_output_hash
  ) THEN
    RAISE EXCEPTION 'Food score run requires a validated Equity Baseline run with matching output hash';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Plan 3 food score runs must be inserted as draft';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status IN ('validated', 'failed') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid Plan 3 food score-run transition from % to %', OLD.status, NEW.status;
END;
$$;--> statement-breakpoint

CREATE TRIGGER food_score_runs_plan3_transition_trigger
BEFORE INSERT OR UPDATE OF status, equity_baseline_run_id, equity_baseline_output_hash ON "food_score_runs"
FOR EACH ROW
EXECUTE FUNCTION enforce_plan3_food_score_run_transition();
