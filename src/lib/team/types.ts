export type MemberRole = "editor" | "viewer";
export type ConnectionRole = "owner" | MemberRole;

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

export interface TeamSnapshot {
  members: MemberSummary[];
  invitations: InvitationSummary[];
  myRole: ConnectionRole;
}
