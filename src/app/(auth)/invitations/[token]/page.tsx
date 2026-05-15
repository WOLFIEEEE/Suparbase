import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { resolveInvitation } from "@/server/team/repo";
import { Button } from "@/components/ui/button";
import { AcceptInvitationButton } from "@/components/team/AcceptInvitationButton";
import { AlertTriangle, Mail, UserPlus } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function InvitationAcceptPage({ params }: Props) {
  const { token } = await params;
  const resolved = await resolveInvitation(token);
  if (!resolved) notFound();

  const session = await auth();
  const sessionEmail = session?.user?.email?.toLowerCase() ?? null;
  const inviteEmail = resolved.invitation.email.toLowerCase();
  const expired = resolved.invitation.expiresAt < new Date();
  const alreadyAccepted = resolved.invitation.acceptedAt != null;
  const matches = sessionEmail === inviteEmail;

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-lg border hairline bg-bg-raised p-6 shadow-sm">
        <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-accent/10">
          <UserPlus className="h-4 w-4 text-accent" aria-hidden />
        </div>
        <h1 className="font-display text-xl leading-tight">
          You&apos;ve been invited to a workspace
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          {resolved.inviterEmail
            ? `${resolved.inviterEmail} invited you `
            : "You've been invited "}
          to join <span className="font-mono text-fg">{resolved.connectionName ?? "a Suparbase connection"}</span>{" "}
          as a <span className="font-mono text-fg">{resolved.invitation.role}</span>.
        </p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-fg-faint">
          <Mail className="h-3 w-3" aria-hidden />
          Invitation addressed to{" "}
          <span className="font-mono text-fg-muted">{resolved.invitation.email}</span>
        </p>

        <div className="mt-6 space-y-2">
          {alreadyAccepted ? (
            <Notice tone="muted">This invitation has already been accepted.</Notice>
          ) : expired ? (
            <Notice tone="danger" icon>
              This invitation has expired. Ask the owner for a new one.
            </Notice>
          ) : !session?.user ? (
            <>
              <Notice tone="muted">
                Sign in with <span className="font-mono">{resolved.invitation.email}</span> to accept.
              </Notice>
              <Button asChild className="w-full">
                <Link
                  href={`/signin?next=${encodeURIComponent(`/invitations/${token}`)}`}
                >
                  Sign in to accept
                </Link>
              </Button>
            </>
          ) : !matches ? (
            <Notice tone="danger" icon>
              You&apos;re signed in as <span className="font-mono">{sessionEmail}</span>,
              but this invitation is for <span className="font-mono">{resolved.invitation.email}</span>.
              Sign out and sign back in with the matching email.
            </Notice>
          ) : (
            <AcceptInvitationButton token={token} connectionId={resolved.connectionId} />
          )}
        </div>
      </div>
    </main>
  );
}

function Notice({
  tone,
  icon,
  children,
}: {
  tone: "muted" | "danger";
  icon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === "danger"
          ? "flex items-start gap-1.5 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          : "rounded-md border hairline bg-bg-sunken/40 px-3 py-2 text-xs text-fg-muted"
      }
    >
      {icon && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />}
      <span>{children}</span>
    </div>
  );
}
