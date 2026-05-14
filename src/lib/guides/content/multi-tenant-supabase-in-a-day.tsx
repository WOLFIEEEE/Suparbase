import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "multi-tenant-supabase-in-a-day",
  title: "Build a Multi-Tenant SaaS on Supabase in a Day",
  description:
    "From blank Supabase project to working multi-tenant SaaS: tenants, members, RLS, invites, and an admin tool pointed at it. The opinionated playbook for 2026.",
  level: "Intermediate" as const,
  readingMinutes: 12,
  timeMinutes: 240,
  tags: ["supabase", "multi-tenant", "saas", "rls"],
  steps: [
    { id: "hour-1", title: "Hour 1: schema + RLS" },
    { id: "hour-2", title: "Hour 2: invite + onboarding" },
    { id: "hour-3", title: "Hour 3: app routes" },
    { id: "hour-4", title: "Hour 4: admin tool" },
    { id: "what-to-do-next", title: "What to do next" },
  ],
} as const;

export function Body() {
  return (
    <>
      <p>
        A day is enough for a working multi-tenant SaaS skeleton with proper
        isolation, invite flow, and an admin tool. Not a finished product;
        the bones that everything else builds on.
      </p>

      <ArticleH2 id="hour-1">Hour 1: schema + RLS</ArticleH2>
      <p>
        The classic shared-table + <code>tenant_id</code> pattern. The most
        important rule: every business entity carries a <code>tenant_id</code>{" "}
        and RLS filters on it.
      </p>
      <CodeBlock language="sql" filename="0001_init.sql">{`-- Tenants (organisations)
CREATE TABLE public.tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Memberships link auth.users to tenants
CREATE TABLE public.memberships (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

-- Helper function: tenant ids the current user belongs to
CREATE OR REPLACE FUNCTION public.my_tenants()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM memberships WHERE user_id = auth.uid()
$$;

-- A business entity: projects
CREATE TABLE public.projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_tenant_idx ON projects (tenant_id);

-- RLS
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their memberships" ON memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read projects" ON projects FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.my_tenants()));
CREATE POLICY "Members write projects" ON projects FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.my_tenants()))
  WITH CHECK (tenant_id IN (SELECT public.my_tenants()));`}</CodeBlock>

      <ArticleH2 id="hour-2">Hour 2: invite + onboarding</ArticleH2>
      <p>
        First user creates a tenant when they sign up. Subsequent users join
        via invite. Both flows are server actions that hit the Supabase
        Admin API.
      </p>
      <CodeBlock language="ts" filename="actions/onboard.ts">{`"use server";

import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function createTenant(name: string, slug: string, ownerId: string) {
  const { data: tenant, error } = await admin
    .from("tenants")
    .insert({ name, slug })
    .select()
    .single();
  if (error) throw error;

  // Owner becomes the first member, with the owner role
  await admin.from("memberships").insert({
    tenant_id: tenant.id,
    user_id:   ownerId,
    role:      "owner",
  });
  return tenant;
}

export async function inviteToTenant(
  tenantId: string,
  email: string,
  invitedBy: string,
) {
  // Use GoTrue admin invite (sends a magic link)
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_to_tenant: tenantId, invited_by: invitedBy },
  });
  if (error) throw error;
  return data;
}`}</CodeBlock>

      <ArticleH2 id="hour-3">Hour 3: app routes</ArticleH2>
      <p>
        Three routes for the skeleton: <code>/login</code>, <code>/onboarding</code>,
        and <code>/[tenant]/projects</code>. Use the Supabase JS client on
        the browser side (with the anon key); RLS does the authz.
      </p>
      <CodeBlock language="ts" filename="app/[tenant]/projects/page.tsx">{`import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export default async function ProjectsPage({
  params,
}: {
  params: { tenant: string };
}) {
  const c = cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => c.get(n)?.value } },
  );

  const { data: tenant } = await sb
    .from("tenants")
    .select("id, name")
    .eq("slug", params.tenant)
    .single();

  // RLS already restricts; we don't need to filter on tenant_id again,
  // but doing it explicitly is good defence in depth.
  const { data: projects } = await sb
    .from("projects")
    .select("id, name")
    .eq("tenant_id", tenant!.id)
    .order("created_at", { ascending: false });

  return (
    <ul>
      {projects?.map((p) => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
}`}</CodeBlock>

      <ArticleH2 id="hour-4">Hour 4: admin tool</ArticleH2>
      <p>
        Don&apos;t write an admin from scratch. Point{" "}
        <Link href="/">Suparbase</Link> at this project: paste the URL and
        service_role key, and you get inline editing, audit logging,
        the AI chat assistant, and an RLS debugger. The skeleton you just
        shipped has a real admin in front of it within minutes.
      </p>

      <Callout variant="sparkle" title="The day's work">
        Schema + RLS, invite flow, app routes, admin tool. The bones of a
        multi-tenant SaaS. The rest is product surface, which is the part
        you actually wanted to spend time on.
      </Callout>

      <ArticleH2 id="what-to-do-next">What to do next</ArticleH2>
      <ul>
        <li>
          Add a role column to <code>memberships</code> and gate writes on
          it (owner vs member).
        </li>
        <li>
          Add an audit log table; have your write paths fire entries into it
          (or read{" "}
          <Link href="/blog/row-level-security-postgres-2026">our RLS guide</Link>
          {" "}for the per-table audit pattern).
        </li>
        <li>
          Add billing. Stripe + a <code>subscriptions</code> table keyed on{" "}
          <code>tenant_id</code> is the boring-and-correct approach.
        </li>
      </ul>
    </>
  );
}
