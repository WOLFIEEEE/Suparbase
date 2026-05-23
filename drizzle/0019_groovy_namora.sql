ALTER TABLE "sync_profile" ADD COLUMN "schedule_interval_hours" integer;--> statement-breakpoint
ALTER TABLE "sync_profile" ADD COLUMN "last_scheduled_run_at" timestamp with time zone;