export const meta = {
  slug: "vibe-coding",
  term: "Vibe Coding",
  description:
    "A 2024-2026 term for building software primarily by describing what you want to an AI coding agent, reviewing the diff, and shipping. The developer's job shifts from typing to architecting and approving.",
  category: "Vibe-coding" as const,
  related: [
    { kind: "blog" as const, slug: "vibe-coding-database-patterns", label: "Database patterns for vibe coding" },
    { kind: "blog" as const, slug: "which-database-for-vibe-coding-2026", label: "Which database for vibe coding" },
    { kind: "blog" as const, slug: "cursor-plus-supabase-2026", label: "The Cursor + Supabase stack" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        <strong>Vibe coding</strong> is the colloquial name for AI-paired
        software development in 2025-2026. You describe a feature or
        change to an editor like Cursor, Windsurf, or Claude Code; the
        agent writes the code; you review the diff and ship. The
        developer remains responsible for architecture, naming, and "is
        this the right thing to build at all" judgement.
      </p>
      <p>
        The term originated in Andrej Karpathy&apos;s tweet from
        February 2025 and stuck because it captures a real shift: the
        developer&apos;s flow is conversational rather than typed.
      </p>
      <p>
        Implications for database work: AI agents do best with type-safe,
        introspectable databases (Postgres &gt; MongoDB), strong
        conventions in the repo (a rules file, schema-as-code,
        committed types), and clear safety rails (audit log, propose-
        then-execute for writes).
      </p>
    </>
  );
}
