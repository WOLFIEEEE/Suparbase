import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CircleX } from "lucide-react";
import { confirmVerifyToken } from "@/server/auth/email-verification";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell } from "@/components/public/sections";

export const metadata: Metadata = {
  title: "Verify email · Suparbase",
};

interface Props {
  params: Promise<{ token: string }>;
}

/**
 * Verification landing page. Confirms the token server-side on the
 * first GET — there's no form to submit, the user clicks the link
 * from the email and we either congratulate them or explain why
 * the link is no longer valid.
 *
 * Keeping this entirely server-side has two benefits:
 *   - The URL works in any email client / browser without JS.
 *   - The token never appears in client-side state where an
 *     attacker who's set up a malicious iframe could read it.
 */
export default async function VerifyEmailPage({ params }: Props) {
  const { token } = await params;
  const result = await confirmVerifyToken(token);

  if (result.ok) {
    return (
      <PublicLayout>
        <PageShell>
          <PageHeader
            eyebrow="Verified"
            title="Email confirmed."
            subtitle={`Thanks — ${result.email} is verified. You can now receive invitations, password-reset links, and account notices from Suparbase.`}
          />
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/connections"
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Open workspace
            </Link>
            <Link
              href="/settings/account"
              className="inline-flex h-10 items-center rounded-md border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
            >
              Account settings
            </Link>
          </div>
        </PageShell>
      </PublicLayout>
    );
  }

  const reason =
    result.reason === "expired"
      ? "This link expired. Request a new verification email."
      : result.reason === "already_verified"
      ? "This email is already verified. You're good to go."
      : "This verification link isn't valid.";

  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Verification"
          title="Link not usable"
          subtitle={reason}
        />
        <div className="mt-10 flex flex-wrap items-center gap-3">
          {result.reason === "expired" && (
            <Link
              href="/settings/account"
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
            >
              Request a new link
            </Link>
          )}
          <Link
            href="/signin"
            className="inline-flex h-10 items-center gap-1.5 rounded-md border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
          >
            <CircleX className="h-4 w-4" aria-hidden />
            Back to sign in
          </Link>
        </div>
      </PageShell>
    </PublicLayout>
  );
}
