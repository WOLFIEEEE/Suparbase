import type { Metadata } from "next";
import Link from "next/link";
import { Lock, MessageCircle, Shield } from "lucide-react";
import { PublicLayout } from "@/components/public/PublicLayout";
import { PageHeader, PageShell } from "@/components/public/sections";
import { ContactForm } from "@/components/contact/ContactForm";
import { isEmailConfigured } from "@/server/email/resend";
import type { ContactTopic } from "@/lib/contact/topics";
import { CONTACT_TOPIC_VALUES } from "@/lib/contact/topics";

export const metadata: Metadata = {
  title: "Contact · Suparbase",
  description:
    "Send a message to the Suparbase team. General questions, sales for the Team plan, support, security disclosures, and press inquiries.",
};

interface SearchParams {
  topic?: string;
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requestedTopic = params.topic;
  const initialTopic: ContactTopic =
    typeof requestedTopic === "string" &&
    (CONTACT_TOPIC_VALUES as readonly string[]).includes(requestedTopic)
      ? (requestedTopic as ContactTopic)
      : "general";

  const emailReady = isEmailConfigured();

  return (
    <PublicLayout>
      <PageShell>
        <PageHeader
          eyebrow="Contact"
          title="Talk to a human."
          subtitle="One inbox, one operator, no auto-responders. We read every message and reply within one business day."
        />

        <div className="mt-12 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_18rem]">
          <div className="min-w-0">
            {!emailReady && (
              <div
                role="status"
                className="mb-6 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-warn-fg"
              >
                <strong className="font-medium">Heads up:</strong> this
                deployment doesn&rsquo;t have transactional email wired up
                yet. You can still submit the form, but the operator will
                only see it in server logs until Resend is configured.
              </div>
            )}
            <ContactForm initialTopic={initialTopic} />
          </div>

          <aside className="space-y-5 text-sm">
            <SideCard
              icon={MessageCircle}
              title="General &amp; sales"
              body={
                <>
                  Pick <em>General question</em> or <em>Sales / Team plan</em>{" "}
                  above. Sales is for the upcoming Team plan (multi-user
                  workspaces, SSO, longer retention).
                </>
              }
            />
            <SideCard
              icon={Shield}
              title="Security disclosures"
              body={
                <>
                  Pick <em>Security report</em> and include a reproduction.
                  Our full disclosure policy (scope, response SLA) lives on{" "}
                  <Link href="/security.txt" className="text-accent hover:underline">
                    /security.txt
                  </Link>
                  . We acknowledge within 24 hours.
                </>
              }
            />
            <SideCard
              icon={Lock}
              title="Privacy"
              body={
                <>
                  Submissions are emailed to a single inbox. We don&rsquo;t
                  use a CRM, don&rsquo;t enrich your address, and never
                  share it. See{" "}
                  <Link href="/privacy" className="text-accent hover:underline">
                    /privacy
                  </Link>
                  .
                </>
              }
            />
          </aside>
        </div>
      </PageShell>
    </PublicLayout>
  );
}

function SideCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  body: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border hairline bg-bg-raised/40 p-4">
      <div className="flex items-center gap-2 text-fg">
        <Icon className="h-4 w-4 text-accent" aria-hidden />
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">{body}</p>
    </div>
  );
}
