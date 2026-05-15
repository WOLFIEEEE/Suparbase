CREATE TABLE "sentry_finding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"discovered_in_scan_id" uuid,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"schema_name" text,
	"table_name" text,
	"column_name" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"quarantine_policy_name" text
);
--> statement-breakpoint
CREATE TABLE "sentry_scan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"tables_scanned" text[] DEFAULT '{}' NOT NULL,
	"findings_count" text DEFAULT '0' NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "sentry_finding" ADD CONSTRAINT "sentry_finding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentry_finding" ADD CONSTRAINT "sentry_finding_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentry_finding" ADD CONSTRAINT "sentry_finding_discovered_in_scan_id_sentry_scan_id_fk" FOREIGN KEY ("discovered_in_scan_id") REFERENCES "public"."sentry_scan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentry_scan" ADD CONSTRAINT "sentry_scan_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sentry_scan" ADD CONSTRAINT "sentry_scan_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sentry_finding_per_conn_idx" ON "sentry_finding" USING btree ("user_id","connection_id","status");--> statement-breakpoint
CREATE INDEX "sentry_finding_per_table_idx" ON "sentry_finding" USING btree ("user_id","connection_id","schema_name","table_name");--> statement-breakpoint
CREATE INDEX "sentry_scan_per_conn_idx" ON "sentry_scan" USING btree ("user_id","connection_id","started_at");