/**
 * Defensive redaction for secrets that might appear in error messages
 * or log payloads. We replace recognised patterns with `[REDACTED_*]`
 * before the string ever hits a log line, an audit row, or a
 * user-facing error response.
 *
 * Patterns recognised:
 *   - postgres:// / mysql:// / mongodb:// / redis:// / amqp:// URLs
 *       connection strings with embedded credentials (sync errors).
 *   - JWT-shaped (three dot-separated base64url segments)
 *       Supabase / NextAuth tokens.
 *   - sk-or-<token>              OpenRouter keys.
 *   - sk-<token>                 generic OpenAI-style keys.
 *   - re_<token>                 Resend API keys.
 *   - whsec_<base64>             Standard Webhooks secrets
 *                                (Dodo, Stripe, others).
 *   - ghp_/gho_/ghu_/ghs_/ghr_   GitHub PATs / OAuth / refresh / app tokens.
 *   - $2a$/$2b$/$2y$<...>        bcrypt hashes.
 *   - 32-byte base64 (43-44 chars) and 64-char hex - catch-all for
 *     raw symmetric keys (SUPARBASE_ENCRYPTION_KEY shape). Word
 *     boundaries scope the match so we don't false-positive on long
 *     identifiers embedded in URLs or paths.
 *
 * Applied wherever user-facing or log-bound text might contain a
 * secret. Order matters: provider-prefixed patterns run before the
 * generic catch-alls so the redacted token type is preserved in the
 * marker.
 */
// Database / generic connection URLs with embedded credentials
// (postgres://user:pass@host/db and friends). The whole URL goes: the
// host + db name alone can identify a customer's production database.
const DB_URL_LIKE = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis(?:s)?|amqp(?:s)?):\/\/[^\s"'<>]+/gi;
const JWT_LIKE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const OPENROUTER_LIKE = /\bsk-or-[A-Za-z0-9_-]{16,}\b/g;
const GENERIC_SK_LIKE = /\bsk-[A-Za-z0-9_-]{20,}\b/g;
const RESEND_LIKE = /\bre_[A-Za-z0-9_-]{20,}\b/g;
const WEBHOOK_SECRET_LIKE = /\bwhsec_[A-Za-z0-9+/=_-]{20,}\b/g;
const GITHUB_TOKEN_LIKE = /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g;
const BCRYPT_LIKE = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{20,}/g;

// 32 bytes encoded as base64 = 44 chars (last is "="); url-safe
// base64 = 43 chars (no padding). Hex = 64 chars. These are the
// fallback patterns for raw symmetric keys (the encryption vault, an
// HMAC secret pasted in by mistake). The provider-prefixed patterns
// run first, so legitimate prefixed tokens get a more specific
// marker.
const SYMMETRIC_KEY_BASE64 =
  /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{43,44}={0,2}(?![A-Za-z0-9+/_-])/g;
const SYMMETRIC_KEY_HEX = /\b[a-f0-9]{64}\b/g;

export function redact(text: string): string {
  return text
    .replace(DB_URL_LIKE, "[REDACTED_DB_URL]")
    .replace(JWT_LIKE, "[REDACTED_KEY]")
    .replace(OPENROUTER_LIKE, "[REDACTED_KEY]")
    .replace(RESEND_LIKE, "[REDACTED_KEY]")
    .replace(WEBHOOK_SECRET_LIKE, "[REDACTED_SECRET]")
    .replace(GITHUB_TOKEN_LIKE, "[REDACTED_TOKEN]")
    .replace(GENERIC_SK_LIKE, "[REDACTED_KEY]")
    .replace(BCRYPT_LIKE, "[REDACTED_HASH]")
    .replace(SYMMETRIC_KEY_BASE64, "[REDACTED_KEY]")
    .replace(SYMMETRIC_KEY_HEX, "[REDACTED_KEY]");
}
