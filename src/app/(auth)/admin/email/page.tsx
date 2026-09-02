import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSession } from "@/server/admin/guard";
import { getEmailConfig } from "@/server/email/resend";
import { EmailDiagnostic } from "@/components/admin/EmailDiagnostic";
import { AdminPageHeader } from "@/components/admin/AdminUi";

export const metadata: Metadata = {
  title: "Admin · Email diagnostic",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminEmailPage() {
  const admin = await getAdminSession();
  if (!admin) notFound();

  const config = getEmailConfig();

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Delivery operations"
        title="Email diagnostic"
        description="Verify Resend configuration and perform a controlled end-to-end delivery test without exposing API credentials."
        actions={<Link href="/admin/users?verification=suppressed" className="inline-flex min-h-10 items-center rounded-md border hairline px-3 text-xs font-medium text-fg-muted hover:border-line-strong hover:text-fg">Suppressed accounts</Link>}
      />

      <EmailDiagnostic
        adminEmail={admin.email}
        config={{
          configured: config.configured,
          reason: config.reason ?? null,
          from: config.from,
          replyTo: config.replyTo,
        }}
      />
    </div>
  );
}
