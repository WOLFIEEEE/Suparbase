CREATE INDEX "audit_workspace_recent_idx" ON "audit_log" USING btree ("connection_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sentry_finding_workspace_recent_idx" ON "sentry_finding" USING btree ("connection_id","status","last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sentry_scan_workspace_recent_idx" ON "sentry_scan" USING btree ("connection_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_session_workspace_recent_idx" ON "agent_session" USING btree ("connection_id","last_seen_at" DESC NULLS LAST);