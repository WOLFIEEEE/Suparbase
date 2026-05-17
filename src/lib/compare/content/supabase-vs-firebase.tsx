import { ArticleH2 } from "@/components/public/article-bits";

export const meta = {
  slug: "supabase-vs-firebase",
  leftName: "Supabase",
  rightName: "Firebase",
  title: "Supabase vs Firebase: A 2026 Comparison",
  description:
    "Open-source Postgres + RLS vs Google's NoSQL bundle. Honest 2026 comparison of Supabase and Firebase: when each one wins, the costs, the lock-in.",
  tldr:
    "Supabase wins if you want SQL, RLS, and an open stack. Firebase wins if you want Google's first-class mobile SDKs and you don't mind document-only data. For new web SaaS in 2026, Supabase is the calmer choice.",
  callouts: [
    { context: "Web SaaS with relational data", winner: "Supabase" },
    { context: "Mobile-first with Google Play / iOS focus", winner: "Firebase" },
    { context: "Open-source / portable", winner: "Supabase" },
  ],
  matrix: [
    { feature: "Database", left: "Postgres", right: "Firestore (NoSQL document)" },
    { feature: "Auth", left: "GoTrue + JWT", right: "Firebase Auth + custom claims" },
    { feature: "Storage", left: "Self-hosted S3-compatible", right: "Google Cloud Storage" },
    { feature: "Realtime", left: "Postgres LISTEN/NOTIFY + replication", right: "Firestore listeners" },
    { feature: "Pricing model", left: "Per-project compute + storage", right: "Per-read/write + bandwidth" },
    { feature: "Self-hosting", left: "Yes (open-source)", right: "No" },
    { feature: "Vendor lock-in", left: "Low (it's Postgres)", right: "High" },
    { feature: "Schema / types", left: "Enforced, introspectable", right: "Schema-less, sampled" },
    { feature: "RLS-style authorization", left: "Native Postgres RLS", right: "Firestore Security Rules" },
  ],
} as const;

export function Body() {
  return (
    <>
      <ArticleH2 id="when-supabase-wins">When Supabase wins</ArticleH2>
      <ul>
        <li>
          You have relational data (users, orgs, projects, posts). RLS gives
          you fine-grained authorization without writing rules in a separate
          language.
        </li>
        <li>
          You want SQL. Joins, window functions, CTEs, aggregates - all
          first-class.
        </li>
        <li>
          You don&apos;t want to be locked in. Postgres is portable; you can
          always leave for self-hosted or another provider.
        </li>
        <li>
          You want predictable pricing. Per-project compute scales smoothly;
          you don&apos;t get a surprise bill from a runaway listener.
        </li>
        <li>
          You&apos;re vibe-coding with AI. Schema introspection means agents
          don&apos;t hallucinate column names.
        </li>
      </ul>

      <ArticleH2 id="when-firebase-wins">When Firebase wins</ArticleH2>
      <ul>
        <li>
          You&apos;re mobile-first and tightly integrated with Google&apos;s
          ecosystem. Firebase SDKs for iOS and Android are mature and well-
          documented.
        </li>
        <li>
          Your data really is document-shaped. Polymorphic events, deeply
          nested user-generated content, etc.
        </li>
        <li>
          You want the bundled extras (Crashlytics, Analytics, FCM) in one
          place.
        </li>
        <li>
          You&apos;re a solo founder shipping a consumer app and don&apos;t
          want to think about a database at all for the first six months.
        </li>
      </ul>

      <ArticleH2 id="honest-take">Honest take</ArticleH2>
      <p>
        For a new web SaaS project in 2026, Supabase is the default and
        Firebase is a specific tool for a specific shape (mobile apps with
        consumer-grade scale and document data). Firebase&apos;s lock-in is
        real; the migration story to leave is painful; the Security Rules
        language requires its own debugging muscle. None of that is fatal,
        but it&apos;s tax you pay on a daily basis.
      </p>
      <p>
        Supabase is open-source. You can self-host. You can move. The
        Postgres you&apos;re using inside Supabase is the same Postgres
        used by every other serious data platform in the world. That
        portability quietly compounds into &quot;the right default&quot;.
      </p>
    </>
  );
}
