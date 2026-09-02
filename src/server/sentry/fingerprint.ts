import "server-only";
import type { AgentKind } from "@/server/schema/agent-sessions";

/**
 * Identify the AI agent behind a request from its User-Agent header.
 *
 * Patterns are conservative, when in doubt we fall through to
 * `ai_unknown` (probably an unknown LLM tool) or `browser` (a normal
 * web client). The goal is correct attribution for the common case,
 * not perfect detection of every long-tail tool.
 *
 * Vendor patterns gathered from public traffic samples + each vendor's
 * own docs as of mid-2026. If you spot a pattern that mis-attributes,
 * add a test case, this file is the canonical source of truth.
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
  // Vercel AI SDK, `vercel-ai-sdk/X` or `ai-sdk`.
  {
    rx: /\b(?:vercel-ai-sdk|ai-sdk)[/ ]?([0-9.]+)?/i,
    kind: "vercel_ai_sdk",
    label: (m) => (m[1] ? `Vercel AI SDK ${m[1]}` : "Vercel AI SDK"),
  },
  // OpenRouter passthrough, our own AI chat calls this from the
  // server. Useful so users can see "Suparbase AI did X".
  {
    rx: /\b(?:OpenRouter|openrouter\.ai)\b/i,
    kind: "openrouter",
    label: () => "Suparbase AI (OpenRouter)",
  },
  // Aider (paul-gauthier/aider). UA is typically `aider/<version>`.
  {
    rx: /\baider[/ ]?([0-9.]+)?/i,
    kind: "aider",
    label: (m) => (m[1] ? `Aider ${m[1]}` : "Aider"),
  },
  // Cline (formerly Claude Dev). UA carries `cline` or `claude-dev`.
  {
    rx: /\b(?:cline|claude[- ]dev)[/ ]?([0-9.]+)?/i,
    kind: "cline",
    label: (m) => (m[1] ? `Cline ${m[1]}` : "Cline"),
  },
  // Continue.dev (continuedev/continue).
  {
    rx: /\b(?:continue[- ]?dev|continue\/[0-9])/i,
    kind: "continue_dev",
    label: () => "Continue.dev",
  },
  // Windsurf (Codeium's agentic IDE): `Windsurf/<version>`.
  {
    rx: /\bWindsurf[/ ]?([0-9.]+)?/i,
    kind: "windsurf",
    label: (m) => (m[1] ? `Windsurf ${m[1]}` : "Windsurf"),
  },
  // OpenAI Codex CLI / cloud agent: `codex-cli/<v>`, `openai-codex`, `Codex/<v>`.
  {
    rx: /\b(?:openai[- ]?codex|codex[- ]?cli|codex)[/ ]?([0-9.]+)?/i,
    kind: "codex",
    label: (m) => (m[1] ? `Codex ${m[1]}` : "Codex"),
  },
  // GitHub Copilot coding agent / CLI. Matched before the generic
  // `copilot` AI hint so it gets a proper bucket.
  {
    rx: /\b(?:github[- ]?copilot|copilot[- ]?(?:agent|cli|chat|coding-agent))[/ ]?([0-9.]+)?/i,
    kind: "copilot",
    label: (m) => (m[1] ? `GitHub Copilot ${m[1]}` : "GitHub Copilot"),
  },
  // Google Gemini CLI.
  {
    rx: /\bgemini[- ]?cli[/ ]?([0-9.]+)?/i,
    kind: "gemini_cli",
    label: (m) => (m[1] ? `Gemini CLI ${m[1]}` : "Gemini CLI"),
  },
  // Cognition Devin.
  {
    rx: /\bDevin(?:\.ai)?[/ ]?([0-9.]+)?/i,
    kind: "devin",
    label: (m) => (m[1] ? `Devin ${m[1]}` : "Devin"),
  },
  // StackBlitz Bolt (bolt.new / bolt.diy).
  {
    rx: /\b(?:bolt\.new|bolt\.diy|bolt[- ](?:agent|diy))\b/i,
    kind: "bolt",
    label: () => "Bolt",
  },
  // Zed editor's agent. Requires a version so the bare word "zed" in an
  // unrelated UA doesn't get bucketed.
  {
    rx: /\bZed[/ ]([0-9.]+)/i,
    kind: "zed",
    label: (m) => `Zed ${m[1]}`,
  },
  // Sourcegraph Amp.
  {
    rx: /\b(?:sourcegraph[- ]?amp|amp[- ]?cli|ampcode)[/ ]?([0-9.]+)?/i,
    kind: "amp",
    label: (m) => (m[1] ? `Amp ${m[1]}` : "Amp"),
  },
  // AWS Kiro.
  {
    rx: /\bKiro(?:[- ]?(?:cli|agent|ide))?[/ ]?([0-9.]+)?/i,
    kind: "kiro",
    label: (m) => (m[1] ? `Kiro ${m[1]}` : "Kiro"),
  },
  // OpenCode (opencode.ai).
  {
    rx: /\bopencode(?:\.ai)?[/ ]?([0-9.]+)?/i,
    kind: "opencode",
    label: (m) => (m[1] ? `OpenCode ${m[1]}` : "OpenCode"),
  },
  // ByteDance Trae. Versioned or the trae.ai host.
  {
    rx: /\b(?:trae\.ai|Trae[/ ]([0-9.]+))/i,
    kind: "trae",
    label: (m) => (m[1] ? `Trae ${m[1]}` : "Trae"),
  },
  // JetBrains Junie.
  {
    rx: /\b(?:jetbrains[- ]?junie|junie)[/ ]?([0-9.]+)?/i,
    kind: "junie",
    label: (m) => (m[1] ? `JetBrains Junie ${m[1]}` : "JetBrains Junie"),
  },
];

/** Tag a request as `ai_unknown` if the UA mentions any of these but
 *  we couldn't pin down the vendor. Better to flag it than hide. */
const AI_HINTS = /\b(?:openai|anthropic|claude|gpt|llm|copilot|assistant|agent|bot|crawler)\b/i;

/** CLI tools (axios / curl / fetch / node / python), show as "cli" so
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

const HUMAN_KINDS: ReadonlySet<AgentKind> = new Set(["browser", "cli", "unknown"]);

/** Heuristic: which kinds should we surface as "AI agent" in the UI? */
export function isAiAgent(kind: AgentKind): boolean {
  return !HUMAN_KINDS.has(kind);
}
