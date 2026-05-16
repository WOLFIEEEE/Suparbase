import { customType, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

const bytea = customType<{ data: Uint8Array; default: false }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value): Uint8Array {
    if (value instanceof Uint8Array) return value;
    if (Buffer.isBuffer(value)) return new Uint8Array(value);
    if (typeof value === "string" && value.startsWith("\\x")) {
      return new Uint8Array(Buffer.from(value.slice(2), "hex"));
    }
    throw new Error("Unexpected bytea value shape from driver");
  },
  toDriver(value: Uint8Array): Buffer {
    return Buffer.from(value);
  },
});

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    hostname: text("hostname").notNull(),
    role: text("role").$type<"anon" | "authenticated" | "service_role" | "unknown">().notNull(),
    encryptedKey: bytea("encrypted_key").notNull(),
    /**
     * Optional direct Postgres connection string (postgres://...). Encrypted
     * with the same vault key. Used only for RLS introspection / policy
     * simulation; PostgREST remains the primary path for all CRUD.
     */
    encryptedPostgresUrl: bytea("encrypted_postgres_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // Lists are always "this user's connections, most-recently-used
    // first". A single compound (user_id, last_used_at DESC) serves
    // it and supersedes the previous bare `user_idx`.
    byUserRecent: index("connections_user_recent_idx").on(
      t.userId,
      t.lastUsedAt.desc(),
    ),
    uniqueUserName: unique("connections_user_name_unique").on(t.userId, t.name),
  }),
);

export type ConnectionRow = typeof connections.$inferSelect;
export type ConnectionInsert = typeof connections.$inferInsert;
