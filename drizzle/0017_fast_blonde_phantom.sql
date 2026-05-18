ALTER TABLE "users" ADD COLUMN "email_undeliverable_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_undeliverable_reason" text;