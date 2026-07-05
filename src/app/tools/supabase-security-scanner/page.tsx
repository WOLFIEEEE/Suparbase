import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd } from "@/components/public/JsonLd";
import { SecurityScannerTool } from "@/components/tools/SecurityScannerTool";
import { ToolContent } from "@/components/tools/ToolContent";
import { toolBySlug } from "@/lib/tools/registry";
import { absoluteUrl } from "@/lib/seo/site";

const tool = toolBySlug("supabase-security-scanner")!;

export const metadata: Metadata = {
  title: `${tool.title} · Free · Suparbase`,
  description: tool.description,
  alternates: { canonical: absoluteUrl(`/tools/${tool.slug}`) },
  openGraph: { title: tool.title, description: tool.description, type: "website" },
};

export default function Page() {
  return (
    <PublicLayout>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: tool.title,
          description: tool.description,
          url: absoluteUrl(`/tools/${tool.slug}`),
          applicationCategory: "SecurityApplication",
          operatingSystem: "Web",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      <PageShell>
        <PageHeader
          eyebrow="Free tool · no login"
          title="Is your Supabase project leaking data?"
          subtitle="Paste your project URL and see exactly what an anonymous visitor can read right now: anon-readable tables, exposed PII, and a security score. Stateless, so nothing is stored."
        />
        <div className="mt-10">
          <SecurityScannerTool />
        </div>
      </PageShell>

      <ToolContent
        faqs={[
          {
            q: "Is it safe to paste my anon key here?",
            a: "Yes. The anon key is a public key by design. It already ships inside your app's JavaScript bundle, so anyone who opens your site can read it. We use it in flight to make the same read requests an anonymous visitor could make, and we never store your URL, key, or results.",
          },
          {
            q: "Does this change anything in my database?",
            a: "No. The scanner only sends read requests (HTTP GET) through your project's REST API. It never writes, updates, or deletes. It reports what an unauthenticated visitor can already see.",
          },
          {
            q: "What does the security score mean?",
            a: "The score starts at 100 and drops for each exposed table. Tables that leak sensitive columns like email, password, or api_key cost more than tables that are merely public. A score of 90 or above usually means Row-Level Security is doing its job. Anything lower is worth a closer look.",
          },
          {
            q: "It says a table is readable, but I meant it to be public. Is that a problem?",
            a: "Not necessarily. Plenty of tables are meant to be world-readable, like a list of blog posts or product categories. The scanner flags exposure so you can confirm it is intentional. The ones to worry about are tables holding user data that you never meant to expose.",
          },
          {
            q: "Why does it only work with supabase.co and supabase.in URLs?",
            a: "The public tool is limited to hosted Supabase domains. That keeps it useful for the common case and closes off a class of abuse where a public endpoint gets pointed at internal or private addresses. If you self-host Supabase, connect your project inside a Suparbase account to run the same checks.",
          },
          {
            q: "How is this different from just enabling RLS?",
            a: "Enabling RLS is the fix. This tool is the check. It tells you whether RLS is actually working on every table, including the ones you forgot about or added last week. A one-time scan is a snapshot. A Suparbase account re-runs the scan on a schedule and alerts you the moment something new gets exposed.",
          },
        ]}
      >
        <h2>What the Supabase security scanner checks</h2>
        <p>
          Most Supabase data leaks come down to one thing: a table that anyone can read
          because Row-Level Security was never turned on, or a policy that is more open than
          the developer thought. This scanner finds those tables the same way an attacker
          would. It reads your project&apos;s public API schema, then tries to read a row from
          every table using nothing but the public anon key. If a table returns rows, an
          anonymous visitor can read it too.
        </p>
        <p>
          When a readable table also contains columns that look sensitive, such as{" "}
          <code>email</code>, <code>password_hash</code>, <code>phone</code>, or{" "}
          <code>stripe_customer_id</code>, the finding is marked critical. Those are the rows
          that turn a quiet misconfiguration into a headline.
        </p>

        <h2>How to use it</h2>
        <ol>
          <li>
            Open your Supabase dashboard, go to Project Settings, then API, and copy the
            Project URL and the <code>anon</code> public key.
          </li>
          <li>Paste both into the form above and confirm you own the project.</li>
          <li>
            Run the scan. In a few seconds you get a security score and a list of every table
            an anonymous user can read, with the sensitive ones called out first.
          </li>
          <li>
            For each finding, decide whether the exposure is intended. If it is not, add a
            Row-Level Security policy to lock the table down, then scan again to confirm.
          </li>
        </ol>

        <h2>Why anonymous read access happens</h2>
        <p>
          Supabase gives every project a REST API through PostgREST. By default a new table is
          reachable through that API, and the only thing standing between a stranger and your
          rows is Row-Level Security. If you create a table in the SQL editor and forget to
          enable RLS, or you enable RLS but write a policy with <code>USING (true)</code>, the
          table is open to the anon role. It is an easy mistake to make and an easy one to
          miss, because everything keeps working in your own app.
        </p>

        <h2>What to do after you find exposure</h2>
        <p>
          The fix is almost always a Row-Level Security policy. Turn RLS on for the table, then
          write a policy that matches how the data should be reached. A per-user table usually
          wants a policy that compares a <code>user_id</code> column against{" "}
          <code>auth.uid()</code>. A table the browser should never touch wants RLS on with no
          policy at all, so only your server, using the service-role key, can read it. Our free{" "}
          <a href="/tools/rls-policy-generator">RLS policy generator</a> writes that SQL for
          you.
        </p>
        <p>
          A single scan tells you where you stand today. Schemas change, though, and the next
          table someone adds is the one that leaks. Inside a Suparbase account, Agent Sentry
          runs this probe on a schedule, keeps a history of findings, and can send a Slack or
          webhook alert the moment a new table becomes readable, so a mistake gets caught in
          minutes instead of after a breach.
        </p>
      </ToolContent>

      <CTABand
        title="One scan finds it. An account keeps watching."
        body="Continuous re-scans, one-click quarantine, and Slack alerts when a new table gets exposed."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/agent-sentry", label: "How Agent Sentry works" }}
      />
    </PublicLayout>
  );
}
