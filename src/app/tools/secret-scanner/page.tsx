import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd } from "@/components/public/JsonLd";
import { SecretScannerTool } from "@/components/tools/SecretScannerTool";
import { ToolContent } from "@/components/tools/ToolContent";
import { toolBySlug } from "@/lib/tools/registry";
import { absoluteUrl } from "@/lib/seo/site";

const tool = toolBySlug("secret-scanner")!;

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
          eyebrow="Free tool · runs in your browser"
          title="Secret & API Key Leak Scanner"
          subtitle="Paste code, an .env file, or logs. We flag leaked Supabase service-role keys, provider tokens, and database URLs, and we tell a public anon key apart from a dangerous one. Nothing leaves your browser."
        />
        <div className="mt-10">
          <SecretScannerTool />
        </div>
      </PageShell>

      <ToolContent
        faqs={[
          {
            q: "Does my code get uploaded when I scan it?",
            a: "No. The scan runs entirely in your browser using pattern matching in JavaScript. Nothing you paste is sent to a server, logged, or stored. You can disconnect from the internet after the page loads and it still works.",
          },
          {
            q: "What is the difference between an anon key and a service-role key?",
            a: "Both are JWTs, so they look almost identical. The difference is a single claim inside them. The anon key has role set to anon and is meant to be public. The service-role key has role set to service_role, bypasses Row-Level Security, and must stay on your server. The scanner decodes the token and reads that claim, so it can tell you which one you pasted and flag the dangerous one.",
          },
          {
            q: "Is it a problem if my anon key shows up in my code?",
            a: "Usually not. The anon key is designed to ship in your client bundle, so finding it in frontend code is expected. It is only a risk if your tables lack Row-Level Security, because then the public key can read data it should not. If that worries you, run the Security Scanner to check your tables.",
          },
          {
            q: "What kinds of secrets does it detect?",
            a: "Supabase service-role and anon JWTs, Postgres and other database connection URLs with embedded passwords, provider API keys such as OpenAI and OpenRouter, Resend keys, Stripe and webhook signing secrets, GitHub tokens, bcrypt hashes, and raw symmetric keys that look like encryption or HMAC material.",
          },
          {
            q: "It flagged a string that is not actually a secret. Why?",
            a: "Pattern matching is careful but not perfect. A long random-looking string can match the shape of a key even when it is not one. Treat the results as a prompt to look, not a verdict. The severity and the type label help you judge quickly whether each hit is real.",
          },
        ]}
      >
        <h2>Find leaked API keys and secrets before you commit</h2>
        <p>
          Secrets end up in the wrong place all the time. A key gets pasted into a component to
          test something and never removed. A connection string lands in a log line. A{" "}
          <code>.env</code> file gets committed by accident. This scanner is a fast way to check
          a chunk of code, a config file, or a log before it goes somewhere public. Paste the
          text and it highlights anything that looks like a credential, with a severity and a
          short note on what to do about it.
        </p>
        <p>
          The part that matters most for Supabase projects is telling one key from another. The{" "}
          <code>anon</code> key and the <code>service_role</code> key are both JWTs and look
          nearly the same at a glance, but one is safe to publish and the other bypasses
          Row-Level Security entirely. The scanner decodes the token, reads the role claim, and
          marks a leaked service-role key as critical while treating an anon key as public by
          design.
        </p>

        <h2>What it looks for</h2>
        <ul>
          <li>Supabase service-role keys, which are critical if they ever leave your server.</li>
          <li>Supabase anon keys, flagged for awareness rather than alarm.</li>
          <li>
            Database connection URLs like <code>postgres://user:password@host/db</code>, which
            carry a password in plain sight.
          </li>
          <li>Provider API keys, including OpenAI, OpenRouter, and Resend.</li>
          <li>Webhook signing secrets and GitHub tokens.</li>
          <li>Raw symmetric keys and bcrypt hashes that should not be sitting in source.</li>
        </ul>

        <h2>Why keys leak in the first place</h2>
        <p>
          The root cause is almost always the same: a secret that needs to stay on the server
          ends up in code that ships to the browser. Client-side apps make this easy to do by
          accident, because there is no hard line between what runs on your machine and what
          runs on a stranger&apos;s. Once a service-role key is in a bundle or a public repo, it
          is compromised, and the only real fix is to rotate it.
        </p>

        <h2>The durable fix</h2>
        <p>
          Scanning catches a leak after it happens. The way to stop leaks is to never put the
          secret in the browser at all. Suparbase proxies every Supabase request through an
          authenticated server-side route, so your service-role key is encrypted at rest and
          used only on the server. The browser holds a session cookie and nothing else. Your
          keys stay where they belong.
        </p>
      </ToolContent>

      <CTABand
        title="Keys leak because they reach the browser."
        body="Suparbase proxies every Supabase request server-side, so your service-role key stays encrypted at rest and never ships to a client."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/agent-sentry", label: "How we keep keys safe" }}
      />
    </PublicLayout>
  );
}
