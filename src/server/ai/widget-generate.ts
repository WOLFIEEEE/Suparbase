import "server-only";
import { z } from "zod";
import type { Schema, Table } from "@/lib/types/schema";
import { OpenRouterError } from "./openrouter";
import { redact } from "@/lib/redact";

/**
 * Dashboard-widget generator. Takes the user's natural-language
 * description plus the introspected schema, asks OpenRouter to
 * return a strictly-typed widget config, validates it with Zod, and
 * returns it. The caller is expected to then re-run the generated
 * SQL read-only as a safety pass - never trust the model's SQL
 * without executing it against the actual database.
 */

const ENDPOINT = "https://openrouter.ai/api/v1";
const MAX_TIMEOUT_MS = 30_000;

const WidgetGenSchema = z
  .object({
    type: z.enum(["kpi", "bar", "line", "list"]),
    title: z.string().min(1).max(60),
    description: z.string().max(200).optional().nullable(),
    sql: z.string().min(1).max(4000),
    visConfig: z
      .object({
        valueColumn: z.string().max(60).optional(),
        format: z.enum(["number", "currency", "percent"]).optional(),
        unit: z.string().max(20).optional(),
        prefix: z.string().max(20).optional(),
        labelColumn: z.string().max(60).optional(),
        columns: z.array(z.string().max(60)).max(20).optional(),
      })
      .default({}),
  })
  .strict();

export type GeneratedWidget = z.infer<typeof WidgetGenSchema>;

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": process.env.AUTH_URL ?? "http://localhost:3000",
    "X-Title": "Suparbase",
    "Content-Type": "application/json",
  };
}

/**
 * Build a compact representation of the project's schema. Just the
 * tables + their columns + types. Hides system schemas so the model
 * doesn't waste tokens on `auth.*` or `storage.*`.
 */
function buildSchemaContext(schema: Schema): string {
  const userTables = schema.tables.filter(
    (t) =>
      t.kind === "table" &&
      t.schema !== "auth" &&
      t.schema !== "storage" &&
      t.schema !== "pg_catalog" &&
      !t.name.startsWith("_"),
  );
  const lines: string[] = [];
  for (const t of userTables.slice(0, 80)) {
    lines.push(tableSignature(t));
  }
  if (userTables.length > 80) {
    lines.push(`-- and ${userTables.length - 80} more tables not shown`);
  }
  return lines.join("\n");
}

function tableSignature(t: Table): string {
  const cols = t.columns
    .map((c) => {
      const flags: string[] = [];
      if (c.isPrimaryKey) flags.push("PK");
      if (!c.nullable) flags.push("not null");
      const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
      return `  ${c.name} ${c.pgType}${flagStr}`;
    })
    .join("\n");
  return `${t.schema}.${t.name} (\n${cols}\n)`;
}

const SYSTEM_PROMPT = `You generate dashboard widgets for Suparbase, an admin tool that runs on top of a user's Supabase Postgres database.

Your output MUST be a strict JSON object matching this shape:
{
  "type": "kpi" | "bar" | "line" | "list",
  "title": string (1-60 chars; short and human-readable),
  "description": string | null (optional, up to 200 chars; one short sentence),
  "sql": string (a SELECT statement; max 4000 chars),
  "visConfig": {
    // kpi: { valueColumn, format?, unit?, prefix? }
    // bar / line: { labelColumn, valueColumn }
    // list: { columns?: string[] }
  }
}

Rules:
- The SQL MUST be a SELECT (or WITH ... SELECT). NEVER INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, TRUNCATE, GRANT, REVOKE, SET, or any DDL/DML. The query runs inside a read-only transaction; a write will fail. Pick the simplest read that answers the user's request.
- The SQL is executed WITHOUT bind values. NEVER use $1, $2, or any other $N parameter placeholders. If the user implies a filter ("last 30 days", "this week"), bake the value into the SQL using NOW(), CURRENT_DATE, INTERVAL literals, or specific numeric literals. A query that references $1 produces "syntax error at or near $1" and fails the user. This rule is non-negotiable.
- Use only tables and columns that appear in the provided schema. NEVER invent column names. If the schema doesn't contain something the user asked for, pick the closest available column and explain via the description. If no reasonable approximation exists, return a small descriptive query (e.g. SELECT 'no matching data' AS note) and explain in the description.
- For "kpi" widgets: return a single row with one or two numeric columns named "value" and optionally "previous". visConfig.valueColumn defaults to "value".
- For "bar" or "line" widgets: return 2 columns (label, value). visConfig.labelColumn and visConfig.valueColumn name them. For "line" widgets, the labelColumn should usually be a date / timestamp aggregated by day/week/month using date_trunc(); ORDER BY the labelColumn ASC.
- For "list" widgets: return up to ~10 rows with the columns named in visConfig.columns. ORDER BY a sensible column (usually a timestamp DESC).
- Always include a LIMIT clause matching the widget type: kpi = 1, bar/list = 10-20, line = 30-90 buckets.
- The title is short ("Weekly signups", "Top 10 customers"), not a sentence.
- Use lowercase keyword style for SQL ("select", "from", "where").

Return ONLY the JSON object. No markdown fences, no commentary.`;

export interface GenerateWidgetInput {
  apiKey: string;
  model: string;
  /** Plain-English description of what the user wants. */
  prompt: string;
  /** Introspected schema for the connection. */
  schema: Schema;
}

export async function generateWidget(input: GenerateWidgetInput): Promise<GeneratedWidget> {
  const schemaCtx = buildSchemaContext(input.schema);
  const userPrompt =
    `Schema available:\n` +
    `\`\`\`\n${schemaCtx}\n\`\`\`\n\n` +
    `User request: ${input.prompt.trim()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: authHeaders(input.apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
        temperature: 0,
        response_format: { type: "json_object" },
        max_tokens: 1500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    throw new OpenRouterError(
      "network",
      `Could not reach OpenRouter (${(e as Error).message ?? "unknown"}).`,
    );
  }
  clearTimeout(timer);

  if (res.status === 401 || res.status === 403) {
    throw new OpenRouterError("unauthorized", "OpenRouter rejected this key.");
  }
  if (res.status === 429) {
    throw new OpenRouterError("rate_limited", "OpenRouter rate-limited this request.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new OpenRouterError(
      "server",
      `OpenRouter ${res.status}: ${redact(detail.slice(0, 200))}`,
    );
  }

  interface ChatCompletionsResponse {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  }

  let payload: ChatCompletionsResponse;
  try {
    payload = (await res.json()) as ChatCompletionsResponse;
  } catch {
    throw new OpenRouterError("malformed", "OpenRouter returned non-JSON.");
  }
  if (payload.error) {
    throw new OpenRouterError("server", payload.error.message ?? "OpenRouter returned an error.");
  }

  const raw = payload.choices?.[0]?.message?.content;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new OpenRouterError("malformed", "OpenRouter response had no message content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OpenRouterError("malformed", "Model output was not valid JSON.");
  }

  // Defensive: some models wrap the SQL in code fences inside the JSON
  // value despite the system prompt. Strip them if present.
  if (parsed && typeof parsed === "object" && "sql" in (parsed as Record<string, unknown>)) {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.sql === "string") {
      obj.sql = obj.sql
        .replace(/^```sql\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
    }
  }

  const validated = WidgetGenSchema.safeParse(parsed);
  if (!validated.success) {
    throw new OpenRouterError(
      "malformed",
      `Model output failed validation: ${validated.error.issues[0]?.message ?? "unknown reason"}`,
    );
  }

  // Final hard safety check: refuse anything that isn't a SELECT/WITH.
  const sqlLower = validated.data.sql.trim().toLowerCase();
  if (!sqlLower.startsWith("select") && !sqlLower.startsWith("with")) {
    throw new OpenRouterError(
      "malformed",
      "Generated SQL must be a SELECT statement. Please rephrase.",
    );
  }

  // Widgets execute without bind values. Models occasionally leak the
  // actions-style `$1` parametrisation into widget SQL (the system
  // prompt forbids this; this is a belt-and-braces catch). Detect and
  // reject with a clear message before we send the query to Postgres,
  // which would otherwise return a generic "syntax error at or near
  // $1" that doesn't point at the real cause.
  if (/\$\d+/.test(validated.data.sql)) {
    throw new OpenRouterError(
      "malformed",
      "Generated SQL used $N placeholders; widgets run without bind values. Try rephrasing with the literal value baked in (e.g. 'last 30 days' instead of a placeholder).",
    );
  }

  return validated.data;
}
