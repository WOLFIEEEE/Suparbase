import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright end-to-end test config. Kept deliberately small:
 *   - One project (Chromium desktop). Mobile / Firefox come after we
 *     have a real signal that the suite is worth maintaining.
 *   - Tests live in `e2e/`, not `tests/` - that's vitest territory.
 *   - The dev server is auto-spawned with `pnpm dev` unless
 *     PLAYWRIGHT_BASE_URL is set (then we assume CI / staging).
 *   - Single retry in CI for flakiness; zero locally for fast fail.
 *
 * Run:
 *   pnpm test:e2e          # headless
 *   pnpm test:e2e --ui     # interactive
 *   pnpm test:e2e --debug  # inspector
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Playwright takes a list, but a single worker keeps the dev server
  // sane on a single-instance Postgres. Bump in CI when we move to a
  // throwaway DB per worker.
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // When BASE_URL is localhost, auto-start `pnpm dev`. In CI / staging
  // the runner targets an existing server.
  ...(BASE_URL.startsWith("http://localhost") && !process.env.PLAYWRIGHT_NO_SERVER
    ? {
        webServer: {
          command: "pnpm dev",
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
});
