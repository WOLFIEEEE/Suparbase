import "server-only";
import { redact } from "@/lib/redact";

/**
 * Tiny structured logger. Emits one JSON object per line on stdout/stderr
 * so a downstream collector (Coolify, Logflare, Vercel logs, Loki, ...)
 * can ingest it without parsing.
 *
 * Why we built our own:
 *   - No vendor lock-in for OSS deploys.
 *   - Redaction defaults: every message and every value runs through
 *     `redact()`, which strips JWT-shaped substrings, provider tokens
 *     (`re_*`, `sk-*`, `ghp_*`), and other accidental secrets before
 *     they hit the log line.
 *   - Five-line surface: `log.info()` / `log.warn()` / `log.error()`
 *     with an optional structured context object.
 *
 * If you want to plug this into Sentry.io / Highlight / Logflare /
 * Datadog, replace `emit()` here. The rest of the app already uses the
 * structured surface, so the upgrade path is one file.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minLevel(): Level {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  // Default: info in production, debug in dev. Either way we never go
  // below info on warn/error calls (those always emit).
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

type Ctx = Record<string, unknown>;

function safeStringify(v: unknown): unknown {
  if (typeof v === "string") return redact(v);
  if (v === null || v === undefined) return v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Error) {
    return {
      name: v.name,
      message: redact(v.message ?? ""),
      stack: redact(v.stack ?? ""),
    };
  }
  if (Array.isArray(v)) return v.map(safeStringify);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = safeStringify(val);
    }
    return out;
  }
  return String(v);
}

function emit(level: Level, msg: string, ctx?: Ctx): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return;
  const line = {
    level,
    msg: redact(msg),
    ts: new Date().toISOString(),
    ...(ctx ? (safeStringify(ctx) as Ctx) : {}),
  };
  const out = JSON.stringify(line);
  if (level === "error" || level === "warn") {
    // eslint-disable-next-line no-console
    console.error(out);
  } else {
    // eslint-disable-next-line no-console
    console.log(out);
  }
}

export const log = {
  debug: (msg: string, ctx?: Ctx) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Ctx) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Ctx) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Ctx) => emit("error", msg, ctx),
};
