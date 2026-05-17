import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { db } from "@/server/db";
import { connections } from "@/server/schema/connections";
import { eq } from "drizzle-orm";
import { createInvitation } from "@/server/team/repo";
import { renderInvitationEmail } from "@/server/email/templates/invitation";
import { sendEmail } from "@/server/email/resend";
import { AppError } from "@/lib/errors";
import { limitOr429 } from "@/server/security/route-guards";
import { getActivePlan } from "@/server/billing/repo";
import { PlanLimitError, requireFeature } from "@/server/billing/plans";

export const dynamic = "force-dynamic";

const InviteSchema = z.object({
  email: z.string().min(3).max(120),
  role: z.enum(["editor", "viewer"]),
});

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const access = await requireRole(session.user.id, id, "owner");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Only the connection owner can invite members." },
      { status: 403 },
    );
  }
  {
    const limited = limitOr429(session.user.id, "write");
    if (limited) return limited;
  }

  // Plan limits: team invitations are a Hosted-tier feature. The
  // check is on the *owner's* plan, not the invitee's - the invitee
  // doesn't have an account yet.
  try {
    const active = await getActivePlan(session.user.id);
    requireFeature(active, "canInviteTeam");
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
  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { category: "validation", message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }
  try {
    const inv = await createInvitation(id, session.user.id, parsed.data.email, parsed.data.role);

    // Try to email the invitation. If Resend isn't configured, this is a
    // no-op, the owner still gets a copy-link in the UI as before.
    const [connRow] = await db
      .select({ name: connections.name })
      .from(connections)
      .where(eq(connections.id, id))
      .limit(1);
    const rendered = renderInvitationEmail({
      token: inv.token,
      recipientEmail: inv.email,
      role: inv.role,
      connectionName: connRow?.name ?? "your workspace",
      inviterEmail: session.user.email ?? null,
      expiresAt: inv.expiresAt,
    });
    const emailResult = await sendEmail({
      to: inv.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      tag: "team-invitation",
    });

    return NextResponse.json(
      {
        ...inv,
        delivery: {
          emailed: emailResult.delivered,
          reason: emailResult.reason ?? null,
          error: emailResult.error ?? null,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ category: e.category, message: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { category: "server", message: (e as Error).message ?? "Invite failed." },
      { status: 500 },
    );
  }
}
