CREATE TABLE "sync_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_connection_id" uuid NOT NULL,
	"target_connection_id" uuid NOT NULL,
	"options" jsonb DEFAULT '{"applySchema":false,"allowDestructive":false,"rowCap":null}'::jsonb NOT NULL,
	"table_config" jsonb DEFAULT '{"tables":{}}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_profile_user_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "sync_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"profile_id" uuid,
	"base_connection_id" uuid NOT NULL,
	"target_connection_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"phase" text,
	"dry_run" boolean DEFAULT false NOT NULL,
	"stats" jsonb DEFAULT '{"tables":[],"warnings":[]}'::jsonb NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sync_profile" ADD CONSTRAINT "sync_profile_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_profile" ADD CONSTRAINT "sync_profile_base_connection_id_connections_id_fk" FOREIGN KEY ("base_connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_profile" ADD CONSTRAINT "sync_profile_target_connection_id_connections_id_fk" FOREIGN KEY ("target_connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_profile_id_sync_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."sync_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_base_connection_id_connections_id_fk" FOREIGN KEY ("base_connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_run" ADD CONSTRAINT "sync_run_target_connection_id_connections_id_fk" FOREIGN KEY ("target_connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_profile_user_target_idx" ON "sync_profile" USING btree ("user_id","target_connection_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sync_run_target_recent_idx" ON "sync_run" USING btree ("user_id","target_connection_id","started_at" DESC NULLS LAST);