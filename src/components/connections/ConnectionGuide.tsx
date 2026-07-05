import { ExternalLink, KeyRound, Link2, ShieldCheck, Table2 } from "lucide-react";

interface Step {
  icon: typeof KeyRound;
  title: string;
  body: React.ReactNode;
  optional?: boolean;
}

const STEPS: Step[] = [
  {
    icon: ExternalLink,
    title: "Open your Supabase dashboard",
    body: (
      <>
        Sign in and pick the project you want to manage. If you do not have one
        yet, create a free project first.
      </>
    ),
  },
  {
    icon: Link2,
    title: "Copy the Project URL",
    body: (
      <>
        Go to <strong className="text-fg">Project Settings, then API</strong>.
        Copy the <strong className="text-fg">Project URL</strong> (it looks like{" "}
        <code className="font-mono">https://abcd.supabase.co</code>) and paste it into
        the <strong className="text-fg">Project URL</strong> field.
      </>
    ),
  },
  {
    icon: KeyRound,
    title: "Copy the anon public key",
    body: (
      <>
        On the same page, under <strong className="text-fg">Project API keys</strong>,
        copy the <strong className="text-fg">anon public</strong> key and paste it into
        the <strong className="text-fg">API key</strong> field. The anon key is safe to
        use here and is encrypted before it touches our database.
      </>
    ),
  },
  {
    icon: Table2,
    title: "Name it and create the connection",
    body: (
      <>
        Give it a label you will recognise, like{" "}
        <code className="font-mono">my-app prod</code>, then press{" "}
        <strong className="text-fg">Create connection</strong>. You land straight in the
        workspace.
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Add the Direct Postgres URL",
    optional: true,
    body: (
      <>
        For the SQL playground, RLS debugger, and session undo, open{" "}
        <strong className="text-fg">Project Settings, then Database, then Connection
        string</strong>, and paste the <code className="font-mono">postgres://</code>{" "}
        URI into the optional field on the right. You can also add this later from
        connection settings.
      </>
    ),
  },
];

/**
 * Numbered walkthrough shown beside the connection form so a first-time user
 * knows exactly where each value comes from in the Supabase dashboard.
 */
export function ConnectionGuide() {
  return (
    <aside aria-label="How to connect a Supabase project" className="space-y-5">
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-[0.22em] text-fg-faint">
          Step by step
        </div>
        <h2 className="font-display text-lg leading-tight">Where to find each value</h2>
      </div>

      <ol className="space-y-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 font-mono text-[11px] text-accent"
            >
              {i + 1}
            </span>
            <div className="space-y-0.5">
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-fg">
                <step.icon className="h-3.5 w-3.5 text-accent" aria-hidden />
                {step.title}
                {step.optional && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
                    optional
                  </span>
                )}
              </h3>
              <p className="text-xs leading-relaxed text-fg-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <a
        href="https://supabase.com/dashboard/project/_/settings/api"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border hairline px-3 py-2 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
      >
        Open Supabase API settings
        <ExternalLink className="h-3 w-3" aria-hidden />
      </a>

      <p className="rounded-md border hairline bg-bg-sunken/40 p-3 text-[11px] leading-relaxed text-fg-muted">
        <strong className="text-fg">anon vs service_role.</strong> Use the{" "}
        <strong className="text-fg">anon</strong> key. The service_role key bypasses
        Row-Level Security, so we warn you before saving one. Either way the key is
        proxied server-side and never reaches the browser after this form.
      </p>
    </aside>
  );
}
