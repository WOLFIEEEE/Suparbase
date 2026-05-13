import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";
import type { TableAnalysis } from "@/lib/types/analysis";

export const schemaAnalysis = pgTable(
  "schema_analysis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    schemaFingerprint: text("schema_fingerprint").notNull(),
    analysis: jsonb("analysis").$type<TableAnalysis[]>().notNull(),
    model: text("model").notNull(),
    source: text("source").$type<"ai" | "heuristic">().notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueFingerprint: unique("schema_analysis_user_conn_fp_unique").on(
      t.userId,
      t.connectionId,
      t.schemaFingerprint,
    ),
    connectionIdx: index("schema_analysis_connection_idx").on(t.connectionId),
  }),
);

export type SchemaAnalysisRow = typeof schemaAnalysis.$inferSelect;
