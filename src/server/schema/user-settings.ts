import { customType, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  encryptedOpenrouterKey: bytea("encrypted_openrouter_key"),
  defaultModel: text("default_model").notNull().default("anthropic/claude-3.5-haiku"),
  lastAnalysisModel: text("last_analysis_model"),
  lastAnalysisAt: timestamp("last_analysis_at", { withTimezone: true }),
  lastPromptTokens: integer("last_prompt_tokens"),
  lastCompletionTokens: integer("last_completion_tokens"),
  lastTotalTokens: integer("last_total_tokens"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UserSettingsRow = typeof userSettings.$inferSelect;
export type UserSettingsInsert = typeof userSettings.$inferInsert;
