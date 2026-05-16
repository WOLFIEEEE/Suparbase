"use client";

import { useEffect } from "react";

/**
 * Top-level error boundary for the App Router. Next.js routes
 * unhandled exceptions from server components, client components,
 * and layouts through here. We log to console (which the upstream
 * log aggregator can collect) and report to the error reporter when
 * a client-side Sentry SDK is loaded.
 *
 * Kept intentionally minimal: a friendly explanation + reload button
 * + email-support fallback. No customer data, no stack traces in
 * the UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // console.error is captured by Sentry's browser SDK if loaded.
    // It's also the simplest log path for browser-extension or
    // upstream collectors. The digest is the Next.js server-error id
    // that maps to the structured log entry.
    // eslint-disable-next-line no-console
    console.error("global-error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgb(10,10,11)",
          color: "rgb(245,245,241)",
          fontFamily:
            "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
        }}
      >
        <main
          id="main"
          style={{
            maxWidth: 480,
            padding: 32,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgb(110,110,105)",
              marginBottom: 8,
            }}
          >
            Suparbase
          </p>
          <h1 style={{ margin: "0 0 16px 0", fontSize: 24, lineHeight: 1.3 }}>
            Something went wrong.
          </h1>
          <p style={{ margin: "0 0 24px 0", fontSize: 14, color: "rgb(168,168,162)" }}>
            The page hit an unexpected error. The team has been notified. Try
            reloading; if it keeps happening, email{" "}
            <a href="mailto:contact@suparbase.com" style={{ color: "rgb(182,255,60)" }}>
              contact@suparbase.com
            </a>
            {error.digest ? (
              <>
                {" "}
                and quote{" "}
                <code
                  style={{
                    fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
                    fontSize: 12,
                  }}
                >
                  {error.digest}
                </code>
              </>
            ) : null}
            .
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 500,
              background: "rgb(182,255,60)",
              color: "rgb(10,10,11)",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
