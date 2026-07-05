/**
 * Registry of the free public tools. Data-only (no React) so it can be
 * imported by the sitemap, footer, index page, and per-page metadata alike.
 */
export interface ToolMeta {
  slug: string;
  title: string;
  /** Short label for nav/cards. */
  short: string;
  /** One-line pitch. */
  tagline: string;
  /** Meta description. */
  description: string;
  /** Lucide icon name (resolved where React is available). */
  icon: "ShieldAlert" | "ShieldCheck" | "Network" | "KeyRound" | "Braces";
  /** True when the tool runs entirely in the browser. */
  clientOnly: boolean;
}

export const TOOLS: ToolMeta[] = [
  {
    slug: "supabase-security-scanner",
    title: "Supabase Security Scanner",
    short: "Security Scanner",
    tagline: "See what a stranger can read from your Supabase project.",
    description:
      "Free Supabase security scanner. Paste your project URL and instantly see which tables are readable by anonymous visitors, which expose PII, and get a security score. No account needed.",
    icon: "ShieldAlert",
    clientOnly: false,
  },
  {
    slug: "rls-policy-generator",
    title: "RLS Policy Generator",
    short: "RLS Generator",
    tagline: "Generate correct Row-Level-Security policies, and explain any policy in plain English.",
    description:
      "Free Supabase/Postgres RLS policy generator and explainer. Pick an access pattern to get copy-paste SQL, or paste a CREATE POLICY statement to understand what it actually allows. Runs in your browser.",
    icon: "ShieldCheck",
    clientOnly: true,
  },
  {
    slug: "schema-visualizer",
    title: "Schema → ERD Visualizer",
    short: "Schema Visualizer",
    tagline: "Paste SQL DDL, get an entity-relationship diagram.",
    description:
      "Free Postgres schema visualizer. Paste CREATE TABLE statements or a pg_dump and get an entity-relationship diagram with foreign-key links. Nothing leaves your browser.",
    icon: "Network",
    clientOnly: true,
  },
  {
    slug: "schema-to-typescript",
    title: "Postgres to TypeScript Type Generator",
    short: "Type Generator",
    tagline: "Turn your Postgres schema into TypeScript interfaces or Zod schemas.",
    description:
      "Free Postgres to TypeScript type generator. Paste your Supabase or Postgres DDL and get typed interfaces or Zod schemas, with correct nullability and array handling. Runs in your browser.",
    icon: "Braces",
    clientOnly: true,
  },
  {
    slug: "secret-scanner",
    title: "Secret & API Key Leak Scanner",
    short: "Secret Scanner",
    tagline: "Catch leaked API keys, service-role tokens, and DB URLs in your code.",
    description:
      "Free secret scanner. Paste code, .env files, or logs to find leaked Supabase service-role keys, API tokens, and database URLs, with severity and fix advice. Runs entirely in your browser.",
    icon: "KeyRound",
    clientOnly: true,
  },
];

export function toolBySlug(slug: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
