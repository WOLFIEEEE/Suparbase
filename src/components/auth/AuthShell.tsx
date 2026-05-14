import Link from "next/link";
import { Database, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Wordmark } from "@/components/brand/Logo";
import { cn } from "@/lib/ui/cn";

interface AuthShellProps {
  /** Sign-in / sign-up form on the left column. */
  children: React.ReactNode;
  /** Headline shown above the form. */
  title: string;
  /** Optional one-liner below the title. */
  subtitle?: React.ReactNode;
  /** Eyebrow tag above the title (e.g. "Welcome back"). */
  eyebrow?: React.ReactNode;
  /** Footnote rendered under the form. */
  footnote?: React.ReactNode;
}

/**
 * Two-column shell for /signin and /signup. The left column carries the
 * form; the right column is a brand panel with value props. Collapses to
 * a single column on screens narrower than `lg`.
 */
export function AuthShell({ children, title, subtitle, eyebrow, footnote }: AuthShellProps) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Form column */}
      <div className="relative flex flex-col bg-bg">
        <header className="flex items-center justify-between px-6 py-6 sm:px-10">
          <Link
            href="/"
            aria-label="Suparbase home"
            className="inline-flex items-center transition-colors hover:text-accent"
          >
            <Wordmark size="md" />
          </Link>
        </header>

        <main className="flex flex-1 items-start justify-center px-6 pb-12 pt-6 sm:px-10 sm:pt-10">
          <div className="w-full max-w-sm space-y-8">
            <div className="space-y-2">
              {eyebrow && (
                <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-fg-faint">
                  <span className="inline-block h-1 w-1 rounded-full bg-accent" aria-hidden />
                  {eyebrow}
                </div>
              )}
              <h1 className="font-display text-display-md leading-tight">{title}</h1>
              {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
            </div>

            {children}

            {footnote && (
              <p className="text-[11px] leading-relaxed text-fg-faint">{footnote}</p>
            )}
          </div>
        </main>

        <footer className="border-t hairline px-6 py-4 text-[11px] text-fg-faint sm:px-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>© Suparbase — encrypted credentials, server-side proxy.</span>
            <Link
              href="/"
              className="inline-flex items-center gap-1 transition-colors hover:text-fg"
            >
              ← back to home
            </Link>
          </div>
        </footer>
      </div>

      {/* Brand column */}
      <BrandPane />
    </div>
  );
}

interface ValueProp {
  icon: typeof Lock;
  title: string;
  body: string;
}

const VALUE_PROPS: ValueProp[] = [
  {
    icon: Lock,
    title: "Encrypted credentials",
    body: "Your Supabase keys are sealed with AES-256-GCM at rest. They never touch a browser.",
  },
  {
    icon: Database,
    title: "Server-side proxy",
    body: "All reads and writes route through our backend — the anon/service_role key stays on the server.",
  },
  {
    icon: Sparkles,
    title: "AI-assisted admin",
    body: "Bring an OpenRouter key and the assistant can read your schema, draft writes, and explain RLS.",
  },
  {
    icon: ShieldCheck,
    title: "Row-level audit log",
    body: "Every write is recorded with before / after snapshots so you can roll changes back later.",
  },
];

function BrandPane() {
  return (
    <aside
      className={cn(
        "relative hidden flex-col overflow-hidden border-l hairline lg:flex",
        "bg-gradient-to-br from-bg-raised via-bg to-bg-raised",
      )}
    >
      {/* Subtle radial accent in the corner */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-accent/5 blur-3xl"
      />

      {/* Hairline grid texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--fg)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--fg)) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative flex flex-1 flex-col justify-between gap-10 px-12 py-12">
        <div className="space-y-4">
          <Wordmark size="lg" />
          <p className="max-w-md text-sm leading-relaxed text-fg-muted">
            An authenticated admin workspace for any Supabase project. Bring a
            key, pick a table, ship in minutes.
          </p>
        </div>

        <ul className="space-y-5 max-w-md">
          {VALUE_PROPS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border hairline bg-bg-raised">
                <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
              </span>
              <div className="space-y-0.5">
                <h3 className="font-display text-sm leading-tight">{title}</h3>
                <p className="text-xs leading-relaxed text-fg-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="space-y-2 text-[11px] text-fg-faint">
          <p className="font-mono">
            v1.4 &middot; SQL playground, storage browser, auth users, RLS
            debugger
          </p>
          <p>
            Self-hosted? See the{" "}
            <a
              href="https://github.com/WOLFIEEEE/Suparbase"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              repo &amp; deploy guide
            </a>
            .
          </p>
        </div>
      </div>
    </aside>
  );
}
