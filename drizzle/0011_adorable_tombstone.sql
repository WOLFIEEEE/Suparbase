CREATE TABLE "billing_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" text NOT NULL,
	"event_type" text NOT NULL,
	"dodo_subscription_id" text,
	"user_id" uuid,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'none' NOT NULL,
	"dodo_customer_id" text,
	"dodo_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"granted_by_admin" uuid,
	"granted_at" timestamp with time zone,
	"admin_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_user_id" uuid,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_event" ADD CONSTRAINT "billing_event_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_granted_by_admin_users_id_fk" FOREIGN KEY ("granted_by_admin") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_action" ADD CONSTRAINT "admin_action_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_action" ADD CONSTRAINT "admin_action_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_event_webhook_id_unique" ON "billing_event" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "billing_event_user_idx" ON "billing_event" USING btree ("user_id","received_at");--> statement-breakpoint
CREATE INDEX "billing_event_sub_idx" ON "billing_event" USING btree ("dodo_subscription_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_dodo_customer_unique" ON "subscription" USING btree ("dodo_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_dodo_sub_unique" ON "subscription" USING btree ("dodo_subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_plan_idx" ON "subscription" USING btree ("plan","status");--> statement-breakpoint
CREATE INDEX "admin_action_by_admin_idx" ON "admin_action" USING btree ("admin_user_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_action_by_target_idx" ON "admin_action" USING btree ("target_user_id","created_at");