import "server-only";
import { z } from "zod";
import type { ConnectionRow } from "@/server/schema/connections";
import type { Schema, Table } from "@/lib/types/schema";
import type { TableAnalysis } from "@/lib/types/analysis";
import { pgrestServerGet, PgRestServerError } from "@/server/proxy/server-pgrest";

/**
 * Tool runtime for the AI chat agent. The agent never touches the user's
 * Supabase project directly: it asks for tool calls; this module executes
 * them server-side using the decrypted connection key and a strict allow-list
 * of read-only PostgREST verbs.
 */

const MAX_ROWS_PER_QUERY = 50;
const MAX_COLUMNS = 30;

// ---------------------------------------------------------------------------
// Tool schema (OpenAI/OpenRouter function-calling format)
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "list_tables",
      description:
        "List the tables in this Supabase project with their AI-inferred display name, category, and a one-sentence description. Always call this first when you don't know which tables are relevant. Returns a concise catalog only: no row data.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["users", "content", "logs", "commerce", "tasks", "messages", "generic", "all"],
            description: "Filter by inferred category. Use 'all' (default) to see everything.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_table_schema",
      description:
        "Get the column list (name, postgres type, nullable, primary key, foreign key) for a single table. Call this once you've identified a table you need to query so you know which columns exist.",
      parameters: {
        type: "object",
        required: ["table_name"],
        properties: {
          table_name: { type: "string", description: "The exact table name." },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_rows",
      description:
        "Fetch rows read-only for a local preview in the user's browser. Raw values are deliberately NOT returned to the model; the tool result only confirms how many rows were displayed. Use count_rows or aggregate when you need values you can reason about.",
      parameters: {
        type: "object",
        required: ["table_name"],
        properties: {
          table_name: { type: "string", description: "The exact table name." },
          columns: {
            type: "array",
            items: { type: "string" },
            description:
              "Specific columns to return. Omit to return all columns. Cap 30 columns.",
          },
          filters: {
            type: "array",
            description: "Filters combined with AND.",
            items: {
              type: "object",
              required: ["column", "op", "value"],
              properties: {
                column: { type: "string" },
                op: {
                  type: "string",
                  enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"],
                },
                value: {
                  description:
                    "String, number, boolean, or null. For 'in', pass an array of values. For 'is', valid values are true/false/null.",
                },
              },
              additionalProperties: false,
            },
          },
          sort: {
            type: "object",
            required: ["column"],
            properties: {
              column: { type: "string" },
              direction: { type: "string", enum: ["asc", "desc"] },
            },
            additionalProperties: false,
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: MAX_ROWS_PER_QUERY,
            description: `Max rows to return. Hard cap ${MAX_ROWS_PER_QUERY}.`,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "count_rows",
      description:
        "Return the count of rows matching an optional filter set. Cheap aggregate: prefer this over query_rows when you only need totals.",
      parameters: {
        type: "object",
        required: ["table_name"],
        properties: {
          table_name: { type: "string" },
          filters: {
            type: "array",
            items: {
              type: "object",
              required: ["column", "op", "value"],
              properties: {
                column: { type: "string" },
                op: {
                  type: "string",
                  enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"],
                },
                value: {},
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_update",
      description:
        "Build a write proposal that the USER will confirm before anything happens. Use this whenever the user asks to change/set/update existing rows. Returns a preview of up to 5 affected rows plus the planned patch. NEVER executes: the user clicks Apply in the chat UI to commit.",
      parameters: {
        type: "object",
        required: ["table_name", "filters", "patch", "summary"],
        properties: {
          table_name: { type: "string" },
          summary: {
            type: "string",
            description: "One short sentence explaining the change in plain English.",
          },
          filters: {
            type: "array",
            description: "Filters identifying which rows to update. Combined with AND.",
            items: {
              type: "object",
              required: ["column", "op", "value"],
              properties: {
                column: { type: "string" },
                op: {
                  type: "string",
                  enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"],
                },
                value: {},
              },
              additionalProperties: false,
            },
            minItems: 1,
          },
          patch: {
            type: "object",
            description: "Object of column → new value, mirroring PostgREST PATCH payload.",
            additionalProperties: true,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_insert",
      description:
        "Build a write proposal that adds a new row. The USER must confirm in the chat UI before it commits. Validate column names against the schema first via get_table_schema.",
      parameters: {
        type: "object",
        required: ["table_name", "values", "summary"],
        properties: {
          table_name: { type: "string" },
          summary: { type: "string" },
          values: {
            type: "object",
            description: "Object of column → value for the new row.",
            additionalProperties: true,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "aggregate",
      description:
        "Compute a single aggregate (count, sum, avg, min, max) over a table column, with optional filters and grouping. Cheap. Use for analytics questions like 'how many orders shipped last week' or 'average order total by status'.",
      parameters: {
        type: "object",
        required: ["table_name", "op"],
        properties: {
          table_name: { type: "string" },
          op: { type: "string", enum: ["count", "sum", "avg", "min", "max"] },
          column: {
            type: "string",
            description:
              "Column to aggregate. For count, omit to count rows. For sum/avg/min/max, required and must be a numeric column.",
          },
          filters: {
            type: "array",
            items: {
              type: "object",
              required: ["column", "op", "value"],
              properties: {
                column: { type: "string" },
                op: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"] },
                value: {},
              },
            },
          },
          group_by: {
            type: "string",
            description: "Optional column to group by. When set, returns one row per group.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            description: "Max groups to return (when group_by is set).",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_indexes",
      description:
        "List the indexes that exist on a table (name, columns, type, unique). Use when the user asks about performance, missing indexes, or why a query is slow. Read-only.",
      parameters: {
        type: "object",
        required: ["table_name"],
        properties: {
          table_name: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "audit_summary",
      description:
        "Read the most recent audit-log entries for this connection. Use when the user asks 'who changed X', 'what happened recently', or wants to see write activity. Read-only.",
      parameters: {
        type: "object",
        properties: {
          table_name: {
            type: "string",
            description: "Optional: filter to a single table.",
          },
          hours: {
            type: "integer",
            minimum: 1,
            maximum: 720,
            description: "How many hours back to look. Default 24.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            description: "Max entries to return. Default 20.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_delete",
      description:
        "Build a write proposal that deletes rows matching the filters. Returns a preview of up to 5 affected rows. NEVER executes without the user clicking Apply. Use sparingly and only when the user explicitly asked to delete something.",
      parameters: {
        type: "object",
        required: ["table_name", "filters", "summary"],
        properties: {
          table_name: { type: "string" },
          summary: { type: "string" },
          filters: {
            type: "array",
            description: "Filters identifying which rows to delete. Combined with AND.",
            items: {
              type: "object",
              required: ["column", "op", "value"],
              properties: {
                column: { type: "string" },
                op: {
                  type: "string",
                  enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"],
                },
                value: {},
              },
              additionalProperties: false,
            },
            minItems: 1,
          },
        },
        additionalProperties: false,
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Arg validation
// ---------------------------------------------------------------------------

const FilterOp = z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"]);
const FilterValue = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.unknown())]);
const Filter = z.object({ column: z.string(), op: FilterOp, value: FilterValue });

const ListTablesArgs = z.object({ category: z.string().optional() });
const GetSchemaArgs = z.object({ table_name: z.string() });
const QueryRowsArgs = z.object({
  table_name: z.string(),
  columns: z.array(z.string()).max(MAX_COLUMNS).optional(),
  filters: z.array(Filter).max(10).optional(),
  sort: z
    .object({ column: z.string(), direction: z.enum(["asc", "desc"]).optional() })
    .optional(),
  limit: z.number().int().positive().max(MAX_ROWS_PER_QUERY).optional(),
});
const CountRowsArgs = z.object({
  table_name: z.string(),
  filters: z.array(Filter).max(10).optional(),
});
const ProposeUpdateArgs = z.object({
  table_name: z.string(),
  summary: z.string().min(1).max(280),
  filters: z.array(Filter).min(1).max(10),
  patch: z.record(z.unknown()),
});
const ProposeInsertArgs = z.object({
  table_name: z.string(),
  summary: z.string().min(1).max(280),
  values: z.record(z.unknown()),
});
const ProposeDeleteArgs = z.object({
  table_name: z.string(),
  summary: z.string().min(1).max(280),
  filters: z.array(Filter).min(1).max(10),
});
const AggregateArgs = z.object({
  table_name: z.string(),
  op: z.enum(["count", "sum", "avg", "min", "max"]),
  column: z.string().optional(),
  filters: z.array(Filter).max(10).optional(),
  group_by: z.string().optional(),
  limit: z.number().int().positive().max(50).optional(),
});
const ListIndexesArgs = z.object({ table_name: z.string() });
const AuditSummaryArgs = z.object({
  table_name: z.string().optional(),
  hours: z.number().int().positive().max(720).optional(),
  limit: z.number().int().positive().max(50).optional(),
});

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface ToolContext {
  conn: ConnectionRow;
  schema: Schema;
  analyses: TableAnalysis[];
  /** The signed-in user's id. Required for tools that read audit_log. */
  userId: string;
}

export interface ToolResult {
  /** Compact stringified payload returned to the model as the tool message. */
  payload: string;
  /** Lighter object used for the UI transcript. */
  display: unknown;
}

export async function executeTool(
  name: string,
  rawArgs: string | undefined,
  ctx: ToolContext,
): Promise<ToolResult> {
  let parsed: unknown = {};
  if (rawArgs && rawArgs.trim() !== "") {
    try {
      parsed = JSON.parse(rawArgs);
    } catch {
      return error(`Tool args were not valid JSON.`);
    }
  }

  try {
    switch (name) {
      case "list_tables":
        return listTables(ListTablesArgs.parse(parsed), ctx);
      case "get_table_schema":
        return getTableSchema(GetSchemaArgs.parse(parsed), ctx);
      case "query_rows":
        return await queryRows(QueryRowsArgs.parse(parsed), ctx);
      case "count_rows":
        return await countRows(CountRowsArgs.parse(parsed), ctx);
      case "propose_update":
        return await proposeUpdate(ProposeUpdateArgs.parse(parsed), ctx);
      case "propose_insert":
        return proposeInsert(ProposeInsertArgs.parse(parsed), ctx);
      case "propose_delete":
        return await proposeDelete(ProposeDeleteArgs.parse(parsed), ctx);
      case "aggregate":
        return await aggregate(AggregateArgs.parse(parsed), ctx);
      case "list_indexes":
        return await listIndexes(ListIndexesArgs.parse(parsed), ctx);
      case "audit_summary":
        return await auditSummary(AuditSummaryArgs.parse(parsed), ctx);
      default:
        return error(`Unknown tool: ${name}.`);
    }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return error(`Invalid arguments: ${e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
    if (e instanceof PgRestServerError) {
      return error(`PostgREST ${e.status}: ${e.message}`);
    }
    return error((e as Error).message ?? "Tool failed.");
  }
}

function error(message: string): ToolResult {
  const body = { error: message };
  return { payload: JSON.stringify(body), display: body };
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

function findTable(ctx: ToolContext, name: string): Table | null {
  const lc = name.toLowerCase();
  return (
    ctx.schema.tables.find((t) => t.name === name) ??
    ctx.schema.tables.find((t) => t.name.toLowerCase() === lc) ??
    null
  );
}

function listTables(args: z.infer<typeof ListTablesArgs>, ctx: ToolContext): ToolResult {
  const wanted = (args.category ?? "all").toLowerCase();
  const out = ctx.schema.tables
    .map((t) => {
      const a = ctx.analyses.find(
        (x) => x.schema === t.schema && x.name === t.name,
      );
      return {
        name: t.name,
        schema: t.schema,
        kind: t.kind,
        rows: undefined as number | undefined, // not fetched here: cheap call
        category: a?.category ?? "generic",
        displayName: a?.displayName ?? t.name,
        notes: a?.notes ?? "",
        columnCount: t.columns.length,
        primaryKey: t.primaryKey,
      };
    })
    .filter((t) => (wanted === "all" ? true : t.category === wanted));
  return {
    payload: JSON.stringify({ tables: out }),
    display: { count: out.length, category: wanted, tables: out.map((t) => t.name) },
  };
}

function getTableSchema(
  args: z.infer<typeof GetSchemaArgs>,
  ctx: ToolContext,
): ToolResult {
  const table = findTable(ctx, args.table_name);
  if (!table) return error(`Table "${args.table_name}" does not exist.`);

  const a = ctx.analyses.find((x) => x.schema === table.schema && x.name === table.name);
  const cols = table.columns.map((c) => ({
    name: c.name,
    type: c.pgType,
    category: c.category,
    nullable: c.nullable,
    pk: c.isPrimaryKey,
    fk: c.fk ? `${c.fk.schema}.${c.fk.table}.${c.fk.column}` : undefined,
    enumValues: c.enumValues,
  }));
  return {
    payload: JSON.stringify({
      table: table.name,
      kind: table.kind,
      primaryKey: table.primaryKey,
      columns: cols,
      analysis: a ? { displayName: a.displayName, category: a.category, notes: a.notes } : null,
    }),
    display: { table: table.name, columns: cols.map((c) => c.name) },
  };
}

const ALLOWED_OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in"]);

function encodeValue(op: string, value: unknown): string {
  if (op === "in") {
    const arr = Array.isArray(value) ? value : [value];
    return `(${arr.map((v) => encodeURIComponent(String(v))).join(",")})`;
  }
  if (op === "is") {
    // Accepts true/false/null.
    if (value === null) return "null";
    return String(value);
  }
  return String(value);
}

function buildFilterParam(filter: z.infer<typeof Filter>, table: Table): { ok: true; key: string; val: string } | { ok: false; error: string } {
  if (!table.columns.find((c) => c.name === filter.column)) {
    return { ok: false, error: `Column "${filter.column}" does not exist on "${table.name}".` };
  }
  if (!ALLOWED_OPS.has(filter.op)) {
    return { ok: false, error: `Unsupported operator "${filter.op}".` };
  }
  return { ok: true, key: filter.column, val: `${filter.op}.${encodeValue(filter.op, filter.value)}` };
}

async function queryRows(
  args: z.infer<typeof QueryRowsArgs>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const table = findTable(ctx, args.table_name);
  if (!table) return error(`Table "${args.table_name}" does not exist.`);

  const q = new URLSearchParams();
  if (args.columns && args.columns.length > 0) {
    const valid = args.columns.filter((c) => table.columns.find((tc) => tc.name === c));
    if (valid.length === 0) return error(`None of the requested columns exist on "${table.name}".`);
    q.set("select", valid.join(","));
  } else {
    q.set("select", "*");
  }
  if (args.sort) {
    const dir = args.sort.direction ?? "asc";
    if (!table.columns.find((c) => c.name === args.sort!.column)) {
      return error(`Sort column "${args.sort.column}" does not exist on "${table.name}".`);
    }
    q.set("order", `${args.sort.column}.${dir}`);
  }
  if (args.filters) {
    for (const f of args.filters) {
      const built = buildFilterParam(f, table);
      if (!built.ok) return error(built.error);
      q.append(built.key, built.val);
    }
  }
  const limit = Math.min(args.limit ?? 25, MAX_ROWS_PER_QUERY);
  const range = `0-${limit - 1}`;

  const res = await pgrestServerGet<unknown[]>({
    conn: ctx.conn,
    path: encodeURIComponent(table.name),
    query: q,
    range,
    prefer: "count=estimated",
  });

  const rows = Array.isArray(res.data) ? res.data : [];
  return {
    payload: JSON.stringify({
      table: table.name,
      returned: rows.length,
      estimatedTotal: res.totalCount,
      note: "Rows were displayed locally and were not sent to the language model.",
    }),
    display: {
      table: table.name,
      returned: rows.length,
      estimatedTotal: res.totalCount,
      filters: args.filters ?? [],
      columns: args.columns ?? null,
      limit,
      rows,
    },
  };
}

async function countRows(
  args: z.infer<typeof CountRowsArgs>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const table = findTable(ctx, args.table_name);
  if (!table) return error(`Table "${args.table_name}" does not exist.`);

  const q = new URLSearchParams();
  q.set("select", table.primaryKey[0] ?? "*");
  if (args.filters) {
    for (const f of args.filters) {
      const built = buildFilterParam(f, table);
      if (!built.ok) return error(built.error);
      q.append(built.key, built.val);
    }
  }

  const res = await pgrestServerGet<unknown[]>({
    conn: ctx.conn,
    path: encodeURIComponent(table.name),
    query: q,
    range: "0-0",
    prefer: "count=exact",
  });
  return {
    payload: JSON.stringify({ table: table.name, count: res.totalCount ?? null }),
    display: { table: table.name, count: res.totalCount ?? null, filters: args.filters ?? [] },
  };
}

// ---------------------------------------------------------------------------
// Write proposals: never execute on the server, only build a payload that
// the user can confirm in the chat UI. The execute endpoint then applies it.
// ---------------------------------------------------------------------------

const MAX_PREVIEW_ROWS = 5;

async function fetchAffectedPreview(
  table: Table,
  filters: z.infer<typeof Filter>[],
  ctx: ToolContext,
): Promise<{ preview: unknown[]; totalCount: number | null }> {
  const q = new URLSearchParams();
  q.set("select", "*");
  for (const f of filters) {
    const built = buildFilterParam(f, table);
    if (!built.ok) throw new Error(built.error);
    q.append(built.key, built.val);
  }
  const res = await pgrestServerGet<unknown[]>({
    conn: ctx.conn,
    path: encodeURIComponent(table.name),
    query: q,
    range: `0-${MAX_PREVIEW_ROWS - 1}`,
    prefer: "count=exact",
  });
  return {
    preview: Array.isArray(res.data) ? res.data : [],
    totalCount: res.totalCount,
  };
}

function validatePatchColumns(table: Table, patch: Record<string, unknown>): string | null {
  for (const col of Object.keys(patch)) {
    const tc = table.columns.find((c) => c.name === col);
    if (!tc) return `Column "${col}" does not exist on "${table.name}".`;
    if (tc.isGenerated) return `Column "${col}" is generated and cannot be set.`;
    if (tc.isPrimaryKey)
      return `Column "${col}" is a primary key: refusing to change it via the chat assistant.`;
  }
  return null;
}

async function proposeUpdate(
  args: z.infer<typeof ProposeUpdateArgs>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const table = findTable(ctx, args.table_name);
  if (!table) return error(`Table "${args.table_name}" does not exist.`);
  if (table.kind === "view") return error(`"${table.name}" is a view: cannot update.`);
  if (table.primaryKey.length === 0)
    return error(`"${table.name}" has no primary key: refusing to issue writes.`);

  const colErr = validatePatchColumns(table, args.patch);
  if (colErr) return error(colErr);

  try {
    const { preview, totalCount } = await fetchAffectedPreview(table, args.filters, ctx);
    const proposal = {
      kind: "proposed_update" as const,
      table: table.name,
      schema: table.schema,
      summary: args.summary,
      filters: args.filters,
      patch: args.patch,
      preview,
      totalCount,
    };
    return {
      payload: JSON.stringify({
        ...proposal,
        preview: undefined,
        previewDisplayedLocally: true,
      }),
      display: proposal,
    };
  } catch (e) {
    return error((e as Error).message ?? "Could not preview update.");
  }
}

function proposeInsert(
  args: z.infer<typeof ProposeInsertArgs>,
  ctx: ToolContext,
): ToolResult {
  const table = findTable(ctx, args.table_name);
  if (!table) return error(`Table "${args.table_name}" does not exist.`);
  if (table.kind === "view") return error(`"${table.name}" is a view: cannot insert.`);

  for (const col of Object.keys(args.values)) {
    const tc = table.columns.find((c) => c.name === col);
    if (!tc) return error(`Column "${col}" does not exist on "${table.name}".`);
    if (tc.isGenerated) return error(`Column "${col}" is generated and cannot be set.`);
  }
  const proposal = {
    kind: "proposed_insert" as const,
    table: table.name,
    schema: table.schema,
    summary: args.summary,
    values: args.values,
  };
  return { payload: JSON.stringify(proposal), display: proposal };
}

async function proposeDelete(
  args: z.infer<typeof ProposeDeleteArgs>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const table = findTable(ctx, args.table_name);
  if (!table) return error(`Table "${args.table_name}" does not exist.`);
  if (table.kind === "view") return error(`"${table.name}" is a view: cannot delete.`);
  if (table.primaryKey.length === 0)
    return error(`"${table.name}" has no primary key: refusing to issue writes.`);

  try {
    const { preview, totalCount } = await fetchAffectedPreview(table, args.filters, ctx);
    const proposal = {
      kind: "proposed_delete" as const,
      table: table.name,
      schema: table.schema,
      summary: args.summary,
      filters: args.filters,
      preview,
      totalCount,
    };
    return {
      payload: JSON.stringify({
        ...proposal,
        preview: undefined,
        previewDisplayedLocally: true,
      }),
      display: proposal,
    };
  } catch (e) {
    return error((e as Error).message ?? "Could not preview delete.");
  }
}

// ---------------------------------------------------------------------------
// Aggregate (count / sum / avg / min / max via PostgREST)
// ---------------------------------------------------------------------------

async function aggregate(
  args: z.infer<typeof AggregateArgs>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const table = findTable(ctx, args.table_name);
  if (!table) return error(`Table "${args.table_name}" does not exist.`);

  // Validate column (when required by the op)
  if (args.op !== "count") {
    if (!args.column) return error(`Op ${args.op} requires a "column" argument.`);
    const col = table.columns.find((c) => c.name === args.column);
    if (!col) return error(`Column "${args.column}" does not exist on "${table.name}".`);
    if (!["integer", "float"].includes(col.category)) {
      return error(`Column "${args.column}" is ${col.category}, not numeric.`);
    }
  }
  if (args.group_by) {
    if (!table.columns.find((c) => c.name === args.group_by)) {
      return error(`Group-by column "${args.group_by}" does not exist on "${table.name}".`);
    }
  }

  const q = new URLSearchParams();
  // PostgREST aggregate syntax: `select=col.op()` (since v12).
  const aggExpr =
    args.op === "count"
      ? "count"
      : `${args.column}.${args.op}()`;
  if (args.group_by) {
    q.set("select", `${args.group_by},${aggExpr}`);
    q.set("order", `${aggExpr}.desc`);
    q.set("limit", String(Math.min(args.limit ?? 25, 50)));
  } else {
    q.set("select", aggExpr);
    q.set("limit", "1");
  }
  if (args.filters) {
    for (const f of args.filters) {
      const built = buildFilterParam(f, table);
      if (!built.ok) return error(built.error);
      q.append(built.key, built.val);
    }
  }

  try {
    const res = await pgrestServerGet<unknown[]>({
      conn: ctx.conn,
      path: encodeURIComponent(table.name),
      query: q,
    });
    const rows = Array.isArray(res.data) ? res.data : [];
    if (args.group_by) {
      return {
        payload: JSON.stringify({
          table: table.name,
          op: args.op,
          group_by: args.group_by,
          groups: rows,
        }),
        display: {
          table: table.name,
          op: args.op,
          group_by: args.group_by,
          returned: rows.length,
        },
      };
    }
    const single = (rows[0] as Record<string, unknown> | undefined) ?? {};
    const valueKey =
      args.op === "count"
        ? "count"
        : `${args.column}`;
    return {
      payload: JSON.stringify({
        table: table.name,
        op: args.op,
        column: args.column ?? null,
        value: single[valueKey] ?? Object.values(single)[0] ?? null,
      }),
      display: {
        table: table.name,
        op: args.op,
        value: single[valueKey] ?? Object.values(single)[0] ?? null,
      },
    };
  } catch (e) {
    if (e instanceof PgRestServerError) {
      return error(`PostgREST ${e.status}: ${e.message}`);
    }
    return error((e as Error).message ?? "Aggregate failed.");
  }
}

// ---------------------------------------------------------------------------
// list_indexes (reads pg_indexes via direct Postgres, needs postgres_url)
// ---------------------------------------------------------------------------

async function listIndexes(
  args: z.infer<typeof ListIndexesArgs>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const table = findTable(ctx, args.table_name);
  if (!table) return error(`Table "${args.table_name}" does not exist.`);

  if (!ctx.conn.encryptedPostgresUrl) {
    return error(
      "Direct Postgres URL not configured on this connection. Open the RLS page and paste a connection string to enable list_indexes.",
    );
  }

  // Import inline to keep the cold path lazy.
  const { default: postgres } = await import("postgres");
  const { decryptKey } = await import("@/server/crypto/vault");
  const { assertSafePostgresConnectionString } = await import("@/server/security/egress");
  const url = await assertSafePostgresConnectionString(
    decryptKey(ctx.conn.encryptedPostgresUrl),
  );
  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 8, prepare: false });
  try {
    const rows = await sql<
      Array<{
        indexname: string;
        indexdef: string;
        is_unique: boolean;
        is_primary: boolean;
        columns: string;
      }>
    >`
      SELECT
        i.indexname,
        i.indexdef,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary,
        pg_get_indexdef(ix.indexrelid, 0, true) AS columns
      FROM pg_indexes i
      JOIN pg_class c   ON c.relname  = i.indexname
      JOIN pg_index ix  ON ix.indexrelid = c.oid
      WHERE i.schemaname = 'public' AND i.tablename = ${args.table_name}
      ORDER BY ix.indisprimary DESC, ix.indisunique DESC, i.indexname
    `;
    return {
      payload: JSON.stringify({
        table: args.table_name,
        indexes: rows.map((r) => ({
          name: r.indexname,
          unique: !!r.is_unique,
          primary: !!r.is_primary,
          definition: r.indexdef,
        })),
      }),
      display: {
        table: args.table_name,
        count: rows.length,
        names: rows.map((r) => r.indexname),
      },
    };
  } catch (e) {
    return error((e as Error).message ?? "list_indexes failed.");
  } finally {
    await sql.end({ timeout: 2 });
  }
}

// ---------------------------------------------------------------------------
// audit_summary (reads our own audit_log)
// ---------------------------------------------------------------------------

async function auditSummary(
  args: z.infer<typeof AuditSummaryArgs>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { db } = await import("@/server/db");
  const { auditLog } = await import("@/server/schema/audit");
  const { and, desc, eq, gte, sql } = await import("drizzle-orm");

  const hours = args.hours ?? 24;
  const limit = Math.min(args.limit ?? 20, 50);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const conditions = [
    eq(auditLog.connectionId, ctx.conn.id),
    gte(auditLog.createdAt, since),
  ];
  if (args.table_name) {
    conditions.push(eq(auditLog.tableName, args.table_name));
  }

  // Drizzle-style: use `and(...conditions)`
  const rows = await db
    .select({
      id: auditLog.id,
      tableName: auditLog.tableName,
      verb: auditLog.verb,
      primaryKey: auditLog.primaryKey,
      httpStatus: auditLog.httpStatus,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  // Tally per-table per-verb for the model's summary.
  const tally = new Map<string, { inserts: number; updates: number; deletes: number }>();
  for (const r of rows) {
    const key = r.tableName;
    const t = tally.get(key) ?? { inserts: 0, updates: 0, deletes: 0 };
    if (r.verb === "insert") t.inserts++;
    else if (r.verb === "update") t.updates++;
    else if (r.verb === "delete") t.deletes++;
    tally.set(key, t);
  }
  const summary = Array.from(tally.entries()).map(([table, c]) => ({ table, ...c }));

  // Touch `sql` to satisfy the importer's tree-shake without using it.
  void sql;

  return {
    payload: JSON.stringify({
      window_hours: hours,
      total: rows.length,
      summary,
      entries: rows.map((r) => ({
        verb: r.verb,
        table: r.tableName,
        pk: r.primaryKey,
        at: r.createdAt.toISOString(),
        status: r.httpStatus,
      })),
    }),
    display: {
      window_hours: hours,
      total: rows.length,
      by_table: summary.length,
    },
  };
}
