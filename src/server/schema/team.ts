import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";

export type MemberRole = "editor" | "viewer";
export type ConnectionRole = "owner" | "editor" | "viewer";

/**
 * Membership rows. `owner` is implicit via connections.user_id, so this
 * table only holds editor/viewer members. (owner, user_id) is enforced
 * via the foreign key on connections + a unique constraint on
 * (connection_id, user_id) below.
 */
export const connectionMembers = pgTable(
  "connection_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<MemberRole>().notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqMember: uniqueIndex("connection_member_unique").on(t.connectionId, t.userId),
    byUser: index("connection_member_by_user_idx").on(t.userId),
  }),
);

export type ConnectionMemberRow = typeof connectionMembers.$inferSelect;

/**
 * Pending invitations. Tokens are url-safe random strings created in the
 * invite handler and stored verbatim — the URL is the bearer credential
 * until it's accepted.
 */
export const connectionInvitations = pgTable(
  "connection_invitation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").$type<MemberRole>().notNull(),
    token: text("token").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqToken: uniqueIndex("connection_invitation_token_unique").on(t.token),
    byConn: index("connection_invitation_by_conn_idx").on(t.connectionId),
    byEmail: index("connection_invitation_by_email_idx").on(t.email),
  }),
);

export type ConnectionInvitationRow = typeof connectionInvitations.$inferSelect;
