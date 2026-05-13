import Link from "next/link";
import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { LandingHero } from "@/components/landing/LandingHero";
import { Wordmark } from "@/components/brand/Logo";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/connections");

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(245 245 241 / 1) 1px, transparent 1px), linear-gradient(90deg, rgb(245 245 241 / 1) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
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
          <Link href="/" aria-label="Suparbase home" className="inline-flex transition-colors hover:text-accent">
            <Wordmark size="lg" />
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/signin"
              className="rounded px-3 py-1.5 text-fg-muted hover:text-fg"
            >
              Sign in
            </Link>
            <Link
              href="/signin"
              className="rounded bg-accent px-3 py-1.5 font-medium text-accent-fg hover:bg-accent/90"
            >
              Get started
            </Link>
          </nav>
        </header>

        <main className="flex flex-1 flex-col justify-center gap-12 py-12 md:gap-16">
          <LandingHero />

          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              {
                k: "01",
                title: "Sign in once",
                body: "GitHub OAuth. Your account holds every project you save.",
              },
              {
                k: "02",
                title: "Save your project",
                body: "Paste a Supabase URL + key. We encrypt it with AES-256-GCM before the row is even committed.",
              },
              {
                k: "03",
                title: "Use a working admin",
                body: "Data grid, type-aware forms, FK lookups, undoable deletes — all proxied server-side. Your key never reaches the browser.",
              },
            ].map((it) => (
              <article
                key={it.k}
                className="surface rounded p-5"
              >
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-accent">{it.k}</div>
                <h2 className="mb-1 font-display text-xl">{it.title}</h2>
                <p className="text-sm text-fg-muted">{it.body}</p>
              </article>
            ))}
          </section>

          <section className="surface rounded p-6 sm:p-8">
            <h2 className="mb-2 font-display text-2xl">Why server-side, not browser-side?</h2>
            <ul className="space-y-2 text-sm text-fg-muted">
              <li>· Your API key is AES-256-GCM encrypted at rest, in our database.</li>
              <li>· Every PostgREST call is proxied through an authenticated route — the browser never holds the key in memory.</li>
              <li>· Every write is recorded in an audit log keyed to your account and connection.</li>
              <li>· The proxy can be self-hosted; the code is open. <Link href="/signin" className="text-accent underline-offset-4 hover:underline">Try it.</Link></li>
            </ul>
          </section>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t hairline py-4 text-xs text-fg-faint">
          <span>© 2026 Suparbase · client + server, encrypted at rest</span>
          <span className="font-mono">v0.2</span>
        </footer>
      </div>
    </div>
  );
}
