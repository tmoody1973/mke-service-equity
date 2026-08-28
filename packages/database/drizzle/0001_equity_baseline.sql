CREATE TYPE "public"."data_quality_status" AS ENUM('verified', 'provisional', 'stale', 'missing', 'suppressed', 'conflicting');--> statement-breakpoint
CREATE TYPE "public"."data_source_status" AS ENUM('active', 'stale', 'unavailable', 'deprecated');--> statement-breakpoint
CREATE TYPE "public"."equity_baseline_band" AS ENUM('very_low', 'low', 'moderate', 'high', 'very_high');--> statement-breakpoint
CREATE TYPE "public"."indicator_domain" AS ENUM('demographic', 'socioeconomic', 'health');--> statement-breakpoint
CREATE TYPE "public"."score_quality_status" AS ENUM('complete', 'insufficient_data', 'ineligible_zero_population');--> statement-breakpoint
CREATE TYPE "public"."score_run_status" AS ENUM('draft', 'validated', 'published', 'superseded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."snapshot_validation_status" AS ENUM('pending', 'valid', 'invalid');--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"publisher" text NOT NULL,
	"source_url" text NOT NULL,
	"dataset_version" text NOT NULL,
	"geography" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"update_frequency" text,
	"license" text NOT NULL,
	"methodology_url" text,
	"status" "data_source_status" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "data_sources_publisher_name_version_unique" UNIQUE("publisher","name","dataset_version"),
	CONSTRAINT "data_sources_valid_dates_check" CHECK ("data_sources"."valid_to" IS NULL OR "data_sources"."valid_from" IS NULL OR "data_sources"."valid_to" >= "data_sources"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "geographies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"geoid" char(11) NOT NULL,
	"geography_type" text NOT NULL,
	"name" text NOT NULL,
	"state_fips" char(2) NOT NULL,
	"county_fips" char(3) NOT NULL,
	"geometry" geometry(MultiPolygon,4326) NOT NULL,
	"centroid" geometry(Point,4326) NOT NULL,
	"population" integer,
	"vintage" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "geographies_type_geoid_vintage_unique" UNIQUE("geography_type","geoid","vintage"),
	CONSTRAINT "geographies_type_check" CHECK ("geographies"."geography_type" = 'tract'),
	CONSTRAINT "geographies_geoid_check" CHECK ("geographies"."geoid" ~ '^[0-9]{11}$'),
	CONSTRAINT "geographies_state_fips_check" CHECK ("geographies"."state_fips" ~ '^[0-9]{2}$'),
	CONSTRAINT "geographies_county_fips_check" CHECK ("geographies"."county_fips" ~ '^[0-9]{3}$'),
	CONSTRAINT "geographies_geoid_fips_check" CHECK (left("geographies"."geoid", 2) = "geographies"."state_fips" AND substring("geographies"."geoid" from 3 for 3) = "geographies"."county_fips"),
	CONSTRAINT "geographies_population_check" CHECK ("geographies"."population" IS NULL OR "geographies"."population" >= 0)
);
--> statement-breakpoint
CREATE TABLE "indicator_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"methodology_version" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"domain" "indicator_domain" NOT NULL,
	"unit" text NOT NULL,
	"source_id" uuid NOT NULL,
	"higher_is_worse" boolean NOT NULL,
	"baseline_included" boolean NOT NULL,
	"weight" numeric(15, 12) NOT NULL,
	"vintage" text NOT NULL,
	"methodology_notes" text NOT NULL,
	"formula_definition" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "indicator_definitions_methodology_slug_unique" UNIQUE("methodology_version","slug"),
	CONSTRAINT "indicator_definitions_weight_check" CHECK ("indicator_definitions"."weight" > 0 AND "indicator_definitions"."weight" <= 1)
);
--> statement-breakpoint
CREATE TABLE "indicator_values" (
	"id" uuid PRIMARY KEY NOT NULL,
	"geography_id" uuid NOT NULL,
	"indicator_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"value" numeric(15, 12),
	"margin_of_error" numeric(15, 12),
	"confidence_low" numeric(15, 12),
	"confidence_high" numeric(15, 12),
	"data_year" text NOT NULL,
	"quality_status" "data_quality_status" NOT NULL,
	"quality_metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "indicator_values_geography_indicator_snapshot_unique" UNIQUE("geography_id","indicator_id","snapshot_id"),
	CONSTRAINT "indicator_values_id_geography_unique" UNIQUE("id","geography_id"),
	CONSTRAINT "indicator_values_value_range_check" CHECK ("indicator_values"."value" IS NULL OR ("indicator_values"."value" >= 0 AND "indicator_values"."value" <= 100)),
	CONSTRAINT "indicator_values_value_quality_check" CHECK ((
        "indicator_values"."value" IS NOT NULL
        AND "indicator_values"."quality_status" IN ('verified', 'provisional', 'stale')
      ) OR (
        "indicator_values"."value" IS NULL
        AND "indicator_values"."quality_status" IN ('missing', 'suppressed', 'conflicting')
      )),
	CONSTRAINT "indicator_values_margin_of_error_check" CHECK ("indicator_values"."margin_of_error" IS NULL OR "indicator_values"."margin_of_error" >= 0),
	CONSTRAINT "indicator_values_confidence_check" CHECK ((
        "indicator_values"."confidence_low" IS NULL AND "indicator_values"."confidence_high" IS NULL
      ) OR (
        "indicator_values"."confidence_low" IS NOT NULL
        AND "indicator_values"."confidence_high" IS NOT NULL
        AND "indicator_values"."confidence_low" >= 0
        AND "indicator_values"."confidence_low" <= "indicator_values"."confidence_high"
        AND "indicator_values"."confidence_high" <= 100
      ))
);
--> statement-breakpoint
CREATE TABLE "score_components" (
	"id" uuid PRIMARY KEY NOT NULL,
	"score_run_id" uuid NOT NULL,
	"geography_id" uuid NOT NULL,
	"indicator_value_id" uuid NOT NULL,
	"indicator_percentile" numeric(15, 12) NOT NULL,
	"effective_weight" numeric(15, 12) NOT NULL,
	"quality_status" "data_quality_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "score_components_run_geography_indicator_value_unique" UNIQUE("score_run_id","geography_id","indicator_value_id"),
	CONSTRAINT "score_components_percentile_check" CHECK ("score_components"."indicator_percentile" >= 0 AND "score_components"."indicator_percentile" <= 100),
	CONSTRAINT "score_components_weight_check" CHECK ("score_components"."effective_weight" > 0 AND "score_components"."effective_weight" <= 1),
	CONSTRAINT "score_components_quality_check" CHECK ("score_components"."quality_status" IN ('verified', 'provisional', 'stale'))
);
--> statement-breakpoint
CREATE TABLE "score_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"methodology_version" text NOT NULL,
	"registry_hash" char(64) NOT NULL,
	"input_manifest_hash" char(64) NOT NULL,
	"run_fingerprint" char(64) NOT NULL,
	"scoring_implementation_version" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"data_vintages" jsonb NOT NULL,
	"git_commit" text NOT NULL,
	"status" "score_run_status" NOT NULL,
	"validation_result" jsonb,
	"failure_metadata" jsonb,
	"output_hash" char(64),
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "score_runs_run_fingerprint_unique" UNIQUE("run_fingerprint"),
	CONSTRAINT "score_runs_registry_hash_check" CHECK ("score_runs"."registry_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "score_runs_input_manifest_hash_check" CHECK ("score_runs"."input_manifest_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "score_runs_run_fingerprint_check" CHECK ("score_runs"."run_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "score_runs_output_hash_check" CHECK ((
        "score_runs"."status" IN ('validated', 'published', 'superseded')
        AND "score_runs"."output_hash" IS NOT NULL
        AND "score_runs"."output_hash" ~ '^[0-9a-f]{64}$'
      ) OR (
        "score_runs"."status" IN ('draft', 'failed')
        AND "score_runs"."output_hash" IS NULL
      )),
	CONSTRAINT "score_runs_completion_check" CHECK (("score_runs"."status" = 'draft' AND "score_runs"."completed_at" IS NULL) OR ("score_runs"."status" <> 'draft' AND "score_runs"."completed_at" IS NOT NULL)),
	CONSTRAINT "score_runs_failure_metadata_check" CHECK (("score_runs"."status" = 'failed' AND "score_runs"."failure_metadata" IS NOT NULL) OR ("score_runs"."status" <> 'failed' AND "score_runs"."failure_metadata" IS NULL)),
	CONSTRAINT "score_runs_validation_result_check" CHECK ("score_runs"."status" NOT IN ('validated', 'published', 'superseded') OR "score_runs"."validation_result" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"score_run_id" uuid NOT NULL,
	"geography_id" uuid NOT NULL,
	"demographic_score" numeric(15, 12),
	"socioeconomic_score" numeric(15, 12),
	"health_score" numeric(15, 12),
	"composite_score" numeric(15, 12),
	"equity_baseline_percentile" numeric(15, 12),
	"equity_baseline_band" "equity_baseline_band",
	"quality_status" "score_quality_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scores_run_geography_unique" UNIQUE("score_run_id","geography_id"),
	CONSTRAINT "scores_numeric_range_check" CHECK (("scores"."demographic_score" IS NULL OR "scores"."demographic_score" BETWEEN 0 AND 100)
        AND ("scores"."socioeconomic_score" IS NULL OR "scores"."socioeconomic_score" BETWEEN 0 AND 100)
        AND ("scores"."health_score" IS NULL OR "scores"."health_score" BETWEEN 0 AND 100)
        AND ("scores"."composite_score" IS NULL OR "scores"."composite_score" BETWEEN 0 AND 100)
        AND ("scores"."equity_baseline_percentile" IS NULL OR "scores"."equity_baseline_percentile" BETWEEN 0 AND 100)),
	CONSTRAINT "scores_output_quality_check" CHECK ((
        "scores"."quality_status" = 'complete'
        AND "scores"."demographic_score" IS NOT NULL
        AND "scores"."socioeconomic_score" IS NOT NULL
        AND "scores"."health_score" IS NOT NULL
        AND "scores"."composite_score" IS NOT NULL
        AND "scores"."equity_baseline_percentile" IS NOT NULL
        AND "scores"."equity_baseline_band" IS NOT NULL
      ) OR (
        "scores"."quality_status" IN ('insufficient_data', 'ineligible_zero_population')
        AND "scores"."demographic_score" IS NULL
        AND "scores"."socioeconomic_score" IS NULL
        AND "scores"."health_score" IS NULL
        AND "scores"."composite_score" IS NULL
        AND "scores"."equity_baseline_percentile" IS NULL
        AND "scores"."equity_baseline_band" IS NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "source_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"dataset_version" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"checksum_sha256" char(64) NOT NULL,
	"byte_size" bigint NOT NULL,
	"storage_uri" text NOT NULL,
	"row_or_feature_count" bigint NOT NULL,
	"schema_fingerprint" char(64) NOT NULL,
	"snapshot_fingerprint" char(64) NOT NULL,
	"request_metadata" jsonb NOT NULL,
	"validation_status" "snapshot_validation_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "source_snapshots_source_version_checksum_unique" UNIQUE("source_id","dataset_version","checksum_sha256"),
	CONSTRAINT "source_snapshots_snapshot_fingerprint_unique" UNIQUE("snapshot_fingerprint"),
	CONSTRAINT "source_snapshots_checksum_check" CHECK ("source_snapshots"."checksum_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "source_snapshots_schema_fingerprint_check" CHECK ("source_snapshots"."schema_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "source_snapshots_snapshot_fingerprint_check" CHECK ("source_snapshots"."snapshot_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "source_snapshots_byte_size_check" CHECK ("source_snapshots"."byte_size" >= 0),
	CONSTRAINT "source_snapshots_record_count_check" CHECK ("source_snapshots"."row_or_feature_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "indicator_definitions" ADD CONSTRAINT "indicator_definitions_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_values" ADD CONSTRAINT "indicator_values_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_values" ADD CONSTRAINT "indicator_values_indicator_id_indicator_definitions_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_values" ADD CONSTRAINT "indicator_values_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_components" ADD CONSTRAINT "score_components_score_run_id_score_runs_id_fk" FOREIGN KEY ("score_run_id") REFERENCES "public"."score_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_components" ADD CONSTRAINT "score_components_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "score_components" ADD CONSTRAINT "score_components_indicator_value_geography_fk" FOREIGN KEY ("indicator_value_id","geography_id") REFERENCES "public"."indicator_values"("id","geography_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_score_run_id_score_runs_id_fk" FOREIGN KEY ("score_run_id") REFERENCES "public"."score_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_sources_status_idx" ON "data_sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "geographies_geometry_gist" ON "geographies" USING gist ("geometry");--> statement-breakpoint
CREATE INDEX "geographies_centroid_gist" ON "geographies" USING gist ("centroid");--> statement-breakpoint
CREATE INDEX "indicator_definitions_source_idx" ON "indicator_definitions" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "indicator_definitions_domain_idx" ON "indicator_definitions" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "indicator_values_geography_idx" ON "indicator_values" USING btree ("geography_id");--> statement-breakpoint
CREATE INDEX "indicator_values_indicator_idx" ON "indicator_values" USING btree ("indicator_id");--> statement-breakpoint
CREATE INDEX "indicator_values_snapshot_idx" ON "indicator_values" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "score_components_run_geography_idx" ON "score_components" USING btree ("score_run_id","geography_id");--> statement-breakpoint
CREATE INDEX "score_runs_status_idx" ON "score_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "score_runs_methodology_version_idx" ON "score_runs" USING btree ("methodology_version");--> statement-breakpoint
CREATE INDEX "scores_run_quality_idx" ON "scores" USING btree ("score_run_id","quality_status");--> statement-breakpoint
CREATE INDEX "source_snapshots_source_retrieved_idx" ON "source_snapshots" USING btree ("source_id","retrieved_at");--> statement-breakpoint

ALTER TABLE "geographies" ADD CONSTRAINT "geographies_geometry_valid_check"
  CHECK (ST_IsValid("geometry"));--> statement-breakpoint
ALTER TABLE "geographies" ADD CONSTRAINT "geographies_geometry_srid_check"
  CHECK (ST_SRID("geometry") = 4326);--> statement-breakpoint
ALTER TABLE "geographies" ADD CONSTRAINT "geographies_geometry_not_empty_check"
  CHECK (NOT ST_IsEmpty("geometry"));--> statement-breakpoint
ALTER TABLE "geographies" ADD CONSTRAINT "geographies_centroid_srid_check"
  CHECK (ST_SRID("centroid") = 4326);--> statement-breakpoint
ALTER TABLE "geographies" ADD CONSTRAINT "geographies_centroid_not_empty_check"
  CHECK (NOT ST_IsEmpty("centroid"));--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_plan2_score_run_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('published', 'superseded') THEN
    RAISE EXCEPTION 'Plan 2 cannot create or transition to score-run status %', NEW.status;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status IN ('validated', 'failed') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid Plan 2 score-run transition from % to %', OLD.status, NEW.status;
END;
$$;--> statement-breakpoint

CREATE TRIGGER score_runs_plan2_transition_trigger
BEFORE INSERT OR UPDATE OF status ON "score_runs"
FOR EACH ROW
EXECUTE FUNCTION enforce_plan2_score_run_transition();
