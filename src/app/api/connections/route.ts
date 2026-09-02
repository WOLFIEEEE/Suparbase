import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { createConnection, listConnections } from "@/server/connections/repo";
import { countOwnedConnections, getActivePlan } from "@/server/billing/repo";
import { PlanLimitError, requireFeature } from "@/server/billing/plans";
import { redact } from "@/lib/redact";
import { assertSafeOutboundUrl } from "@/server/security/egress";
import { CONNECTION_ENVIRONMENTS, type ConnectionEnvironment } from "@/server/schema/connections";

export const dynamic = "force-dynamic";

const URL_REGEX = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i;
const JWT_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PG_URL_REGEX = /^postgres(?:ql)?:\/\/.+/i;

const CreateConnectionSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  url: z.string().trim().regex(URL_REGEX, "URL must be a https://*.supabase.co project URL"),
  key: z.string().trim().regex(JWT_REGEX, "API key must be a JWT (three dot-separated segments)"),
  postgresUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .refine(
      (v) => !v || v.length === 0 || PG_URL_REGEX.test(v),
      "Postgres URL must start with postgres:// or postgresql://.",
    ),
  environment: z.enum(CONNECTION_ENVIRONMENTS as [string, ...string[]]).nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const rows = await listConnections(session.user.id);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });

  // Plan limits: Free tier is capped at 3 owned connections. The
  // resolver treats lapsed paid rows as Free, so an expired
  // subscription doesn't keep multiple connections alive.
  try {
    const [active, count] = await Promise.all([
      getActivePlan(session.user.id),
      countOwnedConnections(session.user.id),
    ]);
    requireFeature(active, "addConnection", { currentConnectionCount: count });
  } catch (e) {
    if (e instanceof PlanLimitError) {
      return NextResponse.json(
        {
          category: "plan_limit",
          message: e.message,
          feature: e.feature,
          plan: e.plan,
          upgradeUrl: "/settings/billing",
        },
        { status: 402 },
      );
    }
    throw e;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ category: "validation", message: "Body must be JSON." }, { status: 400 });
  }
  const parsed = CreateConnectionSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      {
        category: "validation",
        message: first?.message ?? "Invalid input.",
        field: first?.path?.[0],
      },
      { status: 400 },
    );
  }
  const { name, url, key, postgresUrl, environment } = parsed.data;
  const parsedUrl = new URL(url);

  if (postgresUrl) {
    try {
      await assertSafeOutboundUrl(
        postgresUrl,
        new Set(["postgres:", "postgresql:"]),
        { allowCredentials: true },
      );
    } catch (e) {
      return NextResponse.json(
        { category: "validation", message: (e as Error).message, field: "postgresUrl" },
        { status: 400 },
      );
    }
  }

  // Verify the credentials actually work before storing.
  try {
    const probe = await fetch(`${parsedUrl.origin}/rest/v1/`, {
      method: "GET",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (probe.status === 401) {
      return NextResponse.json(
        { category: "unauthorized", message: "This key was rejected by your project." },
        { status: 400 },
      );
    }
    if (probe.status === 403) {
      return NextResponse.json(
        { category: "forbidden", message: "This key cannot access the schema (likely RLS)." },
        { status: 400 },
      );
    }
    if (!probe.ok) {
      return NextResponse.json(
        { category: "server", message: `Supabase responded with ${probe.status}.` },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { category: "network", message: "Could not reach this Supabase host." },
      { status: 400 },
    );
  }

  try {
    const summary = await createConnection({
      userId: session.user.id,
      name,
      url: parsedUrl.origin,
      hostname: parsedUrl.hostname,
      key,
      postgresUrl: postgresUrl && postgresUrl.length > 0 ? postgresUrl : null,
      environment: (environment as ConnectionEnvironment | null | undefined) ?? null,
    });
    return NextResponse.json(summary, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? redact(e.message) : "Failed to create connection.";
    if (message.includes("connections_user_name_unique")) {
      return NextResponse.json(
        { category: "constraint", message: "A connection with that name already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json({ category: "server", message }, { status: 500 });
  }
}
