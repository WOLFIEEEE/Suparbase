import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Audit trail of admin-panel actions. Mirrors `audit_log` but for
 * operator activity (grant comp plan, reset subscription, etc) rather
 * than data writes against a customer's Supabase project.
 *
 * Anything the admin panel does that mutates customer state writes
 * one row here BEFORE the mutation, so an operator can answer
 * "who comped which account when".
 */
export const adminActions = pgTable(
  "admin_action",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
    details: jsonb("details").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byAdmin: index("admin_action_by_admin_idx").on(t.adminUserId, t.createdAt),
    byTarget: index("admin_action_by_target_idx").on(t.targetUserId, t.createdAt),
  }),
);

export type AdminActionRow = typeof adminActions.$inferSelect;
