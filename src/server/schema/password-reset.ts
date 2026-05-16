import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Single-use, time-bound password-reset tokens. Created by
 * `POST /api/auth/forgot-password`, consumed by
 * `POST /api/auth/reset-password`. The token in the URL is a
 * url-safe random string; only its SHA-256 hash is persisted, so a
 * compromise of the application DB doesn't yield reusable reset
 * URLs.
 *
 * Lifetime: 1 hour from creation.
 * Replay defence: `consumed_at` set once the password is changed.
 *   A reused token is rejected.
 * Enumeration defence: the request endpoint returns 200 whether
 *   the email exists or not.
 */
export const passwordResetTokens = pgTable(
  "password_reset_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 hex digest of the actual token sent in the email URL. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    /** IP the request came from. Forensics only; not displayed to the user. */
    requestedFromIp: text("requested_from_ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqHash: uniqueIndex("password_reset_token_hash_unique").on(t.tokenHash),
    byUserRecent: index("password_reset_token_by_user_idx").on(t.userId, t.createdAt),
  }),
);

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
