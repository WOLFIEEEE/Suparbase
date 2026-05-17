import Link from "next/link";
import { ArrowRight, Database, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Step {
  icon: typeof Database;
  title: string;
  body: string;
  highlight?: boolean;
}

const STEPS: Step[] = [
  {
    icon: Database,
    title: "Save your Supabase project",
    body: "Paste your project URL + an API key (anon or service_role). The key is encrypted with AES-256-GCM before it touches the database.",
  },
  {
    icon: Lock,
    title: "Your key never reaches the browser",
    body: "Every request goes through an authenticated server-side proxy. Your browser only holds the session cookie. Supabase keys stay on the server.",
  },
  {
    icon: Sparkles,
    title: "Operate, with AI assistance",
    body: "Browse tables, edit rows inline, bulk-update, search across every table with Cmd-K. Add an OpenRouter key in /settings/ai and the AI assistant can draft writes you confirm in a diff card.",
  },
];

/**
 * First-run onboarding for new users on the empty /connections page.
 * Three concrete steps + a single primary CTA. The same flow lives
 * in /docs#quickstart for users who want to read more before clicking.
 */
export function ConnectionsOnboarding() {
  return (
    <div className="space-y-8">
      <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((step, idx) => (
          <li key={step.title} className="relative">
            <article className="flex h-full flex-col gap-3 rounded-lg border hairline bg-bg-raised p-5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fg-faint">
                  Step {idx + 1}
                </span>
                <step.icon className="h-3.5 w-3.5 text-accent" aria-hidden />
              </div>
              <h3 className="font-display text-base">{step.title}</h3>
              <p className="text-xs leading-relaxed text-fg-muted">{step.body}</p>
            </article>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <Link href="/connections/new">
            Add your first connection
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Button>
        <Link href="/docs#quickstart" className="text-xs text-fg-muted hover:text-fg">
          Read the quickstart →
        </Link>
      </div>

      <div className="rounded-md border hairline bg-bg-raised/40 p-4 text-xs text-fg-muted">
        <p>
          <strong className="text-fg">Free plan</strong>: 1 Supabase connection, solo
          workspace, full admin surface. No credit card, no time limit. Upgrade in{" "}
          <Link href="/settings/billing" className="text-accent hover:underline">
            Billing
          </Link>{" "}
          when you need more.
        </p>
      </div>
    </div>
  );
}
