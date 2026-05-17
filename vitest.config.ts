import { defineConfig } from "vitest/config";
import { resolve } from "path";

/**
 * Vitest config - unit tests for pure functions only (no DB, no network).
 * Lives in tests/ at the repo root so they don't clutter src/.
 *
 * Test scope today (intentionally narrow):
 *   - fingerprinter regexes
 *   - undo SQL builder
 *   - SSRF blocklist
 * The integration tests for HTTP routes need a test DB + auth stubs,
 * which is a follow-up.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    pool: "threads",
    // Strict by default so accidental console output fails the run.
    onConsoleLog(_log, type) {
      if (type === "stderr") return false;
      return true;
    },
  },
  resolve: {
    // NOTE: more-specific aliases must come BEFORE the generic @/ catch-all,
    // because vitest evaluates the list top-down.
    alias: [
      // src files import "server-only" to fence themselves from client
      // bundles. In a node test runner that throws - stub it out.
      { find: "server-only", replacement: resolve(__dirname, "./tests/server-only-stub.ts") },
      // Stub @/server/db so importing repos / probe / undo doesn't open
      // a real Postgres connection. Tests must mock the calls they need.
      { find: /^@\/server\/db$/, replacement: resolve(__dirname, "./tests/db-stub.ts") },
      // Regular path alias (mirrors tsconfig "@/*": "./src/*").
      { find: /^@\/(.*)$/, replacement: resolve(__dirname, "./src") + "/$1" },
    ],
  },
});
