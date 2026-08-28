CREATE TYPE "public"."sync_kind" AS ENUM('backfill', 'incremental', 'manual');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('queued', 'running', 'success', 'error');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"icu_activity_id" text NOT NULL,
	"source" text,
	"external_id" text,
	"name" text,
	"type" text NOT NULL,
	"sub_type" text,
	"start_date_local" timestamp NOT NULL,
	"start_date" timestamp with time zone,
	"timezone" text,
	"distance_m" double precision,
	"moving_time_s" integer,
	"elapsed_time_s" integer,
	"elevation_gain_m" double precision,
	"elevation_loss_m" double precision,
	"avg_speed_ms" double precision,
	"max_speed_ms" double precision,
	"pace_s_per_km" double precision,
	"gap_s_per_km" double precision,
	"avg_hr" integer,
	"max_hr" integer,
	"avg_cadence" double precision,
	"calories" integer,
	"training_load" double precision,
	"atl" double precision,
	"ctl" double precision,
	"intensity" double precision,
	"efficiency_factor" double precision,
	"decoupling" double precision,
	"avg_stride_m" double precision,
	"trimp" double precision,
	"hr_zone_times" jsonb,
	"pace_zone_times" jsonb,
	"is_race" boolean DEFAULT false NOT NULL,
	"is_treadmill" boolean DEFAULT false NOT NULL,
	"feel" integer,
	"rpe" integer,
	"device_name" text,
	"stream_types" jsonb,
	"has_gps" boolean DEFAULT false NOT NULL,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_user_icu_activity_unique" UNIQUE("user_id","icu_activity_id")
);
--> statement-breakpoint
CREATE TABLE "activity_streams" (
	"activity_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"point_count" integer NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'intervals_icu' NOT NULL,
	"icu_athlete_id" text NOT NULL,
	"icu_athlete_name" text,
	"api_key_cipher" text,
	"api_key_iv" text,
	"api_key_tag" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"scopes" text,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" "sync_status",
	"last_sync_error" text,
	"oldest_synced_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_user_provider_unique" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "sync_kind" NOT NULL,
	"status" "sync_status" DEFAULT 'queued' NOT NULL,
	"windows_total" integer DEFAULT 0 NOT NULL,
	"windows_done" integer DEFAULT 0 NOT NULL,
	"activities_upserted" integer DEFAULT 0 NOT NULL,
	"wellness_upserted" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wellness" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"weight_kg" double precision,
	"resting_hr" integer,
	"hrv" double precision,
	"sleep_secs" integer,
	"sleep_score" integer,
	"steps" integer,
	"ctl" double precision,
	"atl" double precision,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wellness_user_date_unique" UNIQUE("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_streams" ADD CONSTRAINT "activity_streams_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wellness" ADD CONSTRAINT "wellness_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "activities_user_start_idx" ON "activities" USING btree ("user_id","start_date_local");--> statement-breakpoint
CREATE INDEX "activities_user_type_idx" ON "activities" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "sync_jobs_user_started_idx" ON "sync_jobs" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "wellness_user_date_idx" ON "wellness" USING btree ("user_id","date");