import "server-only";
import { isBillingConfigured } from "@/server/billing/dodo";
import { getEmailConfig } from "@/server/email/resend";
import { hasErrorReporter } from "@/server/observability/report";

export type AdminSystemState = "ok" | "warn" | "off";

export interface AdminSystemCheck {
  id: string;
  label: string;
  state: AdminSystemState;
  importance: "required" | "recommended" | "optional";
  detail: string;
}

/**
 * Deployment configuration health without exposing any secret values. The
 * admin operations page combines this with database-backed workload health.
 */
export function getAdminSystemChecks(): AdminSystemCheck[] {
  const email = getEmailConfig();
  const billing = isBillingConfigured();
  const hasBillingWebhook = Boolean(process.env.DODO_WEBHOOK_SECRET?.trim());
  const hasCron = Boolean(process.env.CRON_SECRET?.trim());
  const hasVault = Boolean(process.env.SUPARBASE_ENCRYPTION_KEY?.trim());
  const hasOldVault = Boolean(process.env.SUPARBASE_ENCRYPTION_KEY_OLD?.trim());
  const hasGithub = Boolean(
    process.env.AUTH_GITHUB_ID?.trim() && process.env.AUTH_GITHUB_SECRET?.trim(),
  );
  const hasAnalytics = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim());

  return [
    {
      id: "database",
      label: "Application database",
      state: "ok",
      importance: "required",
      detail: "Connected; this page loaded its live operational snapshot.",
    },
    {
      id: "vault",
      label: "Credential vault",
      state: hasVault ? "ok" : "warn",
      importance: "required",
      detail: hasVault
        ? hasOldVault
          ? "Primary and previous keys are loaded for an active rotation window."
          : "Primary AES-256-GCM key is loaded."
        : "SUPARBASE_ENCRYPTION_KEY is missing.",
    },
    {
      id: "email",
      label: "Transactional email",
      state: email.configured ? "ok" : "warn",
      importance: "recommended",
      detail: email.configured
        ? `Configured from ${email.from ?? "the deployment sender"}.`
        : `Unavailable: ${email.reason ?? "configuration incomplete"}.`,
    },
    {
      id: "email-webhook",
      label: "Email delivery webhook",
      state: process.env.RESEND_WEBHOOK_SECRET?.trim() ? "ok" : "off",
      importance: "recommended",
      detail: process.env.RESEND_WEBHOOK_SECRET?.trim()
        ? "Bounce and complaint suppression is enabled."
        : "RESEND_WEBHOOK_SECRET is absent; bounces cannot update suppression state.",
    },
    {
      id: "billing",
      label: "Billing checkout",
      state: billing ? "ok" : "off",
      importance: "recommended",
      detail: billing
        ? `Dodo ${process.env.DODO_MODE?.toLowerCase() === "live" ? "live" : "test"} mode is configured.`
        : "DODO_API_KEY is absent; self-serve paid checkout is disabled.",
    },
    {
      id: "billing-webhook",
      label: "Billing webhook verification",
      state: !billing ? "off" : hasBillingWebhook ? "ok" : "warn",
      importance: billing ? "required" : "optional",
      detail: !billing
        ? "Billing is disabled; webhook verification is inactive."
        : hasBillingWebhook
          ? "Dodo webhook signatures are verified."
          : "DODO_WEBHOOK_SECRET is absent; billing webhooks cannot be trusted.",
    },
    {
      id: "cron",
      label: "Scheduled operations",
      state: hasCron ? "ok" : "off",
      importance: "recommended",
      detail: hasCron
        ? "Retention, reports, watches and scheduled sync endpoints are protected."
        : "CRON_SECRET is absent; recurring operational jobs are unavailable.",
    },
    {
      id: "observability",
      label: "Error reporting",
      state: hasErrorReporter() ? "ok" : "off",
      importance: "recommended",
      detail: hasErrorReporter()
        ? "External error reporting is configured."
        : "Only structured application logs are available.",
    },
    {
      id: "oauth",
      label: "GitHub sign-in",
      state: hasGithub ? "ok" : "off",
      importance: "optional",
      detail: hasGithub ? "GitHub OAuth is enabled." : "Credentials sign-in only.",
    },
    {
      id: "analytics",
      label: "Product analytics",
      state: hasAnalytics ? "ok" : "off",
      importance: "optional",
      detail: hasAnalytics ? "PostHog is configured." : "No product analytics provider is configured.",
    },
  ];
}
