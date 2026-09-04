ALTER TABLE "activities" ADD COLUMN "fit_file_hash" text;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_fit_file_hash_unique" UNIQUE("user_id","fit_file_hash");
