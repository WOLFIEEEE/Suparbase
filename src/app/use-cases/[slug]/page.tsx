import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicLayout } from "@/components/public/PublicLayout";
import { JsonLd, breadcrumbLd } from "@/components/public/JsonLd";
import { getUseCase, listUseCases } from "@/lib/use-cases/registry";
import { SITE, absoluteUrl } from "@/lib/seo/site";

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return listUseCases().map((u) => ({ slug: u.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const useCase = getUseCase(slug);
  if (!useCase) {
    return { title: "Not found · Suparbase", robots: { index: false, follow: false } };
  }
  const url = absoluteUrl(`/use-cases/${slug}`);
  return {
    title: `${useCase.title} · Suparbase`,
    description: useCase.description,
    alternates: { canonical: url },
    openGraph: {
      title: useCase.title,
      description: useCase.description,
      url,
      siteName: SITE.name,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: useCase.title,
      description: useCase.description,
    },
  };
}

export default async function UseCasePage({ params }: Params) {
  const { slug } = await params;
  const useCase = getUseCase(slug);
  if (!useCase) notFound();
  const Body = useCase.body;
  return (
    <PublicLayout>
      <JsonLd
        data={breadcrumbLd([
          { label: "Home", href: "/" },
          { label: "Use cases", href: "/use-cases" },
          { label: useCase.title, href: `/use-cases/${useCase.slug}` },
        ])}
      />
      <Body />
    </PublicLayout>
  );
}
