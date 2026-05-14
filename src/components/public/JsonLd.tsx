import { SITE, absoluteUrl } from "@/lib/seo/site";

interface JsonLdProps {
  data: Record<string, unknown>;
}

/**
 * Server component that emits a `<script type="application/ld+json">`
 * tag. Use to attach structured data to a page (Article, Organization,
 * BreadcrumbList, etc.) so search engines can render rich results.
 */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers for the common JSON-LD shapes we emit
// ---------------------------------------------------------------------------

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    logo: absoluteUrl("/icon.svg"),
    sameAs: [SITE.github],
  };
}

export function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
    },
  };
}

interface ArticleLdInput {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
}

export function articleLd({ slug, title, description, datePublished, dateModified }: ArticleLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    description,
    datePublished,
    dateModified: dateModified ?? datePublished,
    author: {
      "@type": "Organization",
      name: SITE.authorName,
      url: SITE.authorUrl,
    },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: { "@type": "ImageObject", url: absoluteUrl("/icon.svg") },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(`/blog/${slug}`) },
    url: absoluteUrl(`/blog/${slug}`),
  };
}

interface BreadcrumbStep {
  label: string;
  href: string;
}

export function breadcrumbLd(steps: BreadcrumbStep[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: steps.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.label,
      item: absoluteUrl(s.href),
    })),
  };
}
