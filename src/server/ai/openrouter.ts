import "server-only";
import { AnalysisResponseSchema, type AnalysisResponse } from "./responseSchema";
import { redact } from "@/lib/redact";

const ENDPOINT = "https://openrouter.ai/api/v1";
const MAX_TIMEOUT_MS = 30_000;

export interface OpenRouterUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface OpenRouterAnalysisResult {
  analysis: AnalysisResponse;
  model: string;
  usage: OpenRouterUsage;
}

export class OpenRouterError extends Error {
  category: "unauthorized" | "rate_limited" | "network" | "malformed" | "server";
  constructor(category: OpenRouterError["category"], message: string) {
    super(redact(message));
    this.name = "OpenRouterError";
    this.category = category;
  }
}

function appOrigin(): string {
  return process.env.AUTH_URL ?? "http://localhost:3000";
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": appOrigin(),
    "X-Title": "Suparbase",
    "Content-Type": "application/json",
  };
}

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  description?: string;
  contextLength: number | null;
  pricing: {
    /** USD per input token. */
    prompt: number | null;
    /** USD per output token. */
    completion: number | null;
  };
  modality: string | null;
  /** True when the model exposes tool/function calling. */
  supportsTools: boolean;
}

interface RawModel {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string | number; completion?: string | number };
  architecture?: { modality?: string };
  supported_parameters?: string[];
}

interface ModelsResponse {
  data?: RawModel[];
}

/**
 * Pull the OpenRouter model catalogue. The endpoint is public: auth is
 * optional and only used to bias the response toward what the user's key
 * can call. Throws OpenRouterError on transport / parse failures.
 */
export async function fetchOpenRouterModels(apiKey: string | null): Promise<OpenRouterModelInfo[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/models`, {
      method: "GET",
      headers: apiKey
        ? authHeaders(apiKey)
        : { Accept: "application/json", "HTTP-Referer": appOrigin(), "X-Title": "Suparbase" },
      signal: controller.signal,
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
  if (!res.ok) {
    throw new OpenRouterError("server", `OpenRouter responded with ${res.status}.`);
  }
  let payload: ModelsResponse;
  try {
    payload = (await res.json()) as ModelsResponse;
  } catch {
    throw new OpenRouterError("malformed", "OpenRouter /models returned non-JSON.");
  }
  const raw = Array.isArray(payload.data) ? payload.data : [];
  const out: OpenRouterModelInfo[] = [];
  for (const m of raw) {
    if (!m.id) continue;
    out.push({
      id: m.id,
      name: m.name ?? m.id,
      description: m.description,
      contextLength: typeof m.context_length === "number" ? m.context_length : null,
      pricing: {
        prompt: parsePricing(m.pricing?.prompt),
        completion: parsePricing(m.pricing?.completion),
      },
      modality: m.architecture?.modality ?? null,
      supportsTools: Array.isArray(m.supported_parameters)
        ? m.supported_parameters.includes("tools")
        : false,
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function parsePricing(v: string | number | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Probe call. We hit /models with the user's key; a 200 means the key is
 * usable, a 401/403 means it isn't.
 */
export async function probeOpenRouterKey(apiKey: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/models`, {
      method: "GET",
      headers: authHeaders(apiKey),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new OpenRouterError("network", `Could not reach OpenRouter (${(e as Error).message ?? "unknown"}).`);
  }
  clearTimeout(timer);
  if (res.status === 401 || res.status === 403) {
    throw new OpenRouterError("unauthorized", "OpenRouter rejected this key.");
  }
  if (!res.ok) {
    throw new OpenRouterError("server", `OpenRouter responded with ${res.status}.`);
  }
}

interface ChatCompletionsRequest {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

interface ChatCompletionsResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string; code?: string | number };
}

/**
 * Run the analysis prompt and return the validated JSON, the actual model
 * the upstream returned, and the token usage.
 */
export async function runAnalysis({
  apiKey,
  model,
  systemPrompt,
  userPrompt,
}: ChatCompletionsRequest): Promise<OpenRouterAnalysisResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/chat/completions`, {
      method: "POST",
      headers: authHeaders(apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        max_tokens: 1500,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    throw new OpenRouterError("network", `Could not reach OpenRouter (${(e as Error).message ?? "unknown"}).`);
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
    throw new OpenRouterError("server", `OpenRouter ${res.status}: ${redact(detail.slice(0, 200))}`);
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

  const validated = AnalysisResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new OpenRouterError(
      "malformed",
      `Model output failed validation: ${validated.error.issues[0]?.message ?? "unknown reason"}`,
    );
  }

  return {
    analysis: validated.data,
    model: payload.model ?? model,
    usage: {
      promptTokens: payload.usage?.prompt_tokens ?? 0,
      completionTokens: payload.usage?.completion_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? 0,
    },
  };
}
