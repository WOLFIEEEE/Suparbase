import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { connections } from "./connections";

export type WidgetType = "kpi" | "bar" | "line" | "list";
export type WidgetSpan = "1" | "2" | "full";

export interface WidgetVisConfig {
  /** kpi: column holding the single value. */
  valueColumn?: string;
  /** kpi format hints. */
  format?: "number" | "currency" | "percent";
  unit?: string;
  prefix?: string;
  /** bar/line: column for label/x-axis. */
  labelColumn?: string;
  /** list: columns to show, in order. */
  columns?: string[];
}

export const dashboardWidgets = pgTable(
  "dashboard_widget",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),

    type: text("type").$type<WidgetType>().notNull(),
    title: text("title").notNull(),
    description: text("description"),

    sql: text("sql").notNull(),
    visConfig: jsonb("vis_config").$type<WidgetVisConfig>().default({}).notNull(),

    position: integer("position").default(0).notNull(),
    span: text("span").$type<WidgetSpan>().default("1").notNull(),
    refreshSec: integer("refresh_sec").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    perConnIdx: index("dashboard_widget_per_conn_idx").on(t.userId, t.connectionId, t.position),
  }),
);

export type DashboardWidgetRow = typeof dashboardWidgets.$inferSelect;
