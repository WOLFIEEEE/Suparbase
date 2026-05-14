import Link from "next/link";
import { ArrowUpRight, Github, Heart, Server, Shield } from "lucide-react";
import { listArticles } from "@/lib/blog/articles";
import { Logo } from "@/components/brand/Logo";
import { SITE } from "@/lib/seo/site";
import { cn } from "@/lib/ui/cn";

interface Column {
  heading: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}

const COLUMNS: Column[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Use cases", href: "/use-cases" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/changelog" },
      { label: "Sign up", href: "/signup" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Blog", href: "/blog" },
      { label: "Self-host", href: "/docs#self-host" },
      { label: "Security", href: "/docs#security" },
      { label: "GitHub", href: SITE.github, external: true },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Contact", href: "mailto:hello@suparbase.dev", external: true },
    ],
  },
];

export function PublicFooter() {
  const [latestArticle] = listArticles();

  return (
    <footer className="relative isolate mt-24 overflow-hidden border-t hairline bg-bg-raised/40">
      <FooterBackdrop />

      <div className="relative mx-auto w-full max-w-6xl px-6">
        <StatusBar />

        {/* Manifesto block */}
        <section className="grid grid-cols-1 gap-10 py-14 md:grid-cols-[1fr_minmax(0,18rem)] md:py-20">
          <div className="space-y-6">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint">
              <span className="text-accent">~/suparbase</span> $ ship --everywhere
              <span aria-hidden className="ml-0.5 inline-block h-3 w-[6px] -mb-[2px] animate-pulse bg-accent align-baseline" />
            </div>
            <h2 className="font-display text-3xl leading-[1.05] sm:text-4xl md:text-[2.75rem]">
              Encrypted credentials.
              <br />
              Server-side proxy.
              <br />
              <span className="text-accent">AI-assisted admin.</span>
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-fg-muted">
              The database tool you would have built &mdash; if you weren&apos;t
              busy shipping the rest of the product. Free to self-host, open
              under MIT, with a hosted plan when you don&apos;t want to operate
              it yourself.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
              >
                Get started
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
              <a
                href={SITE.github}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-1.5 rounded-md border hairline px-5 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                <Github className="h-4 w-4" aria-hidden />
                Star on GitHub
              </a>
            </div>
          </div>

          {/* Signal column: live-ish signals about the project */}
          <SignalPanel latestArticleTitle={latestArticle?.title} latestArticleSlug={latestArticle?.slug} />
        </section>

        {/* Three structured columns */}
        <section className="grid grid-cols-2 gap-x-8 gap-y-10 border-t hairline py-12 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Link
              href="/"
              aria-label="Suparbase home"
              className="inline-flex items-center gap-2 text-fg transition-colors hover:text-accent"
            >
              <Logo className="h-5 w-5" />
              <span className="font-display tracking-tight">suparbase</span>
            </Link>
            <p className="mt-3 max-w-xs text-[11px] leading-relaxed text-fg-muted">
              An open-source admin workspace for Supabase. Same encryption,
              same proxy, same AI-assisted writes whether you self-host or
              use the hosted plan.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-fg-faint">
              <Badge icon={Shield} label="AES-256-GCM" />
              <Badge icon={Server} label="server-side proxy" />
              <Badge icon={Heart} label="MIT" />
            </div>
          </div>
          {COLUMNS.map((col) => (
            <FooterColumn key={col.heading} column={col} />
          ))}
        </section>

        {/* Legal strip */}
        <section className="flex flex-wrap items-center justify-between gap-3 border-t hairline py-6 text-[11px] text-fg-faint">
          <span>
            © {new Date().getFullYear()} Suparbase. Open source, MIT-licensed. Hosted with care.
          </span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-fg">
              Terms
            </Link>
            <a href={SITE.github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-fg">
              <Github className="h-3 w-3" aria-hidden />
              github
            </a>
            <span className="font-mono">v{SITE.version}</span>
          </div>
        </section>
      </div>

      {/* SIGNATURE: massive wordmark across the full width */}
      <GiantWordmark />
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

function StatusBar() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline py-3 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-50" />
            <span className="relative inline-block h-2 w-2 rounded-full bg-accent" />
          </span>
          <span className="text-fg">System operational</span>
        </span>
        <span className="hidden font-mono text-fg-faint sm:inline">
          last deploy &middot; minutes ago
        </span>
      </div>
      <div className="flex items-center gap-4 font-mono">
        <span>node 20.x</span>
        <span className="hidden sm:inline">postgres 16</span>
        <span className="text-accent">v{SITE.version}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signal panel — the right-hand "live" pane in the manifesto block
// ---------------------------------------------------------------------------

interface SignalPanelProps {
  latestArticleTitle?: string;
  latestArticleSlug?: string;
}

function SignalPanel({ latestArticleTitle, latestArticleSlug }: SignalPanelProps) {
  return (
    <aside className="relative space-y-3 self-start rounded-lg border hairline bg-bg p-5 text-xs">
      <div className="flex items-center justify-between gap-2 border-b hairline pb-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
          Signal
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-fg-faint">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-accent" /> live
        </span>
      </div>
      <SignalRow
        label="Latest release"
        value={`v${SITE.version}`}
        href="/changelog"
        valueTone="accent"
      />
      {latestArticleTitle && latestArticleSlug && (
        <SignalRow
          label="Just published"
          value={truncate(latestArticleTitle, 38)}
          href={`/blog/${latestArticleSlug}`}
        />
      )}
      <SignalRow
        label="Open features"
        value="9 in production"
        href="/features"
      />
      <SignalRow
        label="Specs in repo"
        value="19, public"
        href={SITE.github}
        external
      />
      <p className="border-t hairline pt-3 text-[10px] leading-relaxed text-fg-faint">
        Every release maps to a markdown spec in the open repo. The roadmap is
        just <code className="font-mono text-fg-muted">specs/0XX-name/</code>.
      </p>
    </aside>
  );
}

function SignalRow({
  label,
  value,
  href,
  external,
  valueTone,
}: {
  label: string;
  value: string;
  href: string;
  external?: boolean;
  valueTone?: "accent";
}) {
  const valueClass = cn(
    "font-mono text-fg",
    valueTone === "accent" && "text-accent",
  );
  const body = (
    <>
      <span className="text-fg-faint">{label}</span>
      <span className="flex items-center gap-1">
        <span className={valueClass}>{value}</span>
        <ArrowUpRight className="h-3 w-3 text-fg-faint transition-colors group-hover:text-accent" aria-hidden />
      </span>
    </>
  );
  const classes = "group flex items-center justify-between gap-3 text-[11px] transition-colors hover:text-fg";
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
      {body}
    </a>
  ) : (
    <Link href={href} className={classes}>
      {body}
    </Link>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

function FooterColumn({ column }: { column: Column }) {
  return (
    <div className="space-y-3">
      <h4 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">{column.heading}</h4>
      <ul className="space-y-2">
        {column.links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a
                href={l.href}
                target={l.href.startsWith("http") ? "_blank" : undefined}
                rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="group inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
              >
                {l.label}
                <ArrowUpRight
                  className="h-3 w-3 -translate-x-0.5 -translate-y-0.5 opacity-0 transition-all group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100"
                  aria-hidden
                />
              </a>
            ) : (
              <Link
                href={l.href}
                className="group inline-flex items-center gap-1 text-sm text-fg-muted transition-colors hover:text-fg"
              >
                {l.label}
                <ArrowUpRight
                  className="h-3 w-3 -translate-x-1 -translate-y-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100"
                  aria-hidden
                />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand badges
// ---------------------------------------------------------------------------

function Badge({ icon: Icon, label }: { icon: typeof Shield; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border hairline bg-bg/60 px-2 py-0.5 font-mono">
      <Icon className="h-2.5 w-2.5 text-accent" aria-hidden />
      <span className="text-fg-muted">{label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Backdrop: hairline grid + accent glow
// ---------------------------------------------------------------------------

function FooterBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--fg)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--fg)) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-0 h-[28rem] w-[28rem] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgb(var(--accent) / 0.18), rgb(var(--accent) / 0) 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 h-[32rem] w-[32rem] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgb(var(--accent) / 0.08), rgb(var(--accent) / 0) 70%)",
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// The signature: a massive, partially-clipped wordmark spanning the viewport
// ---------------------------------------------------------------------------

function GiantWordmark() {
  return (
    <div
      aria-hidden
      className="relative -mb-2 mt-2 flex select-none items-end justify-center overflow-hidden"
    >
      {/* The wordmark itself — uses currentColor with low opacity so it reads
          as a decorative texture rather than a headline. The period turns
          into the brand mark. */}
      <span
        className={cn(
          "font-display font-bold leading-[0.85] tracking-[-0.06em]",
          "text-[clamp(5rem,18vw,16rem)]",
          "bg-gradient-to-b from-fg/[0.07] via-fg/[0.04] to-transparent bg-clip-text text-transparent",
        )}
      >
        suparbase
        <span className="inline-block translate-y-[0.04em] text-accent/40">.</span>
      </span>
    </div>
  );
}
