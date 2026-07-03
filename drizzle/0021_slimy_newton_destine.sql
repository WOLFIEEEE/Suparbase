CREATE TABLE "sql_snippet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sql" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "alert_webhook_url" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "onboarding_dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sql_snippet" ADD CONSTRAINT "sql_snippet_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_snippet" ADD CONSTRAINT "sql_snippet_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sql_snippet_per_conn_idx" ON "sql_snippet" USING btree ("user_id","connection_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sql_snippet_unique_name_idx" ON "sql_snippet" USING btree ("user_id","connection_id","name");