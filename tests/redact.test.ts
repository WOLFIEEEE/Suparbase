import { describe, expect, it } from "vitest";
import { redact } from "@/lib/redact";

describe("redact", () => {
  it("redacts JWT-shaped Supabase keys", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature_part_long_enough_to_match";
    expect(redact(`anon=${jwt}`)).toBe("anon=[REDACTED_KEY]");
  });

  it("redacts Resend API keys (re_ prefix)", () => {
    expect(redact("key: re_AbCdEfGhIjKlMnOpQrSt12")).toBe(
      "key: [REDACTED_KEY]",
    );
  });

  it("redacts Standard Webhooks signing secrets (whsec_)", () => {
    expect(redact("DODO_WEBHOOK_SECRET=whsec_uPvKfYE2bA3xR4mQ8tWnB5gJoLcN6dS")).toBe(
      "DODO_WEBHOOK_SECRET=[REDACTED_SECRET]",
    );
  });

  it("redacts GitHub PATs", () => {
    expect(redact("token=ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789")).toBe(
      "token=[REDACTED_TOKEN]",
    );
    expect(redact("oauth=gho_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789")).toBe(
      "oauth=[REDACTED_TOKEN]",
    );
  });

  it("redacts 32-byte base64 symmetric keys (encryption-key shape)", () => {
    // 32 bytes of zero, base64-encoded.
    const key = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    expect(redact(`SUPARBASE_ENCRYPTION_KEY=${key}`)).toBe(
      "SUPARBASE_ENCRYPTION_KEY=[REDACTED_KEY]",
    );
  });

  it("redacts 64-char hex symmetric keys", () => {
    const key = "a".repeat(64);
    expect(redact(`secret=${key}`)).toBe("secret=[REDACTED_KEY]");
  });

  it("redacts bcrypt hashes", () => {
    expect(redact("hash=$2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJ")).toBe(
      "hash=[REDACTED_HASH]",
    );
  });

  it("redacts OpenRouter keys (sk-or- prefix) before the generic sk- pattern", () => {
    expect(redact("OPENROUTER_API_KEY=sk-or-AbCdEfGhIjKlMnOpQrSt")).toBe(
      "OPENROUTER_API_KEY=[REDACTED_KEY]",
    );
  });

  it("leaves short non-secret strings alone", () => {
    expect(redact("user=alice connection=abc-123")).toBe(
      "user=alice connection=abc-123",
    );
    expect(redact("status=ok elapsed=42ms")).toBe("status=ok elapsed=42ms");
  });

  it("leaves UUIDs alone", () => {
    expect(redact("user_id=12345678-1234-1234-1234-123456789012")).toBe(
      "user_id=12345678-1234-1234-1234-123456789012",
    );
  });

  it("doesn't double-mark a single token", () => {
    // Pre-replaced markers should not be re-replaced into something
    // weirder. (e.g. [REDACTED_TOKEN] shouldn't trip another pattern)
    expect(redact("token=[REDACTED_TOKEN]")).toBe("token=[REDACTED_TOKEN]");
  });
});
