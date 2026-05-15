import "server-only";
import { z } from "zod";
import type { Schema, Table } from "@/lib/types/schema";
import { OpenRouterError } from "./openrouter";
import { validateWebhookUrl } from "@/server/actions/repo";
import { AppError } from "@/lib/errors";
import { redact } from "@/lib/redact";

/**
 * Custom-action generator. Takes the user's natural-language
 * description plus the introspected schema and returns a strictly-
 * typed action config matching the existing `ActionInput` contract.
 * The caller is expected to validate further (placeholder counts,
 * webhook URL safety) before persisting.
 */

const ENDPOINT = "https://openrouter.ai/api/v1";
const MAX_TIMEOUT_MS = 30_000;

const ActionParamSchema = z.object({
  name: z.string().min(1).max(40),
  label: z.string().min(1).max(60),
  type: z.enum(["string", "number", "boolean", "json"]),
  required: z.boolean(),
  placeholder: z.string().max(120).optional(),
});

const ActionGenSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z][a-z0-9_-]{0,39}$/),
    label: z.string().min(1).max(60),
    description: z.string().max(200).optional().nullable(),
    scope: z.enum(["global", "table", "row"]),
    tableSchema: z.string().max(120).optional().nullable(),
    tableName: z.string().max(120).optional().nullable(),
    kind: z.enum(["sql", "webhook"]),
    sqlTemplate: z.string().max(8000).optional().nullable(),
    readOnly: z.boolean().default(false),
    webhookUrl: z.string().max(500).optional().nullable(),
    webhookMethod: z.enum(["POST", "PATCH", "PUT", "DELETE"]).optional().nullable(),
    params: z.array(ActionParamSchema).max(8).default([]),
    danger: z.boolean().default(false),
  })
  .strict();

export type GeneratedAction = z.infer<typeof ActionGenSchema>;

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": process.env.AUTH_URL ?? "http://localhost:3000",
    "X-Title": "Suparbase",
    "Content-Type": "application/json",
  };
}

function buildSchemaContext(
  schema: Schema,
  focusTable?: { schemaName: string; tableName: string } | null,
): string {
  // Surface the focus table first (and in full), then a compact list
  // of every other public table so the model has lateral context for
  // FKs without spending all the tokens on column lists.
  const userTables = schema.tables.filter(
    (t) =>
      t.kind === "table" &&
      t.schema !== "auth" &&
      t.schema !== "storage" &&
      t.schema !== "pg_catalog" &&
      !t.name.startsWith("_"),
  );

  const focus =
    focusTable &&
    userTables.find(
      (t) => t.schema === focusTable.schemaName && t.name === focusTable.tableName,
    );

  const lines: string[] = [];
  if (focus) {
    lines.push("-- focus table (the action runs against this one):");
    lines.push(tableSignature(focus));
    lines.push("");
    lines.push("-- other tables (names + primary keys only):");
    for (const t of userTables) {
      if (t === focus) continue;
      const pks = t.primaryKey.length > 0 ? ` (pk: ${t.primaryKey.join(", ")})` : "";
      lines.push(`${t.schema}.${t.name}${pks}`);
    }
  } else {
    for (const t of userTables.slice(0, 60)) {
      lines.push(tableSignature(t));
    }
    if (userTables.length > 60) {
      lines.push(`-- and ${userTables.length - 60} more tables not shown`);
    }
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

const SYSTEM_PROMPT = `You generate custom-action configurations for Suparbase. A custom action is a button that runs business logic against a Supabase project: either a parametrised SQL statement, or an HTTP webhook.

Your output MUST be a strict JSON object matching this shape:
{
  "name": string (slug: lowercase letters / digits / hyphens / underscores; starts with a letter; max 40 chars; used in URLs + audit logs),
  "label": string (1-60 chars; human-readable button text),
  "description": string | null (optional, up to 200 chars; one short sentence),
  "scope": "global" | "table" | "row",
  "tableSchema": string | null (required when scope ≠ "global"),
  "tableName": string | null (required when scope ≠ "global"),
  "kind": "sql" | "webhook",
  "sqlTemplate": string | null (required when kind === "sql"; max 8000 chars; uses $1..$N placeholders),
  "readOnly": boolean (only for kind === "sql"; default false; set true ONLY if the SQL is a SELECT-only diagnostic),
  "webhookUrl": string | null (required when kind === "webhook"; must be https:// or http:// public host),
  "webhookMethod": "POST" | "PATCH" | "PUT" | "DELETE" | null (default POST),
  "params": Array<{ name, label, type: "string"|"number"|"boolean"|"json", required, placeholder? }> (max 8),
  "danger": boolean (true for DELETE / refund / cancel / mark-cancelled / anything irreversible)
}

Rules for SQL kind:
- Use $1..$N positional placeholders. NEVER concatenate values into the SQL string.
- For scope "row", $1 is the row's primary key payload (a jsonb object with the PK columns). Reference it like ($1->>'id')::uuid or similar; the user's params are $2, $3, ... after that.
- For scope "table" and "global", the user's params are $1, $2, .... There is no implicit row PK.
- Param names match the placeholders in declaration order: the first declared param maps to the next $N after the row PK (if any), etc.
- ALWAYS include a WHERE clause when scope === "row" so the action only touches the targeted row.
- Use only tables and columns present in the schema. NEVER invent column names.
- "readOnly" should be true only for SELECT/WITH diagnostic actions. INSERT/UPDATE/DELETE actions must set readOnly to false.

Rules for webhook kind:
- "webhookUrl" must be a real public URL (https://api.example.com/...). NEVER use private networks (127.*, 10.*, 192.168.*, 169.254.*, ::1, etc.) or cloud-metadata hostnames (metadata.google.internal, 169.254.169.254).
- Default method to POST unless the user specifies otherwise.

Cross-cutting:
- "name" is a slug; "label" is human text. Don't put spaces or capitals in name.
- Set danger=true for any irreversible operation (DELETE, refund, ban, cancel, archive that hides data, etc.).
- Keep params to the minimum needed; an action with zero params is fine.
- Param 'name' is also a slug (matches the SQL $N or the JSON body key in webhooks).

Return ONLY the JSON object. No markdown fences, no commentary.`;

export interface GenerateActionInput {
  apiKey: string;
  model: string;
  prompt: string;
  schema: Schema;
  /** Optional context the UI can pass when the user is on a specific
   *  table (or invoking from a row-detail page). When set, the model
   *  is encouraged to pick the matching scope + tables. */
  focusTable?: { schemaName: string; tableName: string } | null;
  defaultScope?: "global" | "table" | "row";
  defaultKind?: "sql" | "webhook";
}

export async function generateAction(input: GenerateActionInput): Promise<GeneratedAction> {
  const schemaCtx = buildSchemaContext(input.schema, input.focusTable);
  const contextHints: string[] = [];
  if (input.focusTable) {
    contextHints.push(
      `User is creating this action while viewing ${input.focusTable.schemaName}.${input.focusTable.tableName}. Prefer scope "row" or "table" with that table unless the request explicitly says otherwise.`,
    );
  }
  if (input.defaultScope) {
    contextHints.push(`Caller asked for scope "${input.defaultScope}". Use it unless the request clearly contradicts.`);
  }
  if (input.defaultKind) {
    contextHints.push(`Caller asked for kind "${input.defaultKind}". Use it unless the request clearly contradicts.`);
  }
  const userPrompt =
    `Schema:\n\`\`\`\n${schemaCtx}\n\`\`\`\n\n` +
    (contextHints.length > 0 ? `Context:\n- ${contextHints.join("\n- ")}\n\n` : "") +
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

  // Strip code-fence wrapping inside SQL strings if the model leaks it.
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.sqlTemplate === "string") {
      obj.sqlTemplate = obj.sqlTemplate
        .replace(/^```sql\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
    }
  }

  const validated = ActionGenSchema.safeParse(parsed);
  if (!validated.success) {
    throw new OpenRouterError(
      "malformed",
      `Model output failed validation: ${validated.error.issues[0]?.message ?? "unknown reason"}`,
    );
  }
  return validated.data;
}

// ---------------------------------------------------------------------------
// Structural validators run after generation. These are the "safety pass"
// equivalent to the read-only SQL execution the widget generator does —
// here we can't safely execute arbitrary writes/webhooks, so we lean
// on structural checks instead.
// ---------------------------------------------------------------------------

const PLACEHOLDER_RX = /\$(\d+)/g;

/**
 * Validate the relationship between sqlTemplate's $N placeholders and
 * the declared params, accounting for the row-scope convention where
 * $1 is the implicit primary key.
 *
 * Throws AppError("validation", ...) when something doesn't match.
 */
export function validateSqlPlaceholders(action: GeneratedAction): void {
  if (action.kind !== "sql") return;
  if (!action.sqlTemplate) return;
  const seen = new Set<number>();
  let m: RegExpExecArray | null;
  PLACEHOLDER_RX.lastIndex = 0;
  while ((m = PLACEHOLDER_RX.exec(action.sqlTemplate)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) seen.add(n);
  }
  const rowImplicit = action.scope === "row" ? 1 : 0;
  const expected = action.params.length + rowImplicit;
  // Allow the SQL to skip placeholders (e.g. doesn't reference $1 PK),
  // but never reference one beyond what's declared. Common failure
  // mode: the model writes a SQL that references $1 but didn't bind
  // it (e.g. scope "table" with no params).
  const maxSeen = seen.size > 0 ? Math.max(...seen) : 0;
  if (maxSeen > expected) {
    throw new AppError(
      "validation",
      `Generated SQL references $${maxSeen} but the action only has ${action.params.length} param${action.params.length === 1 ? "" : "s"}${rowImplicit ? " (plus the implicit row PK at $1)" : ""}. Ask the AI to rephrase or edit the SQL by hand.`,
    );
  }
}

/**
 * Confirm a generated webhook URL is safe to fire from the server (no
 * private nets, no cloud-metadata). Reuses the same validator the save
 * path uses.
 */
export function validateGeneratedWebhook(action: GeneratedAction): void {
  if (action.kind !== "webhook") return;
  if (!action.webhookUrl) {
    throw new AppError("validation", "Generated webhook action has no URL.");
  }
  validateWebhookUrl(action.webhookUrl);
}

/**
 * Verify scope + table fields agree. Throws if scope is "row" or
 * "table" with no tableName.
 */
export function validateScopeShape(action: GeneratedAction): void {
  if (action.scope !== "global" && !action.tableName) {
    throw new AppError(
      "validation",
      `Generated action has scope "${action.scope}" but no tableName. Ask the AI which table this should target.`,
    );
  }
}
