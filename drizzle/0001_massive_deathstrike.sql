CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_openrouter_key" "bytea",
	"default_model" text DEFAULT 'anthropic/claude-3.5-haiku' NOT NULL,
	"last_analysis_model" text,
	"last_analysis_at" timestamp with time zone,
	"last_prompt_tokens" integer,
	"last_completion_tokens" integer,
	"last_total_tokens" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"schema_fingerprint" text NOT NULL,
	"analysis" jsonb NOT NULL,
	"model" text NOT NULL,
	"source" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schema_analysis_user_conn_fp_unique" UNIQUE("user_id","connection_id","schema_fingerprint")
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_analysis" ADD CONSTRAINT "schema_analysis_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_analysis" ADD CONSTRAINT "schema_analysis_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schema_analysis_connection_idx" ON "schema_analysis" USING btree ("connection_id");