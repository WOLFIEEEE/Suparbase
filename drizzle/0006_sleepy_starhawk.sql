CREATE TABLE "custom_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"scope" text NOT NULL,
	"table_schema" text,
	"table_name" text,
	"kind" text NOT NULL,
	"sql_template" text,
	"read_only" boolean DEFAULT false NOT NULL,
	"webhook_url" text,
	"webhook_method" text,
	"webhook_headers" jsonb,
	"params" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"danger" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "custom_action" ADD CONSTRAINT "custom_action_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_action" ADD CONSTRAINT "custom_action_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_action_per_conn_idx" ON "custom_action" USING btree ("user_id","connection_id");--> statement-breakpoint
CREATE INDEX "custom_action_per_table_idx" ON "custom_action" USING btree ("user_id","connection_id","table_schema","table_name");