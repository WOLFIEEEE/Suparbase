/**
 * Defensive redaction for secrets that might appear in error messages.
 *
 * Patterns recognized:
 *   - JWT-shaped (three dot-separated base64url segments) → Supabase keys.
 *   - sk-or-<token>                                       → OpenRouter keys.
 *   - sk-<token>                                          → generic OpenAI-style keys (safety net).
 *
 * Applied wherever user-facing or log-bound text might contain a secret.
 */
const JWT_LIKE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const OPENROUTER_LIKE = /\bsk-or-[A-Za-z0-9_-]{16,}\b/g;
const GENERIC_SK_LIKE = /\bsk-[A-Za-z0-9_-]{20,}\b/g;

export function redact(text: string): string {
  return text
    .replace(JWT_LIKE, "[REDACTED_KEY]")
    .replace(OPENROUTER_LIKE, "[REDACTED_KEY]")
    .replace(GENERIC_SK_LIKE, "[REDACTED_KEY]");
}
