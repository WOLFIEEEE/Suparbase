import { ArticleH2 } from "@/components/public/article-bits";

export const meta = {
  slug: "supabase-auth-vs-clerk",
  leftName: "Supabase Auth",
  rightName: "Clerk",
  title: "Supabase Auth vs Clerk in 2026",
  description:
    "Bundled-with-the-DB auth vs the specialist auth platform. Honest 2026 comparison of Supabase Auth (GoTrue) and Clerk: when each one wins.",
  tldr:
    "Supabase Auth ships with your database, integrates with RLS, and is free at any reasonable scale. Clerk is the polished specialist, superior UI components, mature SSO, multi-tenant orgs. Pick Supabase Auth if you want one platform; pick Clerk if auth is a first-class concern of your business.",
  callouts: [
    { context: "Bundled-with-Postgres workflow", winner: "Supabase Auth" },
    { context: "Polished pre-built UI components", winner: "Clerk" },
    { context: "Enterprise SSO + SCIM", winner: "Clerk" },
    { context: "RLS-as-authz primitive", winner: "Supabase Auth" },
  ],
  matrix: [
    { feature: "Database integration", left: "JWT claims in Postgres GUCs (auth.uid)", right: "Webhook sync to your DB" },
    { feature: "Pre-built UI", left: "Auth UI library (basic)", right: "<SignIn /> + <UserButton /> polished" },
    { feature: "Social providers", left: "20+", right: "30+" },
    { feature: "Magic links + OTP", left: "Yes", right: "Yes" },
    { feature: "Organizations / teams", left: "Roll-your-own with RLS", right: "First-class Organizations API" },
    { feature: "Enterprise SSO (SAML/OIDC)", left: "Pro tier", right: "Standard feature" },
    { feature: "MFA", left: "TOTP", right: "TOTP + SMS + backup codes" },
    { feature: "Pricing", left: "Free up to 100k MAU", right: "Free up to 10k MAU, then per-MAU" },
    { feature: "Vendor lock-in", left: "Portable (GoTrue is open)", right: "Higher (proprietary)" },
  ],
} as const;

export function Body() {
  return (
    <>
      <ArticleH2 id="when-supabase-auth-wins">When Supabase Auth wins</ArticleH2>
      <ul>
        <li>
          You&apos;re building on Supabase anyway and want RLS to read user claims directly. Supabase&apos;s
          <code> auth.uid()</code> + <code>request.jwt.claims</code> pattern is the cleanest authz primitive
          in the industry.
        </li>
        <li>
          You don&apos;t want to pay for auth as a separate line item. 100k MAU free is generous.
        </li>
        <li>
          You&apos;re a solo founder or small team and the bundled experience is what you want.
        </li>
        <li>
          You value the open-source angle. GoTrue is portable; you can self-host or move.
        </li>
      </ul>

      <ArticleH2 id="when-clerk-wins">When Clerk wins</ArticleH2>
      <ul>
        <li>
          Auth is a first-class concern. You want SAML, SCIM, advanced session controls, organizational
          structures, and Clerk&apos;s polish.
        </li>
        <li>
          You&apos;re building B2B with multi-tenant orgs. Clerk&apos;s Organizations API is more mature than
          rolling your own membership tables.
        </li>
        <li>
          Your team will appreciate the pre-built UI components. The Clerk components save real engineering
          time.
        </li>
        <li>
          You&apos;re willing to pay for the convenience. Clerk pricing is fair; it&apos;s just not free.
        </li>
      </ul>

      <ArticleH2 id="hybrid">The hybrid pattern</ArticleH2>
      <p>
        It&apos;s viable to use Clerk for auth and Supabase for everything else. Clerk emits a JWT; you wire it
        into Supabase via a custom JWT secret or by webhook-syncing user rows. The trade-off: you lose the
        clean RLS integration unless you write a custom Postgres function to extract Clerk claims. Doable, but
        a bit more glue.
      </p>

      <ArticleH2 id="honest-take">Honest take</ArticleH2>
      <p>
        For most projects on Supabase, Supabase Auth is the right call. The RLS integration is the killer
        feature you don&apos;t want to fight. For projects where auth is non-trivial - enterprise SSO,
        complex org models, end-user-facing auth UIs. Clerk earns its keep. The two products are sized
        for different jobs; pick on shape, not on benchmarks.
      </p>
    </>
  );
}
