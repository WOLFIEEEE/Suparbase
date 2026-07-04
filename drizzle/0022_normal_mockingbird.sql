CREATE TABLE "scheduled_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"snippet_id" uuid NOT NULL,
	"name" text NOT NULL,
	"delivery" text NOT NULL,
	"target" text NOT NULL,
	"interval_hours" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_watch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sql" text NOT NULL,
	"webhook_url" text,
	"interval_minutes" integer DEFAULT 60 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_match_count" integer DEFAULT 0 NOT NULL,
	"last_alerted_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pinned_table" (
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"table_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pinned_table_user_id_connection_id_table_name_pk" PRIMARY KEY("user_id","connection_id","table_name")
);
--> statement-breakpoint
CREATE TABLE "recent_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"table_name" text NOT NULL,
	"primary_key" jsonb NOT NULL,
	"label" text NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_report" ADD CONSTRAINT "scheduled_report_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_report" ADD CONSTRAINT "scheduled_report_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_report" ADD CONSTRAINT "scheduled_report_snippet_id_sql_snippet_id_fk" FOREIGN KEY ("snippet_id") REFERENCES "public"."sql_snippet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_watch" ADD CONSTRAINT "data_watch_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_watch" ADD CONSTRAINT "data_watch_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pinned_table" ADD CONSTRAINT "pinned_table_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pinned_table" ADD CONSTRAINT "pinned_table_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_record" ADD CONSTRAINT "recent_record_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_record" ADD CONSTRAINT "recent_record_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_report_per_conn_idx" ON "scheduled_report" USING btree ("user_id","connection_id");--> statement-breakpoint
CREATE INDEX "scheduled_report_due_idx" ON "scheduled_report" USING btree ("enabled","last_run_at");--> statement-breakpoint
CREATE INDEX "data_watch_per_conn_idx" ON "data_watch" USING btree ("user_id","connection_id");--> statement-breakpoint
CREATE INDEX "data_watch_due_idx" ON "data_watch" USING btree ("enabled","last_checked_at");--> statement-breakpoint
CREATE INDEX "pinned_table_per_conn_idx" ON "pinned_table" USING btree ("user_id","connection_id");--> statement-breakpoint
CREATE INDEX "recent_record_per_conn_recent_idx" ON "recent_record" USING btree ("user_id","connection_id","viewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recent_record_unique_idx" ON "recent_record" USING btree ("user_id","connection_id","table_name","primary_key");