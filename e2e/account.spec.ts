import { test, expect } from "@playwright/test";

/**
 * Account-flow smoke specs. These don't actually create accounts
 * (no fixture / seeded user yet), but they verify every reachable
 * UI element renders correctly without needing auth — the bits a
 * customer might land on from a marketing link or a forgotten
 * bookmark.
 *
 * Once we wire up a throwaway DB + seed, follow-ups can swap these
 * for full sign-in → action → assertion flows.
 */

test.describe("Account-adjacent surfaces (unauth)", () => {
  test("/forgot renders the request form", async ({ page }) => {
    await page.goto("/forgot");
    await expect(page.getByRole("heading", { name: /forgot/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /send reset link/i })).toBeVisible();
    // Back-to-sign-in link should be visible.
    await expect(page.getByRole("link", { name: /back to sign in/i })).toBeVisible();
  });

  test("/forgot honours the 'try again' affordance after submit", async ({ page }) => {
    await page.goto("/forgot");
    await page.getByLabel(/email/i).fill("nope@example.com");
    await page.getByRole("button", { name: /send reset link/i }).click();
    // The success state is enumeration-resistant — same banner whether
    // or not the email exists. Either configured/unconfigured.
    await expect(
      page.getByText(/check your inbox|email isn't configured/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("/reset/<garbage> still renders the form (server doesn't pre-validate)", async ({ page }) => {
    await page.goto("/reset/garbage-token-that-does-not-exist");
    await expect(page.getByRole("heading", { name: /reset/i }).first()).toBeVisible();
    await expect(page.getByLabel(/new password/i)).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
  });

  test("/signin/2fa redirects to /signin when not authenticated", async ({ page }) => {
    await page.goto("/signin/2fa");
    await expect(page).toHaveURL(/\/signin/);
  });

  test("/settings/account redirects to /signin when not authenticated", async ({ page }) => {
    await page.goto("/settings/account");
    await expect(page).toHaveURL(/\/signin/);
  });

  test("/settings/account/2fa redirects to /signin when not authenticated", async ({ page }) => {
    await page.goto("/settings/account/2fa");
    await expect(page).toHaveURL(/\/signin/);
  });
});

test.describe("Public marketing surfaces", () => {
  test("/roadmap renders shipped + in-progress + next sections", async ({ page }) => {
    await page.goto("/roadmap");
    await expect(page.getByRole("heading", { name: /roadmap/i }).first()).toBeVisible();
    await expect(page.getByText(/recently shipped/i)).toBeVisible();
    await expect(page.getByText(/in progress/i)).toBeVisible();
    await expect(page.getByText(/^next$/i)).toBeVisible();
  });

  test("/status renders the subsystem checks", async ({ page }) => {
    await page.goto("/status");
    await expect(page.getByText(/all systems operational|core dependency|operating with/i)).toBeVisible();
    await expect(page.getByText(/database/i).first()).toBeVisible();
    await expect(page.getByText(/encrypted proxy/i)).toBeVisible();
  });
});

test.describe("/api/account endpoints reject malformed input", () => {
  test("POST /api/account/forgot-password with missing body is 400", async ({ request }) => {
    const res = await request.post("/api/account/forgot-password", { data: {} });
    expect(res.status()).toBe(400);
  });

  test("POST /api/account/reset-password with missing token is 400", async ({ request }) => {
    const res = await request.post("/api/account/reset-password", {
      data: { password: "irrelevant1234567" },
    });
    expect(res.status()).toBe(400);
  });
});
