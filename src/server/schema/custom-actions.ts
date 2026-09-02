import { boolean, customType, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";

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

export type ActionScope = "global" | "table" | "row";
export type ActionKind = "sql" | "webhook";
export type ActionWebhookMethod = "POST" | "PATCH" | "PUT" | "DELETE";
export type ActionParamType = "string" | "number" | "boolean" | "json";

export interface ActionParam {
  name: string;
  label: string;
  type: ActionParamType;
  required: boolean;
  placeholder?: string;
}

export const customActions = pgTable(
  "custom_action",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    label: text("label").notNull(),
    description: text("description"),

    scope: text("scope").$type<ActionScope>().notNull(),
    tableSchema: text("table_schema"),
    tableName: text("table_name"),

    kind: text("kind").$type<ActionKind>().notNull(),

    sqlTemplate: text("sql_template"),
    readOnly: boolean("read_only").default(false).notNull(),

    webhookUrl: text("webhook_url"),
    webhookMethod: text("webhook_method").$type<ActionWebhookMethod>(),
    /** Legacy plaintext column, retained only for lazy migration. */
    webhookHeaders: jsonb("webhook_headers").$type<Record<string, string>>(),
    webhookHeadersEncrypted: bytea("webhook_headers_encrypted"),

    params: jsonb("params").$type<ActionParam[]>().default([]).notNull(),
    danger: boolean("danger").default(false).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    perConnIdx: index("custom_action_per_conn_idx").on(t.userId, t.connectionId),
    perTableIdx: index("custom_action_per_table_idx").on(
      t.userId,
      t.connectionId,
      t.tableSchema,
      t.tableName,
    ),
  }),
);

export type CustomActionRow = typeof customActions.$inferSelect;
