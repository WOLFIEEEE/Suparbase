import Link from "next/link";
import { ArrowUpRight, Heart, Server, Shield } from "lucide-react";
import { listArticles } from "@/lib/blog/articles";
import { Logo } from "@/components/brand/Logo";
import { SITE } from "@/lib/seo/site";
import { cn } from "@/lib/ui/cn";

interface Column {
  heading: string;
  links: Array<{ label: string; href: string; external?: boolean; hideWhenSignedIn?: boolean }>;
}

const COLUMNS: Column[] = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Agent Sentry", href: "/agent-sentry" },
      { label: "Use cases", href: "/use-cases" },
      // Signed-in users manage billing in /settings/billing — pricing
      // is a marketing surface they don't need to see twice.
      { label: "Pricing", href: "/pricing", hideWhenSignedIn: true },
      { label: "Changelog", href: "/changelog" },
      { label: "Sign up", href: "/signup", hideWhenSignedIn: true },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Blog", href: "/blog" },
      { label: "Guides", href: "/guides" },
      { label: "Compare", href: "/compare" },
      { label: "Learn", href: "/learn" },
      { label: "Contact", href: "mailto:hello@suparbase.com", external: true },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Contact", href: "mailto:hello@suparbase.com", external: true },
    ],
  },
];

interface FooterProps {
  isSignedIn?: boolean;
}

export function PublicFooter({ isSignedIn = false }: FooterProps) {
  const columns: Column[] = COLUMNS.map((col) => ({
    ...col,
    links: col.links.filter((l) => !(isSignedIn && l.hideWhenSignedIn)),
  }));
  const [latestArticle] = listArticles();

  return (
    <footer className="relative isolate mt-24 overflow-hidden border-t hairline bg-bg-raised/40">
      <FooterBackdrop />

      <div className="relative mx-auto w-full max-w-6xl px-6">
        <StatusBar />

        {/* Compact manifesto block: short headline + signal panel */}
        <section className="grid grid-cols-1 gap-8 py-10 md:grid-cols-[1fr_minmax(0,18rem)]">
          <div className="space-y-4">
            <h2 className="font-display text-2xl leading-tight sm:text-3xl">
              Encrypted credentials, server-side proxy,{" "}
              <span className="text-accent">AI-assisted admin.</span>
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-fg-muted">
              Free hosted tier for solo projects. Paid plans when your team needs
              unlimited connections, SSO, and longer retention.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Link
                href="/signup"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
              >
                Get started
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border hairline px-4 text-sm text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                See pricing
              </Link>
            </div>
          </div>

          {/* Signal column: live-ish signals about the project */}
          <SignalPanel latestArticleTitle={latestArticle?.title} latestArticleSlug={latestArticle?.slug} />
        </section>

        {/* Three structured columns */}
        <section className="grid grid-cols-2 gap-x-8 gap-y-10 border-t hairline py-10 sm:grid-cols-4">
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
              An admin workspace for Supabase. Encrypted credentials, server-side
              proxy, AI-assisted writes, free tier for individuals.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-fg-faint">
              <Badge icon={Shield} label="AES-256-GCM" />
              <Badge icon={Server} label="server-side proxy" />
              <Badge icon={Heart} label="free tier" />
            </div>
          </div>
          {columns.map((col) => (
            <FooterColumn key={col.heading} column={col} />
          ))}
        </section>

        {/* Legal strip */}
        <section className="flex flex-wrap items-center justify-between gap-3 border-t hairline py-6 text-[11px] text-fg-faint">
          <span>
            © {new Date().getFullYear()} Suparbase. All rights reserved.
          </span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-fg">
              Terms
            </Link>
            <a href="mailto:hello@suparbase.com" className="hover:text-fg">
              Contact
            </a>
            <span className="font-mono">v{SITE.version}</span>
          </div>
        </section>
      </div>

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
// Signal panel, the right-hand "live" pane in the manifesto block
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
          <span aria-hidden className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          live
        </span>
      </div>
      <SignalRow
        label="Latest release"
        value={`v${SITE.version}`}
        sub={LATEST_RELEASE_DATE}
        href="/changelog"
        valueTone="accent"
      />
      {latestArticleTitle && latestArticleSlug && (
        <SignalRow
          label="From the blog"
          value={truncate(latestArticleTitle, 36)}
          href={`/blog/${latestArticleSlug}`}
        />
      )}
      <SignalRow
        label="Shipped"
        value={`${FEATURES_SHIPPED} features`}
        sub="across 30 specs"
        href="/changelog"
      />
      <SignalRow
        label="Free tier"
        value="1 project · no card"
        href="/pricing"
      />
      <p className="border-t hairline pt-3 text-[10px] leading-relaxed text-fg-faint">
        Every release is a tagged git commit. No vapourware, no "coming soon."
      </p>
    </aside>
  );
}

const LATEST_RELEASE_DATE = "May 2026";
const FEATURES_SHIPPED = 30;

function SignalRow({
  label,
  value,
  sub,
  href,
  external,
  valueTone,
}: {
  label: string;
  value: string;
  sub?: string;
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
      <span className="flex flex-col items-end gap-0.5 text-right">
        <span className="inline-flex items-center gap-1">
          <span className={valueClass}>{value}</span>
          <ArrowUpRight className="h-3 w-3 text-fg-faint transition-colors group-hover:text-accent" aria-hidden />
        </span>
        {sub && <span className="font-mono text-[9px] uppercase tracking-wider text-fg-faint">{sub}</span>}
      </span>
    </>
  );
  const classes = "group flex items-start justify-between gap-3 text-[11px] transition-colors hover:text-fg";
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

      {/* Traveling accent dots, drift across the grid lines so the
          background never feels static. Different durations to keep them
          out of sync. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span className="footer-particle footer-particle-1" />
        <span className="footer-particle footer-particle-2" />
        <span className="footer-particle footer-particle-3" />
        <span className="footer-particle footer-particle-4" />
      </div>
      <style>{`
        .footer-particle {
          position: absolute;
          width: 4px; height: 4px;
          border-radius: 9999px;
          background: rgb(var(--accent));
          opacity: 0;
          filter: blur(0.5px);
          box-shadow: 0 0 12px rgb(var(--accent) / 0.45);
          will-change: transform, opacity;
        }
        @keyframes footer-drift-rt {
          0%   { transform: translate3d(-4vw, 60vh, 0); opacity: 0; }
          10%  { opacity: 0.85; }
          90%  { opacity: 0.85; }
          100% { transform: translate3d(110vw, 4vh, 0); opacity: 0; }
        }
        @keyframes footer-drift-lt {
          0%   { transform: translate3d(110vw, 70vh, 0); opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.6; }
          100% { transform: translate3d(-6vw, 0vh, 0); opacity: 0; }
        }
        .footer-particle-1 { animation: footer-drift-rt 12s linear infinite; animation-delay: 0s; }
        .footer-particle-2 { animation: footer-drift-rt 18s linear infinite; animation-delay: 4s; }
        .footer-particle-3 { animation: footer-drift-lt 16s linear infinite; animation-delay: 2s; }
        .footer-particle-4 { animation: footer-drift-lt 22s linear infinite; animation-delay: 9s; }
        @media (prefers-reduced-motion: reduce) {
          .footer-particle { animation: none !important; opacity: 0; }
        }
      `}</style>
    </>
  );
}

