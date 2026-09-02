import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Personal API tokens (v3.20). The plaintext token (`sbp_` + 43 url-safe
 * chars) is shown exactly once at creation; only its SHA-256 is stored.
 * `prefix` keeps the first characters so a user can tell tokens apart in
 * the list. Tokens authenticate the read-only public API under
 * /api/public/v1 and never grant access beyond what the owning user has.
 */
export type ApiTokenScope = "read";

export const apiTokens = pgTable(
  "api_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    prefix: text("prefix").notNull(),
    scope: text("scope").$type<ApiTokenScope>().notNull().default("read"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueHash: uniqueIndex("api_token_hash_unique_idx").on(t.tokenHash),
    perUser: index("api_token_per_user_idx").on(t.userId, t.createdAt.desc()),
  }),
);

export type ApiTokenRow = typeof apiTokens.$inferSelect;
