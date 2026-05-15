"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AcceptInvitationButton({
  token,
  connectionId,
}: {
  token: string;
  connectionId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
      });
      const j = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        setError((j.message as string | undefined) ?? "Couldn't accept.");
        setLoading(false);
        return;
      }
      toast.success("Welcome aboard!");
      router.push(`/c/${connectionId}`);
    } catch (e) {
      setError((e as Error).message ?? "Network error.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      <Button onClick={accept} disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Accepting…
          </>
        ) : (
          <>
            <Check className="h-3.5 w-3.5" aria-hidden />
            Accept invitation
          </>
        )}
      </Button>
    </div>
  );
}
