import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd } from "@/components/public/JsonLd";
import { RlsGeneratorTool } from "@/components/tools/RlsGeneratorTool";
import { ToolContent } from "@/components/tools/ToolContent";
import { toolBySlug } from "@/lib/tools/registry";
import { absoluteUrl } from "@/lib/seo/site";

const tool = toolBySlug("rls-policy-generator")!;

export const metadata: Metadata = {
  title: `${tool.title} + Explainer · Free · Suparbase`,
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
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      <PageShell>
        <PageHeader
          eyebrow="Free tool · runs in your browser"
          title="RLS Policy Generator & Explainer"
          subtitle="Row-Level Security is where most Supabase leaks come from. Generate correct policies from a pattern, or paste a policy to see in plain English exactly what it allows."
        />
        <div className="mt-10">
          <RlsGeneratorTool />
        </div>
      </PageShell>

      <ToolContent
        faqs={[
          {
            q: "What is Row-Level Security in Supabase?",
            a: "Row-Level Security, or RLS, is a Postgres feature that decides which rows a given user is allowed to see or change. Supabase leans on it heavily: the anon and authenticated API roles can only reach a table the way its RLS policies allow. Turn RLS on, write policies, and the same query returns different rows depending on who is asking.",
          },
          {
            q: "Do these policies work with Supabase auth?",
            a: "Yes. The generated policies use auth.uid() and auth.jwt(), which are the helper functions Supabase exposes inside Postgres. A policy that compares user_id to auth.uid() lets a signed-in user reach only their own rows, with no extra backend code.",
          },
          {
            q: "What is the difference between USING and WITH CHECK?",
            a: "USING controls which existing rows a policy applies to, so it governs reads, updates, and deletes. WITH CHECK controls which new or changed rows are allowed, so it governs inserts and updates. A safe owner policy usually sets both to the same condition, so a user can neither read nor write rows that belong to someone else.",
          },
          {
            q: "If I turn on RLS with no policy, what happens?",
            a: "The table is locked to the anon and authenticated roles. They get nothing back, because RLS denies by default and there is no policy to allow anything. Only the service-role key, which bypasses RLS and is meant for server use, can still read and write. That is exactly what you want for a table the browser should never touch directly.",
          },
          {
            q: "Does this tool send my schema anywhere?",
            a: "No. The generator and the explainer both run entirely in your browser. Nothing you type is uploaded, logged, or stored. You can use it offline once the page has loaded.",
          },
          {
            q: "How do I test that a policy actually works?",
            a: "The generator writes correct SQL, but you still want to see it in action against real roles. A Suparbase account includes an RLS simulator that runs any query as anon, as authenticated, or as a specific user, live against your project, so you can confirm a policy allows and blocks exactly what you expect before you ship it.",
          },
        ]}
      >
        <h2>Generate Supabase RLS policies from a pattern</h2>
        <p>
          Row-Level Security is the single most important setting in a Supabase project, and it
          is also the one people get wrong most often. The syntax is not hard, but the details
          matter: the wrong role, a missing <code>WITH CHECK</code>, or a stray{" "}
          <code>USING (true)</code> quietly opens a table to the whole internet. This generator
          removes the guesswork. Pick the access pattern you actually want and it writes
          policies that follow it exactly.
        </p>
        <p>The patterns cover the cases that come up again and again:</p>
        <ul>
          <li>
            <strong>Owner-only.</strong> Each user reads and writes only their own rows, matched
            by a <code>user_id</code> column against <code>auth.uid()</code>. This is the right
            default for profiles, orders, messages, and anything tied to one account.
          </li>
          <li>
            <strong>Public read, no writes.</strong> Anyone can select, nobody can change
            anything through the API. Good for published content and reference data.
          </li>
          <li>
            <strong>Authenticated read or read and write.</strong> Any signed-in user can reach
            the table. Useful for shared, non-sensitive data inside an app.
          </li>
          <li>
            <strong>Admin claim only.</strong> Access is gated on a claim in the JWT, so only
            tokens you mark as admin get through.
          </li>
          <li>
            <strong>Service-role only.</strong> RLS on, no policy. The table is invisible to the
            browser and reachable only from your server. The safest option for secrets and
            internal tables.
          </li>
        </ul>

        <h2>Explain a policy you already have</h2>
        <p>
          Inheriting a Supabase project often means inheriting policies nobody remembers writing.
          Paste a <code>CREATE POLICY</code> statement into the explain tab and the tool
          describes, in plain English, who it lets in, which commands it covers, and what its{" "}
          <code>USING</code> and <code>WITH CHECK</code> conditions require. If a policy is
          effectively public, it says so, so you can catch an accidental <code>USING (true)</code>{" "}
          before it becomes a problem.
        </p>

        <h2>A quick example</h2>
        <p>
          Say you have an <code>orders</code> table with a <code>user_id</code> column. You want
          every customer to see and manage their own orders and nobody else&apos;s. Pick the
          owner-only pattern, set the owner column to <code>user_id</code>, and you get four
          policies, one each for select, insert, update, and delete, all keyed on{" "}
          <code>user_id = auth.uid()</code>. Paste the result into the Supabase SQL editor and
          the table is locked down in one run.
        </p>
      </ToolContent>

      <CTABand
        title="Test these against real roles."
        body="Suparbase's RLS debugger simulates any policy as anon, authenticated, or a specific user, live against your project, so you know it's right before you ship."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/features", label: "See the full product" }}
      />
    </PublicLayout>
  );
}
