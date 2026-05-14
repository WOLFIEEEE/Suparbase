import "server-only";
import { redact } from "@/lib/redact";
import { OpenRouterError } from "./openrouter";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "./tools";

/**
 * Server-side agent loop. The model is given the user's question plus a set of
 * read-only PostgREST tools. We iterate until the model returns a final
 * (assistant) message with no tool calls, or we hit the safety cap.
 *
 * Implemented as an async generator that streams events back to the API
 * route so the UI can render progress in real time (tool calls + final text
 * deltas), instead of waiting for a single blob response.
 */

const ENDPOINT = "https://openrouter.ai/api/v1";
const MAX_ITERATIONS = 6;
const MAX_TIMEOUT_MS = 60_000;
const MAX_HISTORY = 12;

export type ChatRole = "user" | "assistant";

export interface ChatMessageIn {
  role: ChatRole;
  content: string;
}

export type ChatEvent =
  | { type: "phase"; phase: "thinking" | "tool_running" | "answering" }
  | { type: "tool_start"; id: string; tool: string; args: unknown }
  | { type: "tool_end"; id: string; tool: string; result: unknown }
  | { type: "text"; delta: string }
  | {
      type: "done";
      model: string;
      usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    }
  | { type: "error"; category: string; message: string };

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface PageContext {
  /** Current page route, e.g. "/c/abc/tables/users/123". */
  pathname?: string;
  /** Name of the table currently being viewed, if any. */
  tableName?: string;
  /** Brief label of the current view: dashboard / tables / table / row / schema / storage / rls / sql / settings. */
  view?: string;
}

function contextHint(ctx?: PageContext): string {
  if (!ctx) return "";
  const parts: string[] = [];
  if (ctx.view) parts.push(`view: ${ctx.view}`);
  if (ctx.tableName) parts.push(`focused table: ${ctx.tableName}`);
  if (parts.length === 0) return "";
  return `\n\nCurrent page context: ${parts.join(", ")}. When the user says "this table" / "this row" / "here", they probably mean the focused thing above.`;
}

function systemPrompt(
  hostname: string,
  tableCount: number,
  page?: PageContext,
): string {
  return `You are Suparbase's data-aware assistant for project ${hostname}.

The user is an admin asking questions about their database (${tableCount} tables in public schema). You have these tools:

READ:
- list_tables(category?): table catalog with AI-inferred displayName, category, and notes. Always start here if you don't already know which table(s) are relevant.
- get_table_schema(table_name): full column list with types/PKs/FKs. Use this before constructing a query so you reference real column names.
- query_rows({table_name, columns?, filters?, sort?, limit≤50}): fetches up to 50 rows. Use narrow column lists and filters.
- count_rows({table_name, filters?}): aggregate count. Prefer over query_rows when you only need a total.
- aggregate({table_name, op, column?, filters?, group_by?, limit?}): sum/avg/min/max/count with optional grouping. Use for analytics ("avg order total", "count by status").
- list_indexes({table_name}): which indexes exist on a table. Use when the user asks about performance, missing indexes, or "why is this slow". (Requires the project's direct Postgres URL to be configured; tell the user politely if it's not.)
- audit_summary({table_name?, hours?, limit?}): recent write activity from the audit log (this user + this connection). Use for "what changed", "who edited X", "what happened today".

WRITE (proposal-only: you NEVER execute):
- propose_update({table_name, filters, patch, summary}): drafts an update. Returns a preview of up to 5 affected rows. The user clicks Apply in the UI to actually commit.
- propose_insert({table_name, values, summary}): drafts a new row. Same: user confirms.
- propose_delete({table_name, filters, summary}): drafts a delete. Returns affected-row preview.

Rules:
- NEVER fabricate columns, tables, or values. If a requested column doesn't exist, call get_table_schema first.
- For "how many X" questions, prefer count_rows over query_rows.
- For "show me / find / list" questions, use query_rows with a sensible limit (default 10).
- For "average / sum / max / by group" questions, use aggregate.
- For "what changed / who did / what happened" questions, use audit_summary before reading rows.
- When the user asks you to CHANGE / SET / UPDATE / ADD / DELETE rows, you MUST call the matching propose_* tool. Never claim a write was made: only the user's Apply click in the UI commits.
- Before proposing a write, call get_table_schema and (when filtering) query_rows so you know the values are real. Validate column names exist.
- When filtering on an enum, look at enumValues for the legal set.
- When the user references a person/item by name and the primary key is a uuid, search by the obvious label column (name/email/title/slug) with ilike '%term%'.
- Combine multiple filters with AND by passing them as separate entries in the filters array.
- If a tool returns an error, read it and try a corrected call rather than apologising.
- After a propose_* tool returns, your next message should be one short sentence telling the user a proposal is ready to review. Do not list the patch contents in prose: the UI shows it.
- For read questions, reply directly in plain English. Be concise. Quote numeric facts and column values exactly. Markdown is OK for code (\`\`\`sql blocks for SQL).
- If the question is unrelated to this database, say so briefly.${contextHint(page)}`;
}

interface RunArgs {
  apiKey: string;
  model: string;
  hostname: string;
  history: ChatMessageIn[];
  ctx: ToolContext;
  page?: PageContext;
  signal?: AbortSignal;
}

export async function* runChat(args: RunArgs): AsyncGenerator<ChatEvent, void, void> {
  if (args.history.length === 0) {
    yield { type: "error", category: "validation", message: "Empty chat history." };
    return;
  }
  const trimmed =
    args.history.length > MAX_HISTORY ? args.history.slice(-MAX_HISTORY) : args.history;

  const messages: OpenAIChatMessage[] = [
    { role: "system", content: systemPrompt(args.hostname, args.ctx.schema.tables.length, args.page) },
    ...trimmed.map((m) => ({ role: m.role, content: m.content })),
  ];

  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let modelReturned = args.model;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    yield { type: "phase", phase: "thinking" };

    let assistantText = "";
    const toolCalls = new Map<number, { id: string; name: string; argsBuf: string }>();
    let finishReason: string | null = null;

    try {
      for await (const chunk of streamOpenRouter({
        apiKey: args.apiKey,
        model: args.model,
        messages,
        signal: args.signal,
      })) {
        if (chunk.model) modelReturned = chunk.model;
        if (chunk.usage) {
          totalUsage = {
            promptTokens: totalUsage.promptTokens + chunk.usage.promptTokens,
            completionTokens: totalUsage.completionTokens + chunk.usage.completionTokens,
            totalTokens: totalUsage.totalTokens + chunk.usage.totalTokens,
          };
        }
        if (chunk.kind === "content_delta") {
          assistantText += chunk.delta;
          // Only stream text to the client when we know this is the final turn.
          // We don't know yet: buffer until we see finish_reason. (We emit
          // below once the stream completes.)
        } else if (chunk.kind === "tool_call_delta") {
          const entry = toolCalls.get(chunk.index) ?? { id: "", name: "", argsBuf: "" };
          if (chunk.id) entry.id = chunk.id;
          if (chunk.name) entry.name = chunk.name;
          if (chunk.argsDelta) entry.argsBuf += chunk.argsDelta;
          toolCalls.set(chunk.index, entry);
        } else if (chunk.kind === "finish") {
          finishReason = chunk.reason ?? null;
        }
      }
    } catch (e) {
      if (e instanceof OpenRouterError) {
        yield { type: "error", category: e.category, message: e.message };
      } else if ((e as Error).name === "AbortError") {
        return;
      } else {
        yield { type: "error", category: "server", message: (e as Error).message };
      }
      return;
    }

    if (toolCalls.size > 0) {
      // Persist the assistant turn (with tool_calls) so the model has context
      // on the next iteration.
      const calls = Array.from(toolCalls.entries())
        .sort(([a], [b]) => a - b)
        .map(([, c]) => ({
          id: c.id || `call_${Math.random().toString(36).slice(2)}`,
          type: "function" as const,
          function: { name: c.name, arguments: c.argsBuf || "{}" },
        }));
      messages.push({
        role: "assistant",
        content: assistantText || "",
        tool_calls: calls,
      });

      yield { type: "phase", phase: "tool_running" };
      for (const call of calls) {
        let parsedArgs: unknown = null;
        try {
          parsedArgs = JSON.parse(call.function.arguments || "{}");
        } catch {
          parsedArgs = { _raw: call.function.arguments };
        }
        yield {
          type: "tool_start",
          id: call.id,
          tool: call.function.name,
          args: parsedArgs,
        };
        const result = await executeTool(
          call.function.name,
          call.function.arguments,
          args.ctx,
        );
        yield {
          type: "tool_end",
          id: call.id,
          tool: call.function.name,
          result: result.display,
        };
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: result.payload,
        });
      }
      // Loop: model now needs to consume tool results.
      continue;
    }

    // Final answer turn: flush the buffered text to the client.
    yield { type: "phase", phase: "answering" };
    if (assistantText.length > 0) {
      // Re-emit in chunks so the UI shows a typewriter feel even though we
      // had to buffer to detect tool calls.
      const text = assistantText.trim();
      const step = Math.max(8, Math.ceil(text.length / 40));
      for (let i = 0; i < text.length; i += step) {
        yield { type: "text", delta: text.slice(i, i + step) };
      }
    } else if (finishReason === "length") {
      yield { type: "text", delta: "(response truncated by the model's token limit)" };
    } else {
      yield { type: "text", delta: "(no answer)" };
    }

    yield { type: "done", model: modelReturned, usage: totalUsage };
    return;
  }

  yield {
    type: "text",
    delta:
      "I couldn't reach a final answer within the tool-call budget. Try rephrasing or asking a narrower question.",
  };
  yield { type: "done", model: modelReturned, usage: totalUsage };
}

// ---------------------------------------------------------------------------
// OpenRouter streaming (OpenAI-compatible SSE)
// ---------------------------------------------------------------------------

type StreamChunk =
  | { kind: "content_delta"; delta: string; model?: string; usage?: ChunkUsage }
  | {
      kind: "tool_call_delta";
      index: number;
      id?: string;
      name?: string;
      argsDelta?: string;
      model?: string;
      usage?: ChunkUsage;
    }
  | { kind: "finish"; reason: string | null; model?: string; usage?: ChunkUsage };

interface ChunkUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface StreamArgs {
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  signal?: AbortSignal;
}

async function* streamOpenRouter(args: StreamArgs): AsyncGenerator<StreamChunk> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);
  if (args.signal) {
    args.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "HTTP-Referer": process.env.AUTH_URL ?? "http://localhost:3000",
        "X-Title": "Suparbase Chat",
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: args.model,
        temperature: 0,
        max_tokens: 800,
        stream: true,
        messages: args.messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    throw new OpenRouterError(
      "network",
      `Could not reach OpenRouter (${(e as Error).message ?? "unknown"}).`,
    );
  }

  if (res.status === 401 || res.status === 403) {
    clearTimeout(timer);
    throw new OpenRouterError("unauthorized", "OpenRouter rejected this key.");
  }
  if (res.status === 429) {
    clearTimeout(timer);
    throw new OpenRouterError("rate_limited", "OpenRouter rate-limited this request.");
  }
  if (!res.ok || !res.body) {
    clearTimeout(timer);
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

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by blank lines.
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const rawFrame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLines = rawFrame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim());
        if (dataLines.length === 0) continue;
        const data = dataLines.join("\n");
        if (data === "[DONE]") continue;

        let payload: unknown;
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }
        for (const out of translateChunk(payload)) yield out;
      }
    }
  } finally {
    clearTimeout(timer);
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

interface OpenAIStreamPayload {
  model?: string;
  choices?: Array<{
    index?: number;
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

function translateChunk(payload: unknown): StreamChunk[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as OpenAIStreamPayload;
  if (p.error) {
    throw new OpenRouterError("server", p.error.message ?? "OpenRouter returned an error.");
  }
  const out: StreamChunk[] = [];
  const usage = p.usage
    ? {
        promptTokens: p.usage.prompt_tokens ?? 0,
        completionTokens: p.usage.completion_tokens ?? 0,
        totalTokens: p.usage.total_tokens ?? 0,
      }
    : undefined;

  for (const choice of p.choices ?? []) {
    const delta = choice.delta ?? {};
    if (typeof delta.content === "string" && delta.content.length > 0) {
      out.push({ kind: "content_delta", delta: delta.content, model: p.model, usage });
    }
    for (const tc of delta.tool_calls ?? []) {
      out.push({
        kind: "tool_call_delta",
        index: tc.index,
        id: tc.id,
        name: tc.function?.name,
        argsDelta: tc.function?.arguments,
        model: p.model,
        usage,
      });
    }
    if (choice.finish_reason) {
      out.push({ kind: "finish", reason: choice.finish_reason, model: p.model, usage });
    }
  }
  // A chunk may carry usage with no choices at the end of a stream.
  if (out.length === 0 && usage) {
    out.push({ kind: "finish", reason: null, model: p.model, usage });
  }
  return out;
}
