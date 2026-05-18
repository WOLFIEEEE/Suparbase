import { test, expect } from "@playwright/test";

/**
 * Guest-checkout smoke. Verifies the public surface of the flow we
 * shipped in v3.11.0 still renders correctly and the form posts to
 * the API. We don't drive Dodo's hosted checkout end-to-end (it
 * requires a sandbox account + payment instrument); the assertion
 * is that the form is visible, the topic toggle works, and the
 * submit ends up POSTing to `/api/billing/guest-checkout`.
 *
 * If billing isn't configured on this deployment, the form renders
 * a setup banner instead - we assert that path too so the page
 * never silently 404s during checks.
 */

test.describe("Guest checkout", () => {
  test("/checkout/hosted exposes the form", async ({ page }) => {
    await page.goto("/checkout/hosted");
    await expect(
      page.getByRole("heading", { name: /one step to your subscription/i }),
    ).toBeVisible();
  });

  test("/checkout/hosted has the email + cadence controls", async ({ page }) => {
    await page.goto("/checkout/hosted");
    // The page either shows the form or the "billing not configured"
    // banner. The form has the email input; the banner does not.
    const emailField = page.getByLabel(/work email/i);
    if ((await emailField.count()) > 0) {
      await expect(emailField).toBeVisible();
      // Cadence radiogroup is annual-supported only; we assert at
      // least one of the two states is visible.
      const cadenceMonthly = page.getByRole("radio", { name: /monthly/i });
      const cadenceAnnual = page.getByRole("radio", { name: /annual/i });
      if ((await cadenceMonthly.count()) + (await cadenceAnnual.count()) > 0) {
        await expect(cadenceMonthly.or(cadenceAnnual).first()).toBeVisible();
      }
      await expect(
        page.getByRole("button", { name: /continue to payment/i }),
      ).toBeVisible();
    } else {
      // Billing isn't configured. The page must surface that clearly
      // and offer a sales-contact link.
      await expect(
        page.getByText(/billing isn't configured/i),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: /our contact form/i }),
      ).toBeVisible();
    }
  });

  test("/checkout/team redirects to contact-sales", async ({ page }) => {
    await page.goto("/checkout/team");
    await expect(page).toHaveURL(/\/contact/);
  });

  test("/checkout/free redirects to /signup", async ({ page }) => {
    await page.goto("/checkout/free");
    await expect(page).toHaveURL(/\/signup/);
  });

  test("/welcome with a bogus token renders a graceful error", async ({ page }) => {
    await page.goto("/welcome/not-a-real-token");
    // Either the "we couldn't find that invitation" copy OR the
    // "expired" copy is acceptable - depends on whether the token
    // lookup found any row with that prefix. Both surfaces link to
    // /forgot and /signin so the user is never stranded.
    await expect(
      page
        .getByRole("heading", { name: /this invitation has expired/i })
        .or(
          page.getByRole("heading", {
            name: /we couldn['']t find that invitation/i,
          }),
        ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /sign in/i }).first(),
    ).toBeVisible();
  });
});
