import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd } from "@/components/public/JsonLd";
import { SchemaVisualizerTool } from "@/components/tools/SchemaVisualizerTool";
import { toolBySlug } from "@/lib/tools/registry";
import { absoluteUrl } from "@/lib/seo/site";

const tool = toolBySlug("schema-visualizer")!;

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
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      <PageShell>
        <PageHeader
          eyebrow="Free tool · runs in your browser"
          title="Schema → ERD Visualizer"
          subtitle="Paste your Postgres DDL or a pg_dump and get an entity-relationship diagram with foreign-key links. Copy the SVG straight into your docs."
        />
        <div className="mt-10">
          <SchemaVisualizerTool />
        </div>
      </PageShell>
      <CTABand
        title="Diagrams are nice. Editing the data is better."
        body="Connect a Supabase project to Suparbase and browse, edit, and bulk-operate on real rows through an encrypted server-side proxy — your key never reaches the browser."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/features", label: "See the full product" }}
      />
    </PublicLayout>
  );
}
