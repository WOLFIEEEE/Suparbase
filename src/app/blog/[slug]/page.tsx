import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicLayout } from "@/components/public/PublicLayout";
import { ArticleLayout } from "@/components/public/ArticleLayout";
import { JsonLd, articleLd, breadcrumbLd } from "@/components/public/JsonLd";
import { getArticle, listSlugs, listArticles } from "@/lib/blog/articles";
import { SITE, absoluteUrl } from "@/lib/seo/site";

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return listSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) {
    return {
      title: "Not found · Suparbase",
      robots: { index: false, follow: false },
    };
  }
  const url = absoluteUrl(`/blog/${slug}`);
  return {
    title: `${article.title} · Suparbase`,
    description: article.description,
    keywords: [...article.tags],
    alternates: { canonical: url },
    openGraph: {
      title: article.title,
      description: article.description,
      url,
      siteName: SITE.name,
      type: "article",
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt ?? article.publishedAt,
      tags: [...article.tags],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
    },
  };
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const relatedSlugs = article.related ?? [];
  const related = listArticles()
    .filter((a) => relatedSlugs.includes(a.slug))
    .map(({ body: _body, ...rest }) => rest);

  // Strip the body function from meta before passing — ArticleLayout shouldn't see it.
  const { body: BodyComponent, ...metaOnly } = article;

  return (
    <PublicLayout>
      <JsonLd
        data={articleLd({
          slug: article.slug,
          title: article.title,
          description: article.description,
          datePublished: article.publishedAt,
          dateModified: article.updatedAt,
        })}
      />
      <JsonLd
        data={breadcrumbLd([
          { label: "Home", href: "/" },
          { label: "Blog", href: "/blog" },
          { label: article.title, href: `/blog/${article.slug}` },
        ])}
      />
      <ArticleLayout meta={metaOnly} related={related}>
        <BodyComponent />
      </ArticleLayout>
    </PublicLayout>
  );
}
