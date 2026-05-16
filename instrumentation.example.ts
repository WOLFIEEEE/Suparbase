/**
 * Sentry instrumentation example.
 *
 * To enable error reporting in production:
 *
 *   1. Provision a Sentry project, copy the DSN.
 *   2. `pnpm add @sentry/nextjs`
 *   3. Copy this file to `instrumentation.ts` at the repo root.
 *   4. Set `SENTRY_DSN` in your deployment env.
 *
 * Next.js auto-invokes `register()` once per server-instance boot.
 * The `reportError()` helper in `src/server/observability/report.ts`
 * looks up `globalThis.__sentry` at call time and forwards the
 * exception — so the existing call sites pick this up automatically.
 *
 * No code paths import from `@sentry/nextjs` directly. This keeps
 * the dependency optional: deployments that don't want analytics /
 * error tracking just don't install the package and the file isn't
 * loaded.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (!process.env.SENTRY_DSN) return;

  // Server-side init.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // @ts-expect-error optional dep
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      // Lower this in production if you have high traffic.
      tracesSampleRate: 0.1,
      // Suparbase's redact() already strips JWT-shaped substrings
      // before logging; do the same for breadcrumbs heading to Sentry.
      beforeBreadcrumb(breadcrumb: { message?: string }) {
        if (typeof breadcrumb.message === "string") {
          breadcrumb.message = breadcrumb.message.replace(
            /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
            "<jwt>",
          );
        }
        return breadcrumb;
      },
    });

    // Expose the captureException entry point for our reportError() shim.
    (globalThis as unknown as { __sentry?: { captureException: typeof Sentry.captureException } }).__sentry = {
      captureException: Sentry.captureException,
    };
  }

  // Edge runtime (middleware, edge route handlers) needs its own init.
  if (process.env.NEXT_RUNTIME === "edge") {
    // @ts-expect-error optional dep
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.05, // edge is much higher-traffic
    });
  }
}
