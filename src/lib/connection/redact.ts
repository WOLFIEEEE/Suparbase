/**
 * Defensive redaction: remove any substring that looks like a Supabase JWT
 * (three dot-separated base64url segments) from text before logging.
 * Used by error mapping so that PostgrestError messages cannot leak the key.
 */
const JWT_LIKE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

export function redact(text: string): string {
  return text.replace(JWT_LIKE, "[REDACTED_KEY]");
}
