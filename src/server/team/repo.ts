import "server-only";
import { randomBytes } from "crypto";
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/schema/auth";
import {
  connectionInvitations,
  connectionMembers,
  type ConnectionInvitationRow,
  type ConnectionMemberRow,
  type MemberRole,
} from "@/server/schema/team";
import { AppError } from "@/lib/errors";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface MemberSummary {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  role: MemberRole;
  invitedBy: string | null;
  invitedAt: string;
  acceptedAt: string;
}

export interface InvitationSummary {
  id: string;
  email: string;
  role: MemberRole;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export function generateInviteToken(): string {
  // 32 bytes → 43 url-safe chars after base64url. Plenty of entropy.
  return randomBytes(32).toString("base64url");
}

function memberToSummary(
  row: ConnectionMemberRow & { email: string | null; name: string | null },
): MemberSummary {
  return {
    id: row.id,
    userId: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    invitedBy: row.invitedBy,
    invitedAt: row.invitedAt.toISOString(),
    acceptedAt: row.acceptedAt.toISOString(),
  };
}

function inviteToSummary(row: ConnectionInvitationRow): InvitationSummary {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    token: row.token,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMembers(connectionId: string): Promise<MemberSummary[]> {
  const rows = await db
    .select({
      id: connectionMembers.id,
      userId: connectionMembers.userId,
      connectionId: connectionMembers.connectionId,
      role: connectionMembers.role,
      invitedBy: connectionMembers.invitedBy,
      invitedAt: connectionMembers.invitedAt,
      acceptedAt: connectionMembers.acceptedAt,
      email: users.email,
      name: users.name,
    })
    .from(connectionMembers)
    .innerJoin(users, eq(users.id, connectionMembers.userId))
    .where(eq(connectionMembers.connectionId, connectionId))
    .orderBy(asc(connectionMembers.acceptedAt));
  return rows.map((r) => memberToSummary(r));
}

export async function listPendingInvitations(
  connectionId: string,
): Promise<InvitationSummary[]> {
  const now = new Date();
  const rows = await db
    .select()
    .from(connectionInvitations)
    .where(
      and(
        eq(connectionInvitations.connectionId, connectionId),
        isNull(connectionInvitations.acceptedAt),
        gt(connectionInvitations.expiresAt, now),
      ),
    )
    .orderBy(desc(connectionInvitations.createdAt));
  return rows.map(inviteToSummary);
}

export async function createInvitation(
  connectionId: string,
  invitedBy: string,
  email: string,
  role: MemberRole,
): Promise<InvitationSummary> {
  const normalised = email.trim().toLowerCase();
  if (!normalised || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) {
    throw new AppError("validation", "Enter a valid email address.");
  }
  if (role !== "editor" && role !== "viewer") {
    throw new AppError("validation", "Role must be editor or viewer.");
  }
  // Reject if there's already an active invitation for this email.
  const existing = await listPendingInvitations(connectionId);
  if (existing.some((i) => i.email.toLowerCase() === normalised)) {
    throw new AppError("validation", `An invitation already exists for ${normalised}.`);
  }
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [row] = await db
    .insert(connectionInvitations)
    .values({
      connectionId,
      email: normalised,
      role,
      token,
      invitedBy,
      expiresAt,
    })
    .returning();
  return inviteToSummary(row);
}

export async function revokeInvitation(
  connectionId: string,
  invitationId: string,
): Promise<boolean> {
  const res = await db
    .delete(connectionInvitations)
    .where(
      and(
        eq(connectionInvitations.id, invitationId),
        eq(connectionInvitations.connectionId, connectionId),
      ),
    )
    .returning({ id: connectionInvitations.id });
  return res.length > 0;
}

export async function updateMemberRole(
  connectionId: string,
  memberId: string,
  role: MemberRole,
): Promise<MemberSummary | null> {
  const [row] = await db
    .update(connectionMembers)
    .set({ role })
    .where(
      and(
        eq(connectionMembers.id, memberId),
        eq(connectionMembers.connectionId, connectionId),
      ),
    )
    .returning();
  if (!row) return null;
  const [withUser] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  return memberToSummary({ ...row, email: withUser?.email ?? null, name: withUser?.name ?? null });
}

export async function removeMember(
  connectionId: string,
  memberId: string,
): Promise<boolean> {
  const res = await db
    .delete(connectionMembers)
    .where(
      and(
        eq(connectionMembers.id, memberId),
        eq(connectionMembers.connectionId, connectionId),
      ),
    )
    .returning({ id: connectionMembers.id });
  return res.length > 0;
}

// ---------------------------------------------------------------------------
// Invitation acceptance — used by /invitations/[token]
// ---------------------------------------------------------------------------

export interface ResolvedInvitation {
  invitation: ConnectionInvitationRow;
  connectionId: string;
  connectionName: string | null;
  inviterEmail: string | null;
}

export async function resolveInvitation(token: string): Promise<ResolvedInvitation | null> {
  const [row] = await db
    .select()
    .from(connectionInvitations)
    .where(eq(connectionInvitations.token, token))
    .limit(1);
  if (!row) return null;

  // Look up connection name + inviter for the accept page.
  const { connections } = await import("@/server/schema/connections");
  const [conn] = await db
    .select({ id: connections.id, name: connections.name, userId: connections.userId })
    .from(connections)
    .where(eq(connections.id, row.connectionId))
    .limit(1);

  let inviterEmail: string | null = null;
  if (row.invitedBy) {
    const [u] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, row.invitedBy))
      .limit(1);
    inviterEmail = u?.email ?? null;
  }

  return {
    invitation: row,
    connectionId: row.connectionId,
    connectionName: conn?.name ?? null,
    inviterEmail,
  };
}

export async function acceptInvitation(
  token: string,
  acceptingUserId: string,
  acceptingEmail: string | null,
): Promise<{ connectionId: string; role: MemberRole }> {
  const [inv] = await db
    .select()
    .from(connectionInvitations)
    .where(eq(connectionInvitations.token, token))
    .limit(1);
  if (!inv) throw new AppError("not_found", "This invitation no longer exists.");
  if (inv.acceptedAt) throw new AppError("validation", "This invitation has already been accepted.");
  if (inv.expiresAt < new Date()) {
    throw new AppError("validation", "This invitation has expired.");
  }
  if (
    !acceptingEmail ||
    acceptingEmail.toLowerCase() !== inv.email.toLowerCase()
  ) {
    throw new AppError(
      "unauthorized",
      `This invitation is addressed to ${inv.email}. Sign in with that email to accept.`,
    );
  }

  // Idempotent insert: if a member row already exists, just mark the
  // invitation accepted and return.
  const [existing] = await db
    .select()
    .from(connectionMembers)
    .where(
      and(
        eq(connectionMembers.connectionId, inv.connectionId),
        eq(connectionMembers.userId, acceptingUserId),
      ),
    )
    .limit(1);
  if (!existing) {
    await db.insert(connectionMembers).values({
      connectionId: inv.connectionId,
      userId: acceptingUserId,
      role: inv.role,
      invitedBy: inv.invitedBy,
      acceptedAt: new Date(),
    });
  }
  await db
    .update(connectionInvitations)
    .set({ acceptedAt: new Date() })
    .where(eq(connectionInvitations.id, inv.id));

  return { connectionId: inv.connectionId, role: inv.role };
}
