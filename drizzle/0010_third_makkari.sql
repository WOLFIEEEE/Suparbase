CREATE TABLE "agent_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"user_agent_raw" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"mutation_count" integer DEFAULT 0 NOT NULL,
	"tables_touched" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"undo_attempted_count" integer DEFAULT 0 NOT NULL,
	"undo_reverted_count" integer DEFAULT 0 NOT NULL,
	"undo_error" text
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_session_per_conn_idx" ON "agent_session" USING btree ("user_id","connection_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "agent_session_per_agent_idx" ON "agent_session" USING btree ("user_id","connection_id","kind","status");--> statement-breakpoint
CREATE INDEX "audit_session_idx" ON "audit_log" USING btree ("session_id");