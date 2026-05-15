import { NextResponse, type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import { auth } from "@/server/auth";
import { requireRole } from "@/server/connections/repo";
import { db } from "@/server/db";
import { connections } from "@/server/schema/connections";
import { connectionInvitations } from "@/server/schema/team";
import { renderInvitationEmail } from "@/server/email/templates/invitation";
import { sendEmail } from "@/server/email/resend";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; invId: string }>;
}

export async function POST(_req: NextRequest, ctx: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ category: "unauthorized" }, { status: 401 });
  const { id, invId } = await ctx.params;
  const access = await requireRole(session.user.id, id, "owner");
  if (!access) {
    return NextResponse.json(
      { category: "forbidden", message: "Only the connection owner can resend invitations." },
      { status: 403 },
    );
  }

  const [inv] = await db
    .select()
    .from(connectionInvitations)
    .where(
      and(
        eq(connectionInvitations.id, invId),
        eq(connectionInvitations.connectionId, id),
      ),
    )
    .limit(1);
  if (!inv) return NextResponse.json({ category: "not_found" }, { status: 404 });
  if (inv.acceptedAt) {
    return NextResponse.json(
      { category: "validation", message: "This invitation has already been accepted." },
      { status: 400 },
    );
  }
  if (inv.expiresAt < new Date()) {
    return NextResponse.json(
      { category: "validation", message: "This invitation has expired. Send a new one." },
      { status: 400 },
    );
  }

  const [conn] = await db
    .select({ name: connections.name })
    .from(connections)
    .where(eq(connections.id, id))
    .limit(1);

  const rendered = renderInvitationEmail({
    token: inv.token,
    recipientEmail: inv.email,
    role: inv.role,
    connectionName: conn?.name ?? "your workspace",
    inviterEmail: session.user.email ?? null,
    expiresAt: inv.expiresAt.toISOString(),
  });

  const result = await sendEmail({
    to: inv.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    tag: "team-invitation-resend",
  });

  return NextResponse.json({
    emailed: result.delivered,
    reason: result.reason ?? null,
    error: result.error ?? null,
  });
}
