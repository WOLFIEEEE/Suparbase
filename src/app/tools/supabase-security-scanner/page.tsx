import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd } from "@/components/public/JsonLd";
import { SecurityScannerTool } from "@/components/tools/SecurityScannerTool";
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
          subtitle="Paste your project URL and see exactly what an anonymous visitor can read right now — anon-readable tables, exposed PII, and a security score. Stateless: nothing is stored."
        />
        <div className="mt-10">
          <SecurityScannerTool />
        </div>
      </PageShell>
      <CTABand
        title="One scan finds it. An account keeps watching."
        body="Continuous re-scans, one-click quarantine, and Slack alerts when a new table gets exposed."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/agent-sentry", label: "How Agent Sentry works" }}
      />
    </PublicLayout>
  );
}
