CREATE TABLE "neighborhood_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"neighborhood_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"source_object_id" integer NOT NULL,
	"name" text NOT NULL,
	"geometry" geometry(MultiPolygon,4326) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "neighborhood_versions_neighborhood_snapshot_unique" UNIQUE("neighborhood_id","snapshot_id"),
	CONSTRAINT "neighborhood_versions_snapshot_object_unique" UNIQUE("snapshot_id","source_object_id"),
	CONSTRAINT "neighborhood_versions_id_snapshot_unique" UNIQUE("id","snapshot_id"),
	CONSTRAINT "neighborhood_versions_object_id_check" CHECK ("neighborhood_versions"."source_object_id" > 0),
	CONSTRAINT "neighborhood_versions_name_check" CHECK (btrim("neighborhood_versions"."name") <> ''),
	CONSTRAINT "neighborhood_versions_geometry_srid_check" CHECK (ST_SRID("neighborhood_versions"."geometry") = 4326),
	CONSTRAINT "neighborhood_versions_geometry_not_empty_check" CHECK (NOT ST_IsEmpty("neighborhood_versions"."geometry")),
	CONSTRAINT "neighborhood_versions_geometry_valid_check" CHECK (ST_IsValid("neighborhood_versions"."geometry"))
);
--> statement-breakpoint
CREATE TABLE "neighborhoods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"source_neighborhood_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "neighborhoods_source_neighborhood_unique" UNIQUE("source_id","source_neighborhood_id"),
	CONSTRAINT "neighborhoods_source_neighborhood_id_check" CHECK ("neighborhoods"."source_neighborhood_id" > 0)
);
--> statement-breakpoint
CREATE TABLE "tract_neighborhood_contexts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"geography_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"tract_area_sq_m" numeric(20, 6) NOT NULL,
	"covered_area_sq_m" numeric(20, 6) NOT NULL,
	"city_reference_coverage" numeric(18, 15) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tract_neighborhood_contexts_geography_snapshot_unique" UNIQUE("geography_id","snapshot_id"),
	CONSTRAINT "tract_neighborhood_contexts_tract_area_check" CHECK ("tract_neighborhood_contexts"."tract_area_sq_m" > 0),
	CONSTRAINT "tract_neighborhood_contexts_covered_area_check" CHECK ("tract_neighborhood_contexts"."covered_area_sq_m" >= 0 AND "tract_neighborhood_contexts"."covered_area_sq_m" <= "tract_neighborhood_contexts"."tract_area_sq_m"),
	CONSTRAINT "tract_neighborhood_contexts_coverage_check" CHECK ("tract_neighborhood_contexts"."city_reference_coverage" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "tract_neighborhood_overlaps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"geography_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"neighborhood_version_id" uuid NOT NULL,
	"overlap_area_sq_m" numeric(20, 6) NOT NULL,
	"covered_area_share" numeric(18, 15) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tract_neighborhood_overlaps_identity_unique" UNIQUE("geography_id","snapshot_id","neighborhood_version_id"),
	CONSTRAINT "tract_neighborhood_overlaps_area_check" CHECK ("tract_neighborhood_overlaps"."overlap_area_sq_m" > 0),
	CONSTRAINT "tract_neighborhood_overlaps_share_check" CHECK ("tract_neighborhood_overlaps"."covered_area_share" > 0 AND "tract_neighborhood_overlaps"."covered_area_share" <= 1)
);
--> statement-breakpoint
ALTER TABLE "neighborhood_versions" ADD CONSTRAINT "neighborhood_versions_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhood_versions" ADD CONSTRAINT "neighborhood_versions_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tract_neighborhood_contexts" ADD CONSTRAINT "tract_neighborhood_contexts_geography_id_geographies_id_fk" FOREIGN KEY ("geography_id") REFERENCES "public"."geographies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tract_neighborhood_contexts" ADD CONSTRAINT "tract_neighborhood_contexts_snapshot_id_source_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."source_snapshots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tract_neighborhood_overlaps" ADD CONSTRAINT "tract_neighborhood_overlaps_context_fk" FOREIGN KEY ("geography_id","snapshot_id") REFERENCES "public"."tract_neighborhood_contexts"("geography_id","snapshot_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tract_neighborhood_overlaps" ADD CONSTRAINT "tract_neighborhood_overlaps_version_snapshot_fk" FOREIGN KEY ("neighborhood_version_id","snapshot_id") REFERENCES "public"."neighborhood_versions"("id","snapshot_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "neighborhood_versions_geometry_gist" ON "neighborhood_versions" USING gist ("geometry");--> statement-breakpoint
CREATE INDEX "neighborhood_versions_snapshot_idx" ON "neighborhood_versions" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "neighborhood_versions_name_idx" ON "neighborhood_versions" USING btree ("name");--> statement-breakpoint
CREATE INDEX "neighborhoods_source_idx" ON "neighborhoods" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "tract_neighborhood_contexts_snapshot_idx" ON "tract_neighborhood_contexts" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "tract_neighborhood_overlaps_geography_snapshot_idx" ON "tract_neighborhood_overlaps" USING btree ("geography_id","snapshot_id");--> statement-breakpoint
CREATE INDEX "tract_neighborhood_overlaps_version_idx" ON "tract_neighborhood_overlaps" USING btree ("neighborhood_version_id");
