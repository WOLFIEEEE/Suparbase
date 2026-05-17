import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell } from "@/components/public/sections";
import { WelcomeClaimForm } from "@/components/checkout/WelcomeClaimForm";
import { peekWelcomeToken } from "@/server/auth/welcome-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Welcome · Suparbase",
  description: "Claim your Suparbase account after subscribing.",
  robots: { index: false, follow: false },
};

interface Params {
  token: string;
}

export default async function WelcomePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { token } = await params;
  const peek = await peekWelcomeToken(decodeURIComponent(token));

  if (!peek.ok) {
    return (
      <PublicLayout>
        <PageShell>
          <PageHeader
            eyebrow="Welcome"
            title={
              peek.reason === "expired"
                ? "This invitation has expired."
                : "We couldn't find that invitation."
            }
            subtitle={
              peek.reason === "expired"
                ? "Welcome links expire 7 days after checkout. Your subscription is still active - use forgot-password to set one now."
                : "The link is invalid or has already been used. If you've already set a password, sign in. Otherwise reach out and we'll re-send a fresh link."
            }
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/forgot"
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90"
            >
              Use forgot-password
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <Link
              href="/signin"
              className="inline-flex h-10 items-center rounded-md border hairline px-4 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
            >
              Sign in
            </Link>
            <Link
              href="/contact?topic=support"
              className="inline-flex h-10 items-center rounded-md border hairline px-4 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
            >
              Contact support
            </Link>
          </div>
        </PageShell>
      </PublicLayout>
    );
  }

  if (peek.alreadyClaimed) {
    return (
      <PublicLayout>
        <PageShell>
          <PageHeader
            eyebrow="Welcome"
            title="You already claimed this account."
            subtitle={`This invitation was used to set a password for ${peek.email}. Sign in below.`}
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/signin?email=${encodeURIComponent(peek.email)}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90"
            >
              Sign in
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <Link
              href="/forgot"
              className="inline-flex h-10 items-center rounded-md border hairline px-4 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
            >
              Forgot password
            </Link>
          </div>
        </PageShell>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Welcome to Suparbase"
          title="One last step."
          subtitle="Pick a password and we'll sign you in. Your subscription is already attached."
        />
        <div className="mt-12 max-w-md">
          <WelcomeClaimForm token={decodeURIComponent(token)} email={peek.email} />
        </div>
      </PageShell>
    </PublicLayout>
  );
}
