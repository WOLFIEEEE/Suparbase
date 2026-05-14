import Link from "next/link";
import { ArrowRight, Coffee, FastForward, History, Lock, Sparkles, Zap } from "lucide-react";
import { CTABand, PageHeader, PageShell, SectionHeading } from "@/components/public/sections";

export const meta = {
  slug: "indie-hackers",
  title: "Suparbase for Indie Hackers",
  description:
    "Solo founders shipping side projects use Suparbase as the admin they would have built. Zero ops, encrypted credentials, AI-assisted writes.",
  audience: "Indie hackers and solo founders",
  bullets: [
    "Five minutes to first connection, free forever to self-host",
    "AI chat for the SQL you don't want to write",
    "Inline cell editing on the row detail page",
    "Audit log so you can answer support tickets accurately",
  ],
} as const;

export function Page() {
  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow="Use case · Indie hackers"
          title={
            <>
              The admin you were
              <br className="hidden sm:inline" /> going to build later.
            </>
          }
          subtitle="You're shipping a side project at nights. You can't justify a week building an internal admin. Suparbase is the workspace your future self would have wanted."
          actions={
            <>
              <Link
                href="/signup"
                className="inline-flex h-11 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
              >
                Start free
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/features"
                className="inline-flex h-11 items-center rounded-md border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
              >
                See features
              </Link>
            </>
          }
        />
      </PageShell>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="Why solo founders pick us"
            title="What you don't have to build"
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Need
              icon={FastForward}
              title="A table browser that's not Studio"
              body="Type-aware filters, FK lookups, CSV in/out. Cmd-K to find a row anywhere. Done, you didn't write it."
            />
            <Need
              icon={Sparkles}
              title="An AI for the queries you don't want to write"
              body="'Count active trial users with no projects' becomes one chat message instead of a 20-minute SQL session."
            />
            <Need
              icon={History}
              title="A history of who changed what"
              body="When a user emails saying their data disappeared, you have the audit log. Half your support tickets resolve themselves."
            />
            <Need
              icon={Lock}
              title="Credentials encrypted at rest"
              body="Your service_role key sits in our vault. It never touches a browser. You stop worrying about it on day one."
            />
            <Need
              icon={Zap}
              title="Inline cell editing"
              body="Fix a typo in a user's email without opening psql. Click the value. Type. Enter. Done."
            />
            <Need
              icon={Coffee}
              title="Five minutes to set up"
              body="Sign up, paste URL + key, the dashboard loads. The rest of your weekend is the actual product."
            />
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-3xl px-6 py-14 text-center md:py-20">
          <p className="text-sm text-fg-muted md:text-base">
            We built Suparbase because every side project of ours ended with
            &quot;I should really build an admin&quot; and never did. Now we
            point this at every new project and the question goes away.
          </p>
        </div>
      </section>

      <CTABand
        title="Skip the admin build."
        body="Free if you self-host. Hosted's free for 14 days, no credit card."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/pricing", label: "See pricing" }}
      />
    </>
  );
}

function Need({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-lg border hairline bg-bg-raised p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border-accent/40 bg-accent/10">
          <Icon className="h-4 w-4 text-accent" aria-hidden />
        </span>
        <h3 className="font-display text-base leading-tight">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
    </li>
  );
}
