/**
 * Client-side secret scanner for the free `/tools/secret-scanner` page.
 * Mirrors the pattern set behind `src/lib/redact.ts`, but instead of
 * replacing matches it RETURNS them (type, severity, position, advice) so
 * the UI can highlight and explain each one. Runs entirely in the browser:
 * pasted text never leaves the page.
 *
 * JWTs are decoded far enough to tell a Supabase `service_role` key (which
 * bypasses RLS — critical if leaked) from an `anon` key (public by design).
 */

export type Severity = "critical" | "high" | "medium" | "info";

export interface SecretMatch {
  type: string;
  label: string;
  severity: Severity;
  /** Character offset into the input. */
  index: number;
  length: number;
  /** Masked preview of the match (first/last few chars kept). */
  preview: string;
  advice: string;
}

interface Rule {
  type: string;
  label: string;
  severity: Severity;
  regex: RegExp;
  advice: string;
  /** Optional refinement: return null to reject, or override fields. */
  refine?: (raw: string) => Partial<SecretMatch> | null;
}

function b64urlDecode(seg: string): string | null {
  try {
    const norm = seg.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm.length % 4 === 0 ? norm : norm + "=".repeat(4 - (norm.length % 4));
    // atob exists in browsers and Node >= 16.
    const bin = atob(pad);
    return bin;
  } catch {
    return null;
  }
}

/** Decode a JWT's payload role claim, if present. */
function jwtRole(raw: string): string | null {
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const payload = b64urlDecode(parts[1]!);
  if (!payload) return null;
  try {
    const obj = JSON.parse(payload) as Record<string, unknown>;
    const role = obj.role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

const RULES: Rule[] = [
  {
    type: "db_url",
    label: "Database connection URL",
    severity: "critical",
    regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis(?:s)?|amqp(?:s)?):\/\/[^\s"'<>]+/gi,
    advice: "Connection strings embed the password. Move it to a server-only env var and never ship it to the client.",
  },
  {
    type: "jwt",
    label: "JWT / API key",
    severity: "medium",
    regex: /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    advice: "A JWT-shaped token. If it's a Supabase key, keep it server-side.",
    refine: (raw) => {
      const role = jwtRole(raw);
      if (role === "service_role") {
        return {
          type: "supabase_service_role",
          label: "Supabase service_role key",
          severity: "critical",
          advice:
            "This key BYPASSES Row-Level Security. If it's in client code or a public repo, rotate it now and only ever use it from a server.",
        };
      }
      if (role === "anon") {
        return {
          type: "supabase_anon",
          label: "Supabase anon key (public by design)",
          severity: "info",
          advice:
            "The anon key is meant to be public — it ships in your client bundle. It's only dangerous if your tables lack RLS. Run the Security Scanner to check.",
        };
      }
      return null; // keep as generic jwt
    },
  },
  {
    type: "openrouter_key",
    label: "OpenRouter API key",
    severity: "high",
    regex: /\bsk-or-[A-Za-z0-9_-]{16,}\b/g,
    advice: "Provider API key. Keep it in a server-only env var.",
  },
  {
    type: "openai_key",
    label: "OpenAI-style API key",
    severity: "high",
    regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    advice: "Provider API key. Keep it in a server-only env var.",
  },
  {
    type: "resend_key",
    label: "Resend API key",
    severity: "high",
    regex: /\bre_[A-Za-z0-9_-]{20,}\b/g,
    advice: "Email provider key. Server-only.",
  },
  {
    type: "webhook_secret",
    label: "Webhook signing secret",
    severity: "high",
    regex: /\bwhsec_[A-Za-z0-9+/=_-]{20,}\b/g,
    advice: "Signing secret (Stripe/Dodo/Standard Webhooks). Server-only.",
  },
  {
    type: "github_token",
    label: "GitHub token",
    severity: "high",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
    advice: "GitHub PAT/OAuth token. Revoke and rotate if exposed.",
  },
  {
    type: "bcrypt",
    label: "bcrypt hash",
    severity: "medium",
    regex: /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{20,}/g,
    advice: "A password hash. It shouldn't live in source or logs.",
  },
  {
    type: "symmetric_hex",
    label: "Raw key (64-char hex)",
    severity: "high",
    regex: /\b[a-f0-9]{64}\b/g,
    advice: "Looks like a raw symmetric key (encryption/HMAC). Server-only.",
  },
  {
    type: "symmetric_base64",
    label: "Raw key (32-byte base64)",
    severity: "high",
    regex: /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{43,44}={0,2}(?![A-Za-z0-9+/_-])/g,
    advice: "Looks like a raw 32-byte key. Server-only.",
  },
];

function mask(raw: string): string {
  if (raw.length <= 12) return `${raw.slice(0, 2)}…${raw.slice(-2)}`;
  return `${raw.slice(0, 6)}…${raw.slice(-4)}`;
}

function overlaps(a: SecretMatch, start: number, end: number): boolean {
  const aEnd = a.index + a.length;
  return start < aEnd && end > a.index;
}

/**
 * Scan `text` for leaked secrets. Rules run in priority order; a later
 * rule that overlaps an already-claimed range is skipped, so a Supabase
 * JWT isn't also reported as a base64 blob.
 */
export function scanSecrets(text: string): SecretMatch[] {
  const found: SecretMatch[] = [];
  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.regex.exec(text)) !== null) {
      const raw = m[0];
      const start = m.index;
      const end = start + raw.length;
      if (found.some((f) => overlaps(f, start, end))) continue;

      let match: SecretMatch = {
        type: rule.type,
        label: rule.label,
        severity: rule.severity,
        index: start,
        length: raw.length,
        preview: mask(raw),
        advice: rule.advice,
      };
      if (rule.refine) {
        const refined = rule.refine(raw);
        if (refined === null && rule.type === "jwt") {
          // keep generic jwt
        } else if (refined) {
          match = { ...match, ...refined };
        }
      }
      found.push(match);
      if (raw.length === 0) rule.regex.lastIndex++; // guard against zero-width
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, info: 3 };

export function summarize(matches: SecretMatch[]): {
  total: number;
  worst: Severity | null;
  counts: Record<Severity, number>;
} {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, info: 0 };
  for (const m of matches) counts[m.severity]++;
  let worst: Severity | null = null;
  for (const m of matches) {
    if (worst === null || SEVERITY_RANK[m.severity] < SEVERITY_RANK[worst]) worst = m.severity;
  }
  return { total: matches.length, worst, counts };
}
