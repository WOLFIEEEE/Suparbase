import "server-only";
import type { AgentKind } from "@/server/schema/agent-sessions";

/**
 * Identify the AI agent behind a request from its User-Agent header.
 *
 * Patterns are conservative — when in doubt we fall through to
 * `ai_unknown` (probably an unknown LLM tool) or `browser` (a normal
 * web client). The goal is correct attribution for the common case,
 * not perfect detection of every long-tail tool.
 *
 * Vendor patterns gathered from public traffic samples + each vendor's
 * own docs as of mid-2026. If you spot a pattern that mis-attributes,
 * add a test case — this file is the canonical source of truth.
 */

export interface AgentFingerprint {
  kind: AgentKind;
  label: string;
}

const PATTERNS: Array<{
  rx: RegExp;
  kind: AgentKind;
  label: (m: RegExpMatchArray) => string;
}> = [
  // Cursor IDE: `cursor/<semver>` or `Cursor (<model>)` since v0.45+.
  {
    rx: /\bCursor[/ ]([0-9.]+)/i,
    kind: "cursor",
    label: (m) => `Cursor ${m[1]}`,
  },
  // Claude Code CLI: `claude-code/<version>` or `Anthropic Claude Code`.
  {
    rx: /\b(?:Claude[- ]?Code)[/ ]?([0-9.]+)?/i,
    kind: "claude_code",
    label: (m) => (m[1] ? `Claude Code ${m[1]}` : "Claude Code"),
  },
  // Replit Agent.
  {
    rx: /\bReplit[- ]Agent\b/i,
    kind: "replit_agent",
    label: () => "Replit Agent",
  },
  // Lovable (lovable.dev).
  {
    rx: /\b(?:Lovable|lovable\.dev)\b/i,
    kind: "lovable",
    label: () => "Lovable",
  },
  // v0 / Vercel v0.
  {
    rx: /\bv0(?:[- ]vercel)?\b/i,
    kind: "v0",
    label: () => "v0",
  },
  // Vercel AI SDK — `vercel-ai-sdk/X` or `ai-sdk`.
  {
    rx: /\b(?:vercel-ai-sdk|ai-sdk)[/ ]?([0-9.]+)?/i,
    kind: "vercel_ai_sdk",
    label: (m) => (m[1] ? `Vercel AI SDK ${m[1]}` : "Vercel AI SDK"),
  },
  // OpenRouter passthrough — our own AI chat calls this from the
  // server. Useful so users can see "Suparbase AI did X".
  {
    rx: /\b(?:OpenRouter|openrouter\.ai)\b/i,
    kind: "openrouter",
    label: () => "Suparbase AI (OpenRouter)",
  },
];

/** Tag a request as `ai_unknown` if the UA mentions any of these but
 *  we couldn't pin down the vendor. Better to flag it than hide. */
const AI_HINTS = /\b(?:openai|anthropic|claude|gpt|llm|copilot|assistant|agent|bot|crawler)\b/i;

/** CLI tools (axios / curl / fetch / node / python) — show as "cli" so
 *  the user can spot human curl traffic vs an AI session that happens
 *  to be using fetch under the hood. */
const CLI_HINTS = /\b(?:curl|wget|axios|node-fetch|undici|python-requests|python-urllib|httpx|reqwest|HTTPie|insomnia|Postman)\b/i;

const BROWSER_HINTS = /\b(?:Mozilla|Chrome|Safari|Firefox|Edg|AppleWebKit)\b/i;

export function fingerprintRequest(userAgent: string | null | undefined): AgentFingerprint {
  const ua = (userAgent ?? "").trim();
  if (!ua) return { kind: "unknown", label: "unknown" };

  for (const p of PATTERNS) {
    const m = ua.match(p.rx);
    if (m) return { kind: p.kind, label: p.label(m) };
  }

  if (AI_HINTS.test(ua)) {
    // Truncate the UA into something readable for the label without
    // exposing the full string (which can carry incidental info).
    const head = ua.slice(0, 40).replace(/\s+/g, " ").trim();
    return { kind: "ai_unknown", label: `AI · ${head}` };
  }

  if (BROWSER_HINTS.test(ua)) {
    return { kind: "browser", label: "Browser" };
  }
  if (CLI_HINTS.test(ua)) {
    return { kind: "cli", label: "CLI" };
  }

  return { kind: "unknown", label: "unknown" };
}

/** Heuristic: which kinds should we surface as "AI agent" in the UI? */
export function isAiAgent(kind: AgentKind): boolean {
  return (
    kind === "cursor" ||
    kind === "claude_code" ||
    kind === "replit_agent" ||
    kind === "lovable" ||
    kind === "v0" ||
    kind === "vercel_ai_sdk" ||
    kind === "openrouter" ||
    kind === "ai_unknown"
  );
}
