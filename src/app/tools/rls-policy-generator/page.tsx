import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd } from "@/components/public/JsonLd";
import { RlsGeneratorTool } from "@/components/tools/RlsGeneratorTool";
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
      <CTABand
        title="Test these against real roles."
        body="Suparbase's RLS debugger simulates any policy as anon / authenticated / a specific user, live against your project — so you know it's right before you ship."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/features", label: "See the full product" }}
      />
    </PublicLayout>
  );
}
