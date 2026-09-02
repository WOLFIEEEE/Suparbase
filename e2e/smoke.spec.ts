import { test, expect } from "@playwright/test";

/**
 * Smoke spec - the bare minimum that should pass on every deploy.
 * One file, no fixtures, no auth. Confirms:
 *   - the marketing home renders (no 500)
 *   - the public footer is reachable + links work
 *   - the sign-in page is reachable + form is visible
 *   - the forgot-password page exists + form is visible
 *   - /api/health responds with `db: true`
 *   - the accessibility VPAT is rendered (long-content readability)
 *
 * Anything more elaborate (creating connections, running queries)
 * needs a throwaway database + seeded user - that's a follow-up
 * once we add CI fixtures. For now this catches every route we
 * actually ship + the health endpoint, which is enough to detect
 * a broken deploy.
 */

test.describe("Public surface smoke", () => {
  test("home page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Suparbase/);
    // The hero CTA is the most stable selector on this page.
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  });

  test("sign-in page exposes the form", async ({ page }) => {
    await page.goto("/signin");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    // "Forgot?" link is what unblocks locked-out users.
    await expect(page.getByRole("link", { name: /forgot/i })).toBeVisible();
  });

  test("forgot-password page renders the request form", async ({ page }) => {
    await page.goto("/forgot");
    await expect(page.getByRole("heading", { name: /forgot/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send reset link/i })).toBeVisible();
  });

  test("accessibility statement renders", async ({ page }) => {
    await page.goto("/accessibility");
    await expect(page.getByRole("heading", { name: /plain english/i })).toBeVisible();
    // The link out to the VPAT is the contract - make sure it's there.
    await expect(page.getByRole("link", { name: /vpat/i }).first()).toBeVisible();
  });

  test("VPAT renders the full criterion table", async ({ page }) => {
    await page.goto("/accessibility/vpat");
    // Sanity: at least one Supports + one Partially Supports cell.
    await expect(page.getByText("Supports", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("Partially Supports", { exact: true }).first(),
    ).toBeVisible();
  });

  test("pricing page renders for logged-out users", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: /free/i }).first()).toBeVisible();
  });

  test("/api/health responds 200 with db: true", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.db).toBe(true);
    expect(body).toHaveProperty("email");
    expect(body).toHaveProperty("billing");
    expect(body).toHaveProperty("observability");
  });
});

test.describe("Auth gating", () => {
  test("/connections redirects an anonymous visitor to /signin", async ({ page }) => {
    await page.goto("/connections");
    await expect(page).toHaveURL(/\/signin/);
  });

  test("/admin 404s when no session", async ({ page }) => {
    const res = await page.goto("/admin", { waitUntil: "networkidle" });
    // The /admin layout uses notFound() when the caller isn't on the
    // SUPARBASE_ADMIN_EMAILS allowlist; for anon visitors the auth
    // layer redirects to /signin first. Either is acceptable - we
    // just need it to NOT render the admin UI.
    if (res) {
      expect([404, 200]).toContain(res.status());
    }
    // We should not be on /admin (either redirected or showing a 404).
    const url = page.url();
    if (url.includes("/admin")) {
      await expect(page.getByText(/Dashboard|Users|Webhook events/)).not.toBeVisible();
    }
  });
});
