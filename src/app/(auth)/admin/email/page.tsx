import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminSession } from "@/server/admin/guard";
import { getEmailConfig } from "@/server/email/resend";
import { EmailDiagnostic } from "@/components/admin/EmailDiagnostic";

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
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-display-md">Email diagnostic</h1>
        <p className="text-sm text-fg-muted">
          Snapshot of the Resend integration, plus a one-click test sender so
          you can verify the pipeline end-to-end without tailing logs.
        </p>
      </header>

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
