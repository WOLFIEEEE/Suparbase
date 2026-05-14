import Link from "next/link";
import { Github } from "lucide-react";
import { Wordmark } from "@/components/brand/Logo";

interface Column {
  heading: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}

const COLUMNS: Column[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/changelog" },
      { label: "Sign up", href: "/signup" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Self-host guide", href: "/docs#self-host" },
      { label: "Security", href: "/docs#security" },
      { label: "GitHub", href: "https://github.com/WOLFIEEEE/Suparbase", external: true },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function PublicFooter() {
  return (
    <footer className="border-t hairline bg-bg-raised/40">
      <div className="mx-auto w-full max-w-6xl px-6 py-12 md:py-16">
        <div className="grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4">
          <div className="col-span-2 space-y-3 sm:col-span-1">
            <Wordmark size="md" />
            <p className="max-w-xs text-xs leading-relaxed text-fg-muted">
              An authenticated admin workspace for any Supabase project.
              Encrypted at rest, server-side proxied, AI-assisted.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.heading} className="space-y-3">
              <h4 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                {col.heading}
              </h4>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-fg-muted transition-colors hover:text-fg"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-sm text-fg-muted transition-colors hover:text-fg"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t hairline pt-6 text-[11px] text-fg-faint">
          <span>
            © {new Date().getFullYear()} Suparbase. Open source, MIT-licensed.
          </span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/WOLFIEEEE/Suparbase"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-fg"
            >
              <Github className="h-3 w-3" aria-hidden />
              github
            </a>
            <span className="font-mono">v1.4.0</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
