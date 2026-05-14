import Link from "next/link";
import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { Github } from "lucide-react";
import { LandingHero } from "@/components/landing/LandingHero";
import { Wordmark } from "@/components/brand/Logo";

const STEPS = [
  {
    k: "01",
    title: "Sign in once",
    body: "Email + password, or GitHub OAuth when the operator has enabled it. Your account holds every project you save.",
  },
  {
    k: "02",
    title: "Save your project",
    body: "Paste a Supabase URL + API key. We encrypt it with AES-256-GCM before the row is committed: the plaintext key never lives on disk.",
  },
  {
    k: "03",
    title: "Use a working admin",
    body: "Row cards, type-aware forms, FK lookups, bulk operations, CSV/JSON in + out, undoable deletes: all proxied server-side. Your key never reaches the browser.",
  },
] as const;

const PROMISES = [
  "API keys are AES-256-GCM encrypted at rest. The plaintext never persists to disk.",
  "Every PostgREST call is proxied through an authenticated route. The browser holds only a session cookie.",
  "Every write hits an audit log keyed to your account, connection, table, primary key, and verb.",
  "JWT-shaped substrings and provider keys are defensively redacted before any log line is written.",
  "Self-hostable on Coolify or any docker-compose host with zero env vars typed.",
] as const;

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/connections");

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      {/* Subtle grid backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(245 245 241 / 1) 1px, transparent 1px), linear-gradient(90deg, rgb(245 245 241 / 1) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      {/* Accent glow, one wash, top-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-[44rem] w-[44rem] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgb(182 255 60 / 0.18), rgb(182 255 60 / 0) 70%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6">
        <header className="flex h-16 items-center justify-between">
          <Link
            href="/"
            aria-label="Suparbase home"
            className="inline-flex transition-colors hover:text-accent"
          >
            <Wordmark size="lg" />
          </Link>
          <nav className="flex items-center gap-1">
            <a
              href="https://github.com/WOLFIEEEE/Suparbase"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 rounded px-3 py-1.5 text-sm text-fg-muted hover:text-fg sm:inline-flex"
              aria-label="GitHub repository"
            >
              <Github className="h-3.5 w-3.5" aria-hidden />
              GitHub
            </a>
            <Link href="/signin" className="rounded px-3 py-1.5 text-sm text-fg-muted hover:text-fg">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
            >
              Get started
            </Link>
          </nav>
        </header>

        <main className="flex flex-1 flex-col gap-16 py-12 md:gap-24 md:py-16">
          <LandingHero />

          {/* How it works: vertical numbered list, not a 3-card grid (per Constitution III). */}
          <section className="grid grid-cols-1 gap-y-8 md:grid-cols-[auto_1fr] md:gap-x-12">
            <div className="md:pt-1">
              <div className="text-[10px] uppercase tracking-[0.22em] text-fg-faint">How it works</div>
              <h2 className="mt-2 font-display text-2xl leading-tight md:text-3xl">
                Three steps,
                <br />
                no ceremony.
              </h2>
            </div>
            <ol className="space-y-7">
              {STEPS.map((s) => (
                <li key={s.k} className="flex gap-4">
                  <span
                    aria-hidden
                    className="select-none font-mono text-[11px] uppercase tracking-wider text-accent"
                  >
                    {s.k}
                  </span>
                  <div className="flex-1 space-y-1.5 border-l hairline pl-5">
                    <h3 className="font-display text-lg leading-tight">{s.title}</h3>
                    <p className="max-w-2xl text-sm text-fg-muted">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Security & operability: list inside a single surface card. */}
          <section className="surface rounded-lg p-6 sm:p-8">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[18rem_1fr]">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-fg-faint">
                  Why server-side
                </div>
                <h2 className="mt-2 font-display text-2xl leading-tight">
                  The key never reaches the browser.
                </h2>
                <p className="mt-3 max-w-md text-sm text-fg-muted">
                  Suparbase exists because "store the API key in localStorage" was
                  always a foot-gun. Every promise below is checked by the
                  pre-merge gates in our open spec-kit.
                </p>
              </div>
              <ul className="space-y-3 text-sm text-fg-muted">
                {PROMISES.map((p, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                    />
                    <span className="leading-relaxed">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t hairline pt-5 text-sm">
              <Link
                href="/signup"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-accent px-4 font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
              >
                Try it →
              </Link>
              <a
                href="https://github.com/WOLFIEEEE/Suparbase"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border hairline px-4 text-fg-muted hover:border-line-strong hover:text-fg"
              >
                <Github className="h-3.5 w-3.5" aria-hidden /> Self-host
              </a>
              <span className="ml-auto font-mono text-xs text-fg-faint">v1.0.0</span>
            </div>
          </section>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t hairline py-5 text-xs text-fg-faint">
          <span>© {new Date().getFullYear()} Suparbase · open source · encrypted at rest</span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/WOLFIEEEE/Suparbase"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-fg"
            >
              github
            </a>
            <span className="font-mono">v1.0</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
