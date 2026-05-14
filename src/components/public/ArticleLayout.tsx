import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen, Clock, Tag } from "lucide-react";
import type { ArticleMeta } from "@/lib/blog/articles";
import { Prose } from "@/components/public/sections";
import { cn } from "@/lib/ui/cn";

interface Props {
  meta: Omit<ArticleMeta, "body">;
  related: Array<Omit<ArticleMeta, "body">>;
  children: React.ReactNode;
}

export function ArticleLayout({ meta, related, children }: Props) {
  const published = formatDate(meta.publishedAt);
  const updated = meta.updatedAt ? formatDate(meta.updatedAt) : null;

  return (
    <article>
      <div className="mx-auto w-full max-w-5xl px-6 py-12 md:py-16">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          All articles
        </Link>

        <header className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            <span className="inline-flex items-center gap-1">
              <BookOpen className="h-3 w-3" aria-hidden /> Article
            </span>
            {meta.tags.slice(0, 4).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-fg-muted">
                <Tag className="h-3 w-3 text-fg-faint" aria-hidden />
                {t}
              </span>
            ))}
          </div>

          <h1 className="font-display text-3xl leading-[1.1] sm:text-4xl md:text-5xl">
            {meta.title}
          </h1>

          <p className="max-w-3xl text-base leading-relaxed text-fg-muted md:text-lg">
            {meta.description}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-faint">
            <time dateTime={meta.publishedAt}>
              Published {published}
            </time>
            {updated && updated !== published && (
              <time dateTime={meta.updatedAt}>· Updated {updated}</time>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden /> {meta.readingMinutes} min read
            </span>
          </div>
        </header>
      </div>

      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-10 px-6 pb-20 md:grid-cols-[14rem_1fr]">
        {meta.toc.length > 0 && (
          <aside className="md:sticky md:top-20 md:self-start">
            <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
              On this page
            </p>
            <nav>
              <ol className="space-y-1.5 border-l hairline pl-3 text-[13px]">
                {meta.toc.map((t) => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      className="block text-fg-muted transition-colors hover:text-accent"
                    >
                      {t.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
        )}
        <div className="min-w-0">
          <Prose>{children}</Prose>

          <div className="mt-12 rounded-lg border hairline bg-bg-raised/40 p-5">
            <p className="text-xs text-fg-muted">
              Suparbase is an open-source admin workspace for Supabase. Encrypted
              credentials, server-side proxy, RLS debugger, SQL playground, AI
              assistant with diff-confirmed writes.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-9 items-center gap-1 rounded-md bg-accent px-3.5 text-xs font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
              >
                Try Suparbase free
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
              <Link
                href="/features"
                className="text-xs text-accent hover:underline"
              >
                See all features
              </Link>
            </div>
          </div>

          {related.length > 0 && (
            <section className="mt-14 border-t hairline pt-10">
              <h2 className="font-display text-xl">Related articles</h2>
              <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {related.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/blog/${r.slug}`}
                      className={cn(
                        "group flex h-full flex-col justify-between rounded-lg border hairline bg-bg-raised p-4 transition-colors",
                        "hover:border-line-strong hover:bg-bg-raised/90",
                      )}
                    >
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.16em] text-fg-faint">
                          {r.tags.slice(0, 2).join(" · ")}
                        </div>
                        <h3 className="mt-2 font-display text-base leading-tight">
                          {r.title}
                        </h3>
                        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-fg-muted">
                          {r.description}
                        </p>
                      </div>
                      <div className="mt-3 inline-flex items-center gap-1 text-[11px] text-fg-faint group-hover:text-accent">
                        Read article <ArrowRight className="h-3 w-3" aria-hidden />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </article>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
