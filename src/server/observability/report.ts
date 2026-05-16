import "server-only";
import { log } from "@/server/log";
import { redact } from "@/lib/redact";

/**
 * Error-reporting shim. By default routes errors to the structured
 * logger (`log.error`). When `SENTRY_DSN` is set, a future plugin
 * can substitute the actual Sentry SDK by re-exporting `report()`
 * from this module — every call site already passes through here.
 *
 * The intent is: don't bake a Sentry dependency into the build until
 * the operator opts in, but make sure every catch site that should
 * be reportable already calls a single function.
 *
 * Usage:
 *   try { ... } catch (e) {
 *     reportError(e, { route: "/api/foo", userId });
 *     return NextResponse.json({...}, { status: 500 });
 *   }
 */
export interface ErrorContext {
  route?: string;
  userId?: string | null;
  connectionId?: string | null;
  /** Arbitrary key/value tags. Avoid PII. */
  tags?: Record<string, string | number | boolean | undefined>;
}

let sentryClient: SentryClient | null | undefined;
interface SentryClient {
  captureException: (err: unknown, opts?: { extra?: Record<string, unknown> }) => void;
}

/**
 * Look up the optional Sentry client at module-init time. We don't
 * `import` `@sentry/nextjs` directly — that would force every
 * deployment to install it. Instead, we look for a global hook the
 * Next instrumentation file can register, plus fall back to
 * checking process for a Sentry SDK if the operator manually wired
 * one.
 */
function getSentry(): SentryClient | null {
  if (sentryClient !== undefined) return sentryClient;
  if (!process.env.SENTRY_DSN) {
    sentryClient = null;
    return null;
  }
  // Look for a globally-registered client (set by instrumentation.ts
  // if present). Avoids a hard dependency.
  const g = globalThis as unknown as { __sentry?: SentryClient };
  sentryClient = g.__sentry ?? null;
  return sentryClient;
}

/**
 * Report an error. Always logs (structured JSON to stdout). When
 * Sentry is configured + initialised, also captures the exception
 * with the supplied context.
 */
export function reportError(err: unknown, ctx: ErrorContext = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  log.error("reported", {
    err: redact(message),
    stack: err instanceof Error ? redact(err.stack ?? "") : undefined,
    route: ctx.route,
    userId: ctx.userId,
    connectionId: ctx.connectionId,
    ...ctx.tags,
  });
  const sentry = getSentry();
  if (sentry) {
    try {
      sentry.captureException(err, {
        extra: {
          route: ctx.route,
          userId: ctx.userId,
          connectionId: ctx.connectionId,
          ...ctx.tags,
        },
      });
    } catch {
      // Never let reporter errors escape — fail open to logging.
    }
  }
}

/**
 * True when the deployment has an error reporter beyond stdout
 * structured logs. Used by /api/health to surface "observability:
 * configured" so an operator can verify the wiring.
 */
export function hasErrorReporter(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}
