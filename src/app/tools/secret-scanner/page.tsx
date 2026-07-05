import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd } from "@/components/public/JsonLd";
import { SecretScannerTool } from "@/components/tools/SecretScannerTool";
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
          subtitle="Paste code, an .env file, or logs. We flag leaked Supabase service-role keys, provider tokens, and database URLs — and tell a public anon key apart from a dangerous one. Nothing leaves your browser."
        />
        <div className="mt-10">
          <SecretScannerTool />
        </div>
      </PageShell>
      <CTABand
        title="Keys leak because they reach the browser."
        body="Suparbase proxies every Supabase request server-side, so your service-role key stays encrypted at rest and never ships to a client."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/agent-sentry", label: "How we keep keys safe" }}
      />
    </PublicLayout>
  );
}
