import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import type { OnboardingState } from "@/server/onboarding";
import { DismissChecklistButton } from "./DismissChecklistButton";

interface Item {
  done: boolean;
  title: string;
  body: string;
  href: string;
  cta: string;
  optional?: boolean;
}

/**
 * The post-first-connection half of the signup funnel: a live checklist
 * on /connections that tracks real account state (Direct Postgres URL,
 * first Sentry scan, AI key) and deep-links each step. Auto-hides once
 * the core steps are done; dismissible any time.
 */
export function GettingStartedChecklist({ state }: { state: OnboardingState }) {
  const c = state.firstConnectionId;
  const items: Item[] = [
    {
      done: state.steps.addConnection,
      title: "Save your Supabase project",
      body: "Project URL + API key, encrypted before it touches disk.",
      href: "/connections/new",
      cta: "Add connection",
    },
    {
      done: state.steps.directPostgresUrl,
      title: "Add the Direct Postgres URL",
      body: "Unlocks the SQL playground, RLS debugger, session undo, and database sync.",
      href: c ? `/c/${c}/settings` : "/connections/new",
      cta: "Open settings",
    },
    {
      done: state.steps.sentryScan,
      title: "Run your first Sentry scan",
      body: "One click checks every table for anon-readable data and RLS drift.",
      href: c ? `/c/${c}/sentry` : "/connections/new",
      cta: "Open Sentry",
    },
    {
      done: state.steps.aiConfigured,
      title: "Connect an AI model",
      body: "Bring an OpenRouter key and the assistant drafts writes you approve in a diff card.",
      href: "/settings/ai",
      cta: "AI settings",
      optional: true,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;

  return (
    <section
      aria-label="Getting started checklist"
      className="surface space-y-4 rounded-md p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-fg-faint">
            Getting started · {doneCount}/{items.length}
          </h2>
          <p className="text-xs text-fg-muted">
            Finish setting up your workspace. This card disappears once the core steps are
            done.
          </p>
        </div>
        <DismissChecklistButton />
      </header>

      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.title}>
            <article
              className={`flex h-full flex-col gap-2 rounded-lg border hairline p-4 ${
                item.done ? "bg-bg-raised/40 opacity-70" : "bg-bg-raised"
              }`}
            >
              <div className="flex items-center gap-2">
                {item.done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
                )}
                <h3 className="font-display text-sm">
                  {item.title}
                  {item.optional && (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                      optional
                    </span>
                  )}
                </h3>
              </div>
              <p className="text-xs leading-relaxed text-fg-muted">{item.body}</p>
              {!item.done && (
                <Link
                  href={item.href}
                  className="mt-auto inline-flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  {item.cta}
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </Link>
              )}
              {item.done && (
                <span className="mt-auto text-xs text-fg-faint" aria-label="Step complete">
                  Done
                </span>
              )}
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
