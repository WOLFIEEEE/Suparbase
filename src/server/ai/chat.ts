import "server-only";
import { redact } from "@/lib/redact";
import { OpenRouterError } from "./openrouter";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "./tools";

/**
 * Server-side agent loop. The model is given the user's question and a set of
 * read-only PostgREST tools. We iterate until the model returns a final
 * (assistant) message with no tool calls, or we hit the safety cap.
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

export interface TranscriptStep {
  tool: string;
  args: unknown;
  result: unknown;
}

export interface ChatResult {
  answer: string;
  model: string;
  transcript: TranscriptStep[];
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

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

interface OpenAIChatResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: OpenAIChatMessage;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}

function systemPrompt(hostname: string, tableCount: number): string {
  return `You are Suparbase's data-aware assistant for project ${hostname}.

The user is an admin asking questions about their database (${tableCount} tables in public schema). You have READ-ONLY access via four tools:

- list_tables(category?) — table catalog with AI-inferred displayName, category, and notes. Always start here if you don't already know which table(s) are relevant.
- get_table_schema(table_name) — full column list with types/PKs/FKs. Use this before constructing a query so you reference real column names.
- query_rows({table_name, columns?, filters?, sort?, limit≤50}) — fetches up to 50 rows. Use narrow column lists and filters.
- count_rows({table_name, filters?}) — aggregate count. Use this instead of query_rows when you only need a total.

Rules:
- NEVER fabricate columns, tables, or values. If a requested column doesn't exist, call get_table_schema first.
- For "how many X" questions, prefer count_rows over query_rows.
- For "show me / find / list" questions, use query_rows with a sensible limit (default 10).
- When filtering on a status enum, look at the schema's enumValues to pick valid values.
- When the user references a person/item by name and the primary key is a uuid, search by the obvious label column (name/email/title/slug) with ilike '%term%'.
- Combine multiple filters with AND by passing them as separate entries in the filters array.
- If a tool returns an error, read it and try a corrected call rather than apologising.
- After you have enough information, reply directly in plain English. Be concise. Quote numeric facts and column values exactly.
- Never offer to execute writes — you can only read.
- If the question is unrelated to this database, say so briefly.`;
}

export async function runChat(args: {
  apiKey: string;
  model: string;
  hostname: string;
  history: ChatMessageIn[];
  ctx: ToolContext;
}): Promise<ChatResult> {
  if (args.history.length === 0) {
    throw new OpenRouterError("malformed", "Empty chat history.");
  }
  if (args.history.length > MAX_HISTORY) {
    args.history = args.history.slice(-MAX_HISTORY);
  }

  const messages: OpenAIChatMessage[] = [
    { role: "system", content: systemPrompt(args.hostname, args.ctx.schema.tables.length) },
    ...args.history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const transcript: TranscriptStep[] = [];
  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let modelReturned = args.model;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await callOpenRouter({
      apiKey: args.apiKey,
      model: args.model,
      messages,
    });
    modelReturned = response.model ?? args.model;
    if (response.usage) {
      totalUsage = {
        promptTokens: totalUsage.promptTokens + (response.usage.prompt_tokens ?? 0),
        completionTokens: totalUsage.completionTokens + (response.usage.completion_tokens ?? 0),
        totalTokens: totalUsage.totalTokens + (response.usage.total_tokens ?? 0),
      };
    }

    const choice = response.choices?.[0];
    const msg = choice?.message;
    if (!msg) {
      throw new OpenRouterError("malformed", "OpenRouter returned no message.");
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls,
      });
      for (const call of msg.tool_calls) {
        let parsedArgs: unknown = null;
        try {
          parsedArgs = JSON.parse(call.function.arguments || "{}");
        } catch {
          parsedArgs = { _raw: call.function.arguments };
        }
        const result = await executeTool(
          call.function.name,
          call.function.arguments,
          args.ctx,
        );
        transcript.push({
          tool: call.function.name,
          args: parsedArgs,
          result: result.display,
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: result.payload,
        });
      }
      continue;
    }

    // Final answer.
    return {
      answer: (msg.content ?? "").trim() || "(no answer)",
      model: modelReturned,
      transcript,
      usage: totalUsage,
    };
  }

  // Safety cap hit — return whatever the last assistant content was, or a stub.
  return {
    answer: "I couldn't reach a final answer within the tool-call budget. Try rephrasing or asking a narrower question.",
    model: modelReturned,
    transcript,
    usage: totalUsage,
  };
}

async function callOpenRouter(args: {
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
}): Promise<OpenAIChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "HTTP-Referer": process.env.AUTH_URL ?? "http://localhost:3000",
        "X-Title": "Suparbase Chat",
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: args.model,
        temperature: 0,
        max_tokens: 800,
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

  let payload: OpenAIChatResponse;
  try {
    payload = (await res.json()) as OpenAIChatResponse;
  } catch {
    throw new OpenRouterError("malformed", "OpenRouter returned non-JSON.");
  }

  if (payload.error) {
    throw new OpenRouterError("server", payload.error.message ?? "OpenRouter returned an error.");
  }
  return payload;
}
