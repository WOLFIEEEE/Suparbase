DROP INDEX "connections_user_idx";--> statement-breakpoint
DROP INDEX "audit_user_idx";--> statement-breakpoint
DROP INDEX "audit_connection_idx";--> statement-breakpoint
DROP INDEX "audit_session_idx";--> statement-breakpoint
DROP INDEX "sentry_finding_per_conn_idx";--> statement-breakpoint
DROP INDEX "agent_session_per_conn_idx";--> statement-breakpoint
DROP INDEX "agent_session_per_agent_idx";--> statement-breakpoint
DROP INDEX "billing_event_unapplied_idx";--> statement-breakpoint
CREATE INDEX "connections_user_recent_idx" ON "connections" USING btree ("user_id","last_used_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_conn_recent_idx" ON "audit_log" USING btree ("user_id","connection_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_session_created_idx" ON "audit_log" USING btree ("session_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sentry_finding_per_conn_recent_idx" ON "sentry_finding" USING btree ("user_id","connection_id","status","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_session_per_agent_recent_idx" ON "agent_session" USING btree ("user_id","connection_id","kind","status","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "admin_action_created_at_idx" ON "admin_action" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "billing_event_unapplied_idx" ON "billing_event" USING btree ("received_at" DESC NULLS LAST) WHERE "billing_event"."applied_at" IS NULL;--> statement-breakpoint
-- pg_trgm: enables substring / fuzzy search on text columns via GIN.
-- Used by the admin user search (`/admin/users?q=...`) so a leading
-- `%foo%` ILIKE doesn't full-scan once `users` grows past a few k
-- rows. The extension is shipped with every modern Postgres; the
-- `IF NOT EXISTS` keeps re-runs idempotent.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_name_trgm_idx" ON "users" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
-- GIN on audit_log.primary_key for the row-history `@>` lookup
-- (`POST /api/v/[id]/audit/row`). Without this, every row-history
-- click on a popular row scans the per-(user,conn) shard.
-- `jsonb_path_ops` is smaller and faster than the default opclass
-- for pure containment queries.
CREATE INDEX IF NOT EXISTS "audit_pk_gin_idx" ON "audit_log" USING gin ("primary_key" jsonb_path_ops);
