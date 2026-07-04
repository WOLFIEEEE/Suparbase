"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Pin/unpin a table for the current user. Pinned tables surface in the
 * command palette's "Pinned tables" group. `qualified` is "schema.table".
 */
export function PinTableButton({
  connectionId,
  qualified,
}: {
  connectionId: string;
  qualified: string;
}) {
  const qc = useQueryClient();
  const key = ["pins", connectionId];
  const { data: pins } = useQuery({
    queryKey: key,
    queryFn: async () =>
      ((await (await fetch(`/api/connections/${connectionId}/pins`)).json()) as { pins: string[] })
        .pins ?? [],
    staleTime: 30_000,
  });
  const pinned = (pins ?? []).includes(qualified);

  const toggle = useMutation({
    mutationFn: async () => {
      await fetch(`/api/connections/${connectionId}/pins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableName: qualified }),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <Button
      variant="secondary"
      size="md"
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      aria-label={pinned ? "Unpin table" : "Pin table"}
      title={pinned ? "Unpin from command palette" : "Pin to command palette"}
    >
      {pinned ? (
        <PinOff className="h-3.5 w-3.5 text-accent" aria-hidden />
      ) : (
        <Pin className="h-3.5 w-3.5" aria-hidden />
      )}
      <span className="hidden sm:inline">{pinned ? "Pinned" : "Pin"}</span>
    </Button>
  );
}
