ALTER TABLE "audit_log" ADD COLUMN "before_row" jsonb;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "after_row" jsonb;