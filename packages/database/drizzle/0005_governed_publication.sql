CREATE TYPE "public"."atlas_publication_state" AS ENUM('published', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."publication_audit_action" AS ENUM('dry_run', 'publish', 'reconcile', 'withdraw');--> statement-breakpoint
CREATE TYPE "public"."publication_audit_outcome" AS ENUM('attempted', 'succeeded', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."publication_environment" AS ENUM('development', 'production');--> statement-breakpoint
CREATE TYPE "public"."publication_redistribution_decision" AS ENUM('public_derived_results', 'public_direct_display', 'internal_reproduction_only', 'prohibited_public_use');--> statement-breakpoint
CREATE TYPE "public"."publication_resource_role" AS ENUM('scoring_inventory', 'public_display');--> statement-breakpoint
CREATE TYPE "public"."publication_source_role" AS ENUM('canonical_geography', 'equity_input', 'food_scoring_input', 'food_context_input');--> statement-breakpoint
ALTER TYPE "public"."food_score_run_status" RENAME TO "food_score_run_status_plan3";--> statement-breakpoint
CREATE TYPE "public"."food_score_run_status" AS ENUM('draft', 'validated', 'published', 'superseded', 'failed');--> statement-breakpoint
ALTER TABLE "food_score_runs" ALTER COLUMN "status" TYPE "public"."food_score_run_status"
  USING "status"::text::"public"."food_score_run_status";--> statement-breakpoint
DROP TYPE "public"."food_score_run_status_plan3";--> statement-breakpoint
CREATE TABLE "atlas_publication_audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"action" "publication_audit_action" NOT NULL,
	"outcome" "publication_audit_outcome" NOT NULL,
	"environment" "publication_environment" NOT NULL,
	"request_hash" char(64) NOT NULL,
	"publication_id" uuid,
	"actor" text NOT NULL,
	"approval_id" text NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"error_code" text,
	"metadata" jsonb NOT NULL,
	CONSTRAINT "atlas_publication_audit_events_idempotency_outcome_unique" UNIQUE("idempotency_key","outcome"),
	CONSTRAINT "atlas_publication_audit_events_request_hash_check" CHECK ("atlas_publication_audit_events"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "atlas_publication_audit_events_text_check" CHECK (btrim("atlas_publication_audit_events"."actor") <> '' AND btrim("atlas_publication_audit_events"."approval_id") <> ''),
	CONSTRAINT "atlas_publication_audit_events_error_check" CHECK (("atlas_publication_audit_events"."outcome" IN ('rejected', 'failed') AND btrim("atlas_publication_audit_events"."error_code") <> '')
        OR ("atlas_publication_audit_events"."outcome" IN ('attempted', 'succeeded') AND "atlas_publication_audit_events"."error_code" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "atlas_publication_equity_component_members" (
	"publication_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"indicator_value_id" uuid NOT NULL,
	CONSTRAINT "atlas_publication_equity_component_members_pk" PRIMARY KEY("publication_id","component_id")
);
--> statement-breakpoint
CREATE TABLE "atlas_publication_food_component_members" (
	"publication_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"access_metric_value_id" uuid NOT NULL,
	CONSTRAINT "atlas_publication_food_component_members_pk" PRIMARY KEY("publication_id","component_id")
);
--> statement-breakpoint
CREATE TABLE "atlas_publication_resource_version_members" (
	"publication_id" uuid NOT NULL,
	"resource_version_id" uuid NOT NULL,
	"role" "publication_resource_role" NOT NULL,
	"redistribution_decision" "publication_redistribution_decision" NOT NULL,
	"terms_url" text,
	"attribution" text NOT NULL,
	"warning" text,
	CONSTRAINT "atlas_publication_resource_version_members_pk" PRIMARY KEY("publication_id","resource_version_id"),
	CONSTRAINT "atlas_publication_resource_version_members_policy_check" CHECK ((
        "atlas_publication_resource_version_members"."role" = 'public_display'
        AND "atlas_publication_resource_version_members"."redistribution_decision" = 'public_direct_display'
        AND "atlas_publication_resource_version_members"."terms_url" IS NOT NULL
        AND btrim("atlas_publication_resource_version_members"."attribution") <> ''
      ) OR (
        "atlas_publication_resource_version_members"."role" = 'scoring_inventory'
        AND "atlas_publication_resource_version_members"."redistribution_decision" <> 'public_direct_display'
        AND btrim("atlas_publication_resource_version_members"."attribution") <> ''
      ))
);
--> statement-breakpoint
CREATE TABLE "atlas_publication_score_members" (
	"publication_id" uuid NOT NULL,
	"geography_id" uuid NOT NULL,
	"food_score_id" uuid NOT NULL,
	"equity_score_id" uuid NOT NULL,
	CONSTRAINT "atlas_publication_score_members_pk" PRIMARY KEY("publication_id","geography_id"),
	CONSTRAINT "atlas_publication_score_members_food_unique" UNIQUE("publication_id","food_score_id"),
	CONSTRAINT "atlas_publication_score_members_equity_unique" UNIQUE("publication_id","equity_score_id")
);
--> statement-breakpoint
CREATE TABLE "atlas_publication_source_snapshot_members" (
	"publication_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"role" "publication_source_role" NOT NULL,
	"redistribution_decision" "publication_redistribution_decision" NOT NULL,
	"terms_url" text,
	"attribution" text NOT NULL,
	"warning" text,
	CONSTRAINT "atlas_publication_source_snapshot_members_pk" PRIMARY KEY("publication_id","snapshot_id"),
	CONSTRAINT "atlas_publication_source_snapshot_members_public_terms_check" CHECK ("atlas_publication_source_snapshot_members"."redistribution_decision" NOT IN ('public_derived_results', 'public_direct_display')
        OR ("atlas_publication_source_snapshot_members"."terms_url" IS NOT NULL AND btrim("atlas_publication_source_snapshot_members"."attribution") <> ''))
);
--> statement-breakpoint
CREATE TABLE "atlas_publications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"food_score_run_id" uuid NOT NULL,
	"equity_baseline_run_id" uuid NOT NULL,
	"food_output_hash" char(64) NOT NULL,
	"equity_baseline_output_hash" char(64) NOT NULL,
	"bundle_fingerprint" char(64) NOT NULL,
	"dry_run_hash" char(64) NOT NULL,
	"state" "atlas_publication_state" NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"published_by" text NOT NULL,
	"approval_id" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"publication_process" text NOT NULL,
	"command_version" text NOT NULL,
	"git_commit" text NOT NULL,
	"reason" text NOT NULL,
	"validation_summary" jsonb NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_by" text,
	"superseded_reason" text,
	"superseded_by_publication_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "atlas_publications_food_run_unique" UNIQUE("food_score_run_id"),
	CONSTRAINT "atlas_publications_bundle_fingerprint_unique" UNIQUE("bundle_fingerprint"),
	CONSTRAINT "atlas_publications_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "atlas_publications_hashes_check" CHECK ("atlas_publications"."food_output_hash" ~ '^[0-9a-f]{64}$'
        AND "atlas_publications"."equity_baseline_output_hash" ~ '^[0-9a-f]{64}$'
        AND "atlas_publications"."bundle_fingerprint" ~ '^[0-9a-f]{64}$'
        AND "atlas_publications"."dry_run_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "atlas_publications_text_check" CHECK (btrim("atlas_publications"."published_by") <> ''
        AND btrim("atlas_publications"."approval_id") <> ''
        AND btrim("atlas_publications"."publication_process") <> ''
        AND btrim("atlas_publications"."command_version") <> ''
        AND btrim("atlas_publications"."git_commit") <> ''
        AND btrim("atlas_publications"."reason") <> ''),
	CONSTRAINT "atlas_publications_state_metadata_check" CHECK ((
        "atlas_publications"."state" = 'published'
        AND "atlas_publications"."superseded_at" IS NULL
        AND "atlas_publications"."superseded_by" IS NULL
        AND "atlas_publications"."superseded_reason" IS NULL
        AND "atlas_publications"."superseded_by_publication_id" IS NULL
      ) OR (
        "atlas_publications"."state" = 'superseded'
        AND "atlas_publications"."superseded_at" IS NOT NULL
        AND btrim("atlas_publications"."superseded_by") <> ''
        AND btrim("atlas_publications"."superseded_reason") <> ''
      ))
);
--> statement-breakpoint
ALTER TABLE "food_score_runs" DROP CONSTRAINT "food_score_runs_output_hash_check";--> statement-breakpoint
ALTER TABLE "food_score_runs" DROP CONSTRAINT "food_score_runs_completion_check";--> statement-breakpoint
ALTER TABLE "food_score_runs" DROP CONSTRAINT "food_score_runs_validation_result_check";--> statement-breakpoint
ALTER TABLE "atlas_publication_audit_events" ADD CONSTRAINT "atlas_publication_audit_events_publication_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."atlas_publications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_equity_component_members" ADD CONSTRAINT "atlas_publication_equity_component_members_publication_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."atlas_publications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_equity_component_members" ADD CONSTRAINT "atlas_publication_equity_component_members_component_fk" FOREIGN KEY ("component_id") REFERENCES "public"."score_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_equity_component_members" ADD CONSTRAINT "atlas_publication_equity_component_members_value_fk" FOREIGN KEY ("indicator_value_id") REFERENCES "public"."indicator_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_food_component_members" ADD CONSTRAINT "atlas_publication_food_component_members_publication_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."atlas_publications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_food_component_members" ADD CONSTRAINT "atlas_publication_food_component_members_component_fk" FOREIGN KEY ("component_id") REFERENCES "public"."food_score_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_food_component_members" ADD CONSTRAINT "atlas_publication_food_component_members_value_fk" FOREIGN KEY ("access_metric_value_id") REFERENCES "public"."food_access_metric_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_resource_version_members" ADD CONSTRAINT "atlas_publication_resource_version_members_publication_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."atlas_publications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_resource_version_members" ADD CONSTRAINT "atlas_publication_resource_version_members_version_fk" FOREIGN KEY ("resource_version_id") REFERENCES "public"."food_resource_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_score_members" ADD CONSTRAINT "atlas_publication_score_members_publication_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."atlas_publications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_score_members" ADD CONSTRAINT "atlas_publication_score_members_geography_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_score_members" ADD CONSTRAINT "atlas_publication_score_members_food_score_fk" FOREIGN KEY ("food_score_id") REFERENCES "public"."food_scores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_score_members" ADD CONSTRAINT "atlas_publication_score_members_equity_score_fk" FOREIGN KEY ("equity_score_id") REFERENCES "public"."scores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_source_snapshot_members" ADD CONSTRAINT "atlas_publication_source_snapshot_members_publication_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."atlas_publications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publication_source_snapshot_members" ADD CONSTRAINT "atlas_publication_source_snapshot_members_snapshot_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publications" ADD CONSTRAINT "atlas_publications_food_run_fk" FOREIGN KEY ("food_score_run_id") REFERENCES "public"."food_score_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publications" ADD CONSTRAINT "atlas_publications_equity_run_fk" FOREIGN KEY ("equity_baseline_run_id") REFERENCES "public"."score_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atlas_publications" ADD CONSTRAINT "atlas_publications_superseded_by_fk" FOREIGN KEY ("superseded_by_publication_id") REFERENCES "public"."atlas_publications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atlas_publication_audit_events_idempotency_idx" ON "atlas_publication_audit_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "atlas_publication_audit_events_publication_idx" ON "atlas_publication_audit_events" USING btree ("publication_id");--> statement-breakpoint
CREATE UNIQUE INDEX "atlas_publications_one_current_idx" ON "atlas_publications" USING btree ("state") WHERE "atlas_publications"."state" = 'published';--> statement-breakpoint
CREATE INDEX "atlas_publications_food_run_idx" ON "atlas_publications" USING btree ("food_score_run_id");--> statement-breakpoint
CREATE INDEX "atlas_publications_equity_run_idx" ON "atlas_publications" USING btree ("equity_baseline_run_id");--> statement-breakpoint
ALTER TABLE "food_score_runs" ADD CONSTRAINT "food_score_runs_output_hash_check" CHECK ((
        "food_score_runs"."status" IN ('validated', 'published', 'superseded')
        AND "food_score_runs"."output_hash" IS NOT NULL
        AND "food_score_runs"."output_hash" ~ '^[0-9a-f]{64}$'
      ) OR (
        "food_score_runs"."status" IN ('draft', 'failed')
        AND "food_score_runs"."output_hash" IS NULL
      ));--> statement-breakpoint
ALTER TABLE "food_score_runs" ADD CONSTRAINT "food_score_runs_completion_check" CHECK (("food_score_runs"."status" = 'draft' AND "food_score_runs"."completed_at" IS NULL) OR ("food_score_runs"."status" IN ('validated', 'published', 'superseded', 'failed') AND "food_score_runs"."completed_at" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "food_score_runs" ADD CONSTRAINT "food_score_runs_validation_result_check" CHECK ("food_score_runs"."status" NOT IN ('validated', 'published', 'superseded') OR "food_score_runs"."validation_result" IS NOT NULL);
--> statement-breakpoint

DROP TRIGGER "score_runs_plan2_transition_trigger" ON "score_runs";--> statement-breakpoint
DROP TRIGGER "food_score_runs_plan3_transition_trigger" ON "food_score_runs";--> statement-breakpoint

CREATE OR REPLACE FUNCTION publication_operation_is_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('mke.publication_operation', true) = 'enabled'
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_governed_score_run_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Equity score runs must be inserted as draft';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status IN ('validated', 'failed') THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'validated' AND NEW.status = 'published'
     AND publication_operation_is_enabled() THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'published' AND NEW.status = 'superseded'
     AND publication_operation_is_enabled() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid governed Equity score-run transition from % to %', OLD.status, NEW.status;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "score_runs_governed_transition_trigger"
BEFORE INSERT OR UPDATE OF "status" ON "score_runs"
FOR EACH ROW
EXECUTE FUNCTION enforce_governed_score_run_transition();--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_governed_food_score_run_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  required_baseline_status "score_run_status";
BEGIN
  SELECT "status"
  INTO required_baseline_status
  FROM "score_runs"
  WHERE "id" = NEW.equity_baseline_run_id
    AND "output_hash" = NEW.equity_baseline_output_hash;

  IF required_baseline_status IS NULL THEN
    RAISE EXCEPTION 'Food score run requires an Equity Baseline run with matching output hash';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR required_baseline_status <> 'validated' THEN
      RAISE EXCEPTION 'Food score runs must be inserted as draft against a validated baseline';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status IN ('validated', 'failed')
     AND required_baseline_status = 'validated' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'validated' AND NEW.status = 'published'
     AND required_baseline_status = 'published'
     AND publication_operation_is_enabled() THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'published' AND NEW.status = 'superseded'
     AND publication_operation_is_enabled() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid governed Food score-run transition from % to %', OLD.status, NEW.status;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "food_score_runs_governed_transition_trigger"
BEFORE INSERT OR UPDATE OF "status", "equity_baseline_run_id", "equity_baseline_output_hash"
ON "food_score_runs"
FOR EACH ROW
EXECUTE FUNCTION enforce_governed_food_score_run_transition();--> statement-breakpoint

CREATE OR REPLACE FUNCTION enforce_atlas_publication_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT publication_operation_is_enabled() THEN
    RAISE EXCEPTION 'Atlas publication rows may change only through the controlled operation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'published' THEN
      RAISE EXCEPTION 'Atlas publications must be inserted as published';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Atlas publication history cannot be deleted';
  END IF;

  IF OLD.state = 'published' AND NEW.state = 'superseded'
     AND OLD.id = NEW.id
     AND OLD.food_score_run_id = NEW.food_score_run_id
     AND OLD.equity_baseline_run_id = NEW.equity_baseline_run_id
     AND OLD.food_output_hash = NEW.food_output_hash
     AND OLD.equity_baseline_output_hash = NEW.equity_baseline_output_hash
     AND OLD.bundle_fingerprint = NEW.bundle_fingerprint
     AND OLD.dry_run_hash = NEW.dry_run_hash
     AND OLD.published_at = NEW.published_at
     AND OLD.published_by = NEW.published_by
     AND OLD.approval_id = NEW.approval_id
     AND OLD.idempotency_key = NEW.idempotency_key
     AND OLD.publication_process = NEW.publication_process
     AND OLD.command_version = NEW.command_version
     AND OLD.git_commit = NEW.git_commit
     AND OLD.reason = NEW.reason
     AND OLD.validation_summary = NEW.validation_summary THEN
    RETURN NEW;
  END IF;

  IF OLD.state = 'superseded' AND NEW.state = 'superseded'
     AND OLD.superseded_by_publication_id IS NULL
     AND NEW.superseded_by_publication_id IS NOT NULL
     AND OLD.id = NEW.id
     AND OLD.food_score_run_id = NEW.food_score_run_id
     AND OLD.equity_baseline_run_id = NEW.equity_baseline_run_id
     AND OLD.bundle_fingerprint = NEW.bundle_fingerprint THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid Atlas publication transition from % to %', OLD.state, NEW.state;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "atlas_publications_transition_trigger"
BEFORE INSERT OR UPDATE OR DELETE ON "atlas_publications"
FOR EACH ROW
EXECUTE FUNCTION enforce_atlas_publication_transition();--> statement-breakpoint

CREATE OR REPLACE FUNCTION reject_publication_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Published membership and audit history are append-only';
END;
$$;--> statement-breakpoint

CREATE TRIGGER "atlas_publication_score_members_immutable_trigger"
BEFORE UPDATE OR DELETE ON "atlas_publication_score_members"
FOR EACH ROW EXECUTE FUNCTION reject_publication_history_mutation();--> statement-breakpoint
CREATE TRIGGER "atlas_publication_equity_component_members_immutable_trigger"
BEFORE UPDATE OR DELETE ON "atlas_publication_equity_component_members"
FOR EACH ROW EXECUTE FUNCTION reject_publication_history_mutation();--> statement-breakpoint
CREATE TRIGGER "atlas_publication_food_component_members_immutable_trigger"
BEFORE UPDATE OR DELETE ON "atlas_publication_food_component_members"
FOR EACH ROW EXECUTE FUNCTION reject_publication_history_mutation();--> statement-breakpoint
CREATE TRIGGER "atlas_publication_source_snapshot_members_immutable_trigger"
BEFORE UPDATE OR DELETE ON "atlas_publication_source_snapshot_members"
FOR EACH ROW EXECUTE FUNCTION reject_publication_history_mutation();--> statement-breakpoint
CREATE TRIGGER "atlas_publication_resource_version_members_immutable_trigger"
BEFORE UPDATE OR DELETE ON "atlas_publication_resource_version_members"
FOR EACH ROW EXECUTE FUNCTION reject_publication_history_mutation();--> statement-breakpoint
CREATE TRIGGER "atlas_publication_audit_events_immutable_trigger"
BEFORE UPDATE OR DELETE ON "atlas_publication_audit_events"
FOR EACH ROW EXECUTE FUNCTION reject_publication_history_mutation();--> statement-breakpoint

CREATE OR REPLACE FUNCTION reject_released_content_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_released boolean;
BEGIN
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %I WHERE %I = $1)',
    TG_ARGV[0],
    TG_ARGV[1]
  )
  INTO is_released
  USING OLD.id;

  IF is_released THEN
    RAISE EXCEPTION 'Released analytical content cannot be updated or deleted';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "scores_released_immutable_trigger"
BEFORE UPDATE OR DELETE ON "scores"
FOR EACH ROW EXECUTE FUNCTION reject_released_content_mutation(
  'atlas_publication_score_members', 'equity_score_id'
);--> statement-breakpoint
CREATE TRIGGER "food_scores_released_immutable_trigger"
BEFORE UPDATE OR DELETE ON "food_scores"
FOR EACH ROW EXECUTE FUNCTION reject_released_content_mutation(
  'atlas_publication_score_members', 'food_score_id'
);--> statement-breakpoint
CREATE TRIGGER "score_components_released_immutable_trigger"
BEFORE UPDATE OR DELETE ON "score_components"
FOR EACH ROW EXECUTE FUNCTION reject_released_content_mutation(
  'atlas_publication_equity_component_members', 'component_id'
);--> statement-breakpoint
CREATE TRIGGER "food_score_components_released_immutable_trigger"
BEFORE UPDATE OR DELETE ON "food_score_components"
FOR EACH ROW EXECUTE FUNCTION reject_released_content_mutation(
  'atlas_publication_food_component_members', 'component_id'
);--> statement-breakpoint
CREATE TRIGGER "indicator_values_released_immutable_trigger"
BEFORE UPDATE OR DELETE ON "indicator_values"
FOR EACH ROW EXECUTE FUNCTION reject_released_content_mutation(
  'atlas_publication_equity_component_members', 'indicator_value_id'
);--> statement-breakpoint
CREATE TRIGGER "food_access_metric_values_released_immutable_trigger"
BEFORE UPDATE OR DELETE ON "food_access_metric_values"
FOR EACH ROW EXECUTE FUNCTION reject_released_content_mutation(
  'atlas_publication_food_component_members', 'access_metric_value_id'
);--> statement-breakpoint
CREATE TRIGGER "source_snapshots_released_immutable_trigger"
BEFORE UPDATE OR DELETE ON "source_snapshots"
FOR EACH ROW EXECUTE FUNCTION reject_released_content_mutation(
  'atlas_publication_source_snapshot_members', 'snapshot_id'
);--> statement-breakpoint
CREATE TRIGGER "food_resource_versions_released_immutable_trigger"
BEFORE UPDATE OR DELETE ON "food_resource_versions"
FOR EACH ROW EXECUTE FUNCTION reject_released_content_mutation(
  'atlas_publication_resource_version_members', 'resource_version_id'
);--> statement-breakpoint

CREATE OR REPLACE FUNCTION reject_released_run_content_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.status IN ('published', 'superseded') THEN
    RAISE EXCEPTION 'Released score runs cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('published', 'superseded')
     AND (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'Released score-run content is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "score_runs_released_immutable_trigger"
BEFORE UPDATE OR DELETE ON "score_runs"
FOR EACH ROW EXECUTE FUNCTION reject_released_run_content_mutation();--> statement-breakpoint
CREATE TRIGGER "food_score_runs_released_immutable_trigger"
BEFORE UPDATE OR DELETE ON "food_score_runs"
FOR EACH ROW EXECUTE FUNCTION reject_released_run_content_mutation();--> statement-breakpoint

CREATE OR REPLACE FUNCTION publish_atlas_release(
  p_publication_id uuid,
  p_food_run_id uuid,
  p_expected_current_publication_id uuid,
  p_bundle_fingerprint char(64),
  p_dry_run_hash char(64),
  p_approval_id text,
  p_idempotency_key uuid,
  p_actor text,
  p_publication_process text,
  p_command_version text,
  p_git_commit text,
  p_reason text,
  p_validation_summary jsonb,
  p_score_members jsonb,
  p_equity_component_members jsonb,
  p_food_component_members jsonb,
  p_source_snapshot_members jsonb,
  p_resource_version_members jsonb,
  p_audit_event_id uuid,
  p_environment "publication_environment",
  p_request_hash char(64)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_publication "atlas_publications"%ROWTYPE;
  candidate_food "food_score_runs"%ROWTYPE;
  candidate_baseline "score_runs"%ROWTYPE;
  existing_publication_id uuid;
  prior_food_id uuid;
  prior_baseline_id uuid;
  inserted_count bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('mke-atlas-publication', 0));

  SELECT "id" INTO existing_publication_id
  FROM "atlas_publications"
  WHERE "idempotency_key" = p_idempotency_key
    AND "food_score_run_id" = p_food_run_id
    AND "bundle_fingerprint" = p_bundle_fingerprint
    AND "dry_run_hash" = p_dry_run_hash;

  IF existing_publication_id IS NOT NULL THEN
    RETURN existing_publication_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "atlas_publications"
    WHERE "idempotency_key" = p_idempotency_key
  ) THEN
    RAISE EXCEPTION 'Publication idempotency key was reused with different inputs';
  END IF;

  SELECT * INTO current_publication
  FROM "atlas_publications"
  WHERE "state" = 'published'
  FOR UPDATE;

  IF current_publication.id IS DISTINCT FROM p_expected_current_publication_id THEN
    RAISE EXCEPTION 'Expected current Atlas publication does not match';
  END IF;

  SELECT * INTO candidate_food
  FROM "food_score_runs"
  WHERE "id" = p_food_run_id
  FOR UPDATE;

  IF candidate_food.id IS NULL OR candidate_food.status <> 'validated'
     OR candidate_food.output_hash IS NULL
     OR candidate_food.validation_result IS NULL THEN
    RAISE EXCEPTION 'Candidate Food run is not fully validated';
  END IF;

  SELECT * INTO candidate_baseline
  FROM "score_runs"
  WHERE "id" = candidate_food.equity_baseline_run_id
  FOR UPDATE;

  IF candidate_baseline.id IS NULL
     OR candidate_baseline.status NOT IN ('validated', 'published')
     OR candidate_baseline.output_hash IS NULL
     OR candidate_baseline.validation_result IS NULL
     OR candidate_baseline.output_hash <> candidate_food.equity_baseline_output_hash THEN
    RAISE EXCEPTION 'Candidate Food run baseline pin is invalid';
  END IF;

  PERFORM set_config('mke.publication_operation', 'enabled', true);

  IF current_publication.id IS NOT NULL THEN
    prior_food_id := current_publication.food_score_run_id;
    prior_baseline_id := current_publication.equity_baseline_run_id;

    UPDATE "atlas_publications"
    SET "state" = 'superseded',
        "superseded_at" = transaction_timestamp(),
        "superseded_by" = p_actor,
        "superseded_reason" = p_reason
    WHERE "id" = current_publication.id;

    UPDATE "food_score_runs"
    SET "status" = 'superseded'
    WHERE "id" = prior_food_id;

    IF prior_baseline_id <> candidate_baseline.id THEN
      UPDATE "score_runs"
      SET "status" = 'superseded'
      WHERE "id" = prior_baseline_id;
    END IF;
  END IF;

  INSERT INTO "atlas_publications" (
    "id", "food_score_run_id", "equity_baseline_run_id",
    "food_output_hash", "equity_baseline_output_hash",
    "bundle_fingerprint", "dry_run_hash", "state",
    "published_at", "published_by", "approval_id", "idempotency_key",
    "publication_process", "command_version", "git_commit", "reason",
    "validation_summary", "created_at"
  ) VALUES (
    p_publication_id, candidate_food.id, candidate_baseline.id,
    candidate_food.output_hash, candidate_baseline.output_hash,
    p_bundle_fingerprint, p_dry_run_hash, 'published',
    transaction_timestamp(), p_actor, p_approval_id, p_idempotency_key,
    p_publication_process, p_command_version, p_git_commit, p_reason,
    p_validation_summary, transaction_timestamp()
  );

  IF current_publication.id IS NOT NULL THEN
    UPDATE "atlas_publications"
    SET "superseded_by_publication_id" = p_publication_id
    WHERE "id" = current_publication.id;
  END IF;

  INSERT INTO "atlas_publication_score_members" (
    "publication_id", "geography_id", "food_score_id", "equity_score_id"
  )
  SELECT p_publication_id, member.geography_id, member.food_score_id, member.equity_score_id
  FROM jsonb_to_recordset(p_score_members) AS member(
    geography_id uuid, food_score_id uuid, equity_score_id uuid
  );

  INSERT INTO "atlas_publication_equity_component_members" (
    "publication_id", "component_id", "indicator_value_id"
  )
  SELECT p_publication_id, member.component_id, member.indicator_value_id
  FROM jsonb_to_recordset(p_equity_component_members) AS member(
    component_id uuid, indicator_value_id uuid
  );

  INSERT INTO "atlas_publication_food_component_members" (
    "publication_id", "component_id", "access_metric_value_id"
  )
  SELECT p_publication_id, member.component_id, member.access_metric_value_id
  FROM jsonb_to_recordset(p_food_component_members) AS member(
    component_id uuid, access_metric_value_id uuid
  );

  INSERT INTO "atlas_publication_source_snapshot_members" (
    "publication_id", "snapshot_id", "role", "redistribution_decision",
    "terms_url", "attribution", "warning"
  )
  SELECT p_publication_id, member.snapshot_id,
    member.role::"publication_source_role",
    member.redistribution_decision::"publication_redistribution_decision",
    member.terms_url, member.attribution, member.warning
  FROM jsonb_to_recordset(p_source_snapshot_members) AS member(
    snapshot_id uuid, role text, redistribution_decision text,
    terms_url text, attribution text, warning text
  );

  INSERT INTO "atlas_publication_resource_version_members" (
    "publication_id", "resource_version_id", "role", "redistribution_decision",
    "terms_url", "attribution", "warning"
  )
  SELECT p_publication_id, member.resource_version_id,
    member.role::"publication_resource_role",
    member.redistribution_decision::"publication_redistribution_decision",
    member.terms_url, member.attribution, member.warning
  FROM jsonb_to_recordset(p_resource_version_members) AS member(
    resource_version_id uuid, role text, redistribution_decision text,
    terms_url text, attribution text, warning text
  );

  SELECT count(*) INTO inserted_count
  FROM "atlas_publication_score_members"
  WHERE "publication_id" = p_publication_id;
  IF inserted_count = 0
     OR inserted_count <> (
       SELECT count(*) FROM "food_scores"
       WHERE "food_score_run_id" = candidate_food.id
     )
     OR inserted_count <> (
       SELECT count(*) FROM "scores"
       WHERE "score_run_id" = candidate_baseline.id
     ) THEN
    RAISE EXCEPTION 'Publication score membership is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "atlas_publication_score_members" member
    JOIN "food_scores" food ON food.id = member.food_score_id
    JOIN "scores" equity ON equity.id = member.equity_score_id
    WHERE member.publication_id = p_publication_id
      AND (
        food.food_score_run_id <> candidate_food.id
        OR equity.score_run_id <> candidate_baseline.id
        OR food.geography_id <> member.geography_id
        OR equity.geography_id <> member.geography_id
        OR food.equity_baseline_score_id <> equity.id
      )
  ) THEN
    RAISE EXCEPTION 'Publication score membership has mismatched lineage';
  END IF;

  IF (
    SELECT count(*) FROM "atlas_publication_equity_component_members"
    WHERE "publication_id" = p_publication_id
  ) <> (
    SELECT count(*) FROM "score_components"
    WHERE "score_run_id" = candidate_baseline.id
  ) OR EXISTS (
    SELECT 1
    FROM "atlas_publication_equity_component_members" member
    JOIN "score_components" component ON component.id = member.component_id
    WHERE member.publication_id = p_publication_id
      AND (
        component.score_run_id <> candidate_baseline.id
        OR component.indicator_value_id <> member.indicator_value_id
      )
  ) THEN
    RAISE EXCEPTION 'Publication Equity component membership is incomplete or mismatched';
  END IF;

  IF (
    SELECT count(*) FROM "atlas_publication_food_component_members"
    WHERE "publication_id" = p_publication_id
  ) <> (
    SELECT count(*) FROM "food_score_components"
    WHERE "food_score_run_id" = candidate_food.id
  ) OR EXISTS (
    SELECT 1
    FROM "atlas_publication_food_component_members" member
    JOIN "food_score_components" component ON component.id = member.component_id
    WHERE member.publication_id = p_publication_id
      AND (
        component.food_score_run_id <> candidate_food.id
        OR component.access_metric_value_id <> member.access_metric_value_id
      )
  ) THEN
    RAISE EXCEPTION 'Publication Food component membership is incomplete or mismatched';
  END IF;

  IF jsonb_array_length(p_source_snapshot_members) = 0
     OR jsonb_array_length(p_resource_version_members) = 0 THEN
    RAISE EXCEPTION 'Publication source and resource manifests cannot be empty';
  END IF;

  IF candidate_baseline.status = 'validated' THEN
    UPDATE "score_runs" SET "status" = 'published'
    WHERE "id" = candidate_baseline.id;
  END IF;
  UPDATE "food_score_runs" SET "status" = 'published'
  WHERE "id" = candidate_food.id;

  INSERT INTO "atlas_publication_audit_events" (
    "id", "idempotency_key", "action", "outcome", "environment",
    "request_hash", "publication_id", "actor", "approval_id",
    "event_at", "error_code", "metadata"
  ) VALUES (
    p_audit_event_id, p_idempotency_key, 'publish', 'succeeded', p_environment,
    p_request_hash, p_publication_id, p_actor, p_approval_id,
    transaction_timestamp(), NULL,
    jsonb_build_object('bundle_fingerprint', p_bundle_fingerprint)
  );

  RETURN p_publication_id;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION withdraw_atlas_release(
  p_publication_id uuid,
  p_approval_id text,
  p_idempotency_key uuid,
  p_actor text,
  p_reason text,
  p_audit_event_id uuid,
  p_environment "publication_environment",
  p_request_hash char(64)
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_publication "atlas_publications"%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('mke-atlas-publication', 0));
  SELECT * INTO current_publication
  FROM "atlas_publications"
  WHERE "state" = 'published'
  FOR UPDATE;

  IF current_publication.id IS NULL OR current_publication.id <> p_publication_id THEN
    RAISE EXCEPTION 'Withdrawal target is not the current Atlas publication';
  END IF;

  PERFORM set_config('mke.publication_operation', 'enabled', true);
  UPDATE "atlas_publications"
  SET "state" = 'superseded',
      "superseded_at" = transaction_timestamp(),
      "superseded_by" = p_actor,
      "superseded_reason" = p_reason
  WHERE "id" = p_publication_id;
  UPDATE "food_score_runs" SET "status" = 'superseded'
  WHERE "id" = current_publication.food_score_run_id;
  UPDATE "score_runs" SET "status" = 'superseded'
  WHERE "id" = current_publication.equity_baseline_run_id;

  INSERT INTO "atlas_publication_audit_events" (
    "id", "idempotency_key", "action", "outcome", "environment",
    "request_hash", "publication_id", "actor", "approval_id",
    "event_at", "error_code", "metadata"
  ) VALUES (
    p_audit_event_id, p_idempotency_key, 'withdraw', 'succeeded', p_environment,
    p_request_hash, p_publication_id, p_actor, p_approval_id,
    transaction_timestamp(), NULL, '{}'::jsonb
  );
  RETURN p_publication_id;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION publish_atlas_release(
  uuid, uuid, uuid, char, char, text, uuid, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, "publication_environment", char
) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION withdraw_atlas_release(
  uuid, text, uuid, text, text, uuid, "publication_environment", char
) FROM PUBLIC;
