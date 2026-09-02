"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ENVIRONMENT_META, ENVIRONMENT_ORDER } from "@/lib/ui/environment";
import type { ConnectionEnvironment, ConnectionSummary } from "@/lib/types/connection";
import { cn } from "@/lib/ui/cn";

/**
 * Owner-only environment picker. Production adds a typed confirmation to
 * row deletes, bulk deletes, and SQL write mode, and paints a red badge in
 * every workspace surface so nobody mistakes prod for staging.
 */
export function EnvironmentSection({ connection }: { connection: ConnectionSummary }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [value, setValue] = useState<ConnectionEnvironment | null>(connection.environment);

  const save = useMutation({
    mutationFn: async (environment: ConnectionEnvironment | null) => {
      const res = await fetch(`/api/connections/${connection.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(e?.message ?? "Could not save the environment.");
      }
    },
    onSuccess: (_, environment) => {
      toast.success(environment ? `Labelled as ${ENVIRONMENT_META[environment].label}` : "Environment cleared");
      void qc.invalidateQueries({ queryKey: ["connections"] });
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (connection.myRole !== "owner") return null;
  const dirty = value !== connection.environment;

  return (
    <section className="surface space-y-4 rounded-md p-6">
      <header className="space-y-1">
        <h2 className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-fg-faint">
          <Tag className="h-3 w-3" aria-hidden /> Environment
        </h2>
        <p className="text-xs text-fg-muted">
          Label this project so the workspace can tell prod from staging.{" "}
          <strong className="text-fg">Production</strong> adds a typed confirmation to row
          deletes, bulk deletes, and SQL write mode.
        </p>
      </header>
      <div role="radiogroup" aria-label="Environment" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ENVIRONMENT_ORDER.map((env) => {
          const meta = ENVIRONMENT_META[env];
          const active = value === env;
          return (
            <button
              key={env}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setValue(active ? null : env)}
              className={cn(
                "rounded-md border px-3 py-2 text-left transition-colors",
                active ? "border-accent bg-accent/10" : "hairline hover:border-line-strong",
              )}
            >
              <div className="text-sm font-medium">{meta.label}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-fg-muted">{meta.hint}</div>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => save.mutate(value)} disabled={!dirty || save.isPending}>
          {save.isPending ? "Saving…" : "Save environment"}
        </Button>
        {value === null && connection.environment !== null && (
          <span className="text-[11px] text-fg-faint">Saving with nothing selected clears the label.</span>
        )}
      </div>
    </section>
  );
}
