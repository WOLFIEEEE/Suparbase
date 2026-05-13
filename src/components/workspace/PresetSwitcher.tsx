"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PresetId } from "@/lib/presets/pick";

const LABELS: Record<PresetId, string> = {
  users: "Users",
  content: "Content",
  logs: "Logs",
  commerce: "Orders",
  tasks: "Tasks",
  messages: "Messages",
  generic: "Generic",
};

export function PresetSwitcher({ active }: { active: PresetId }) {
  const router = useRouter();
  const params = useSearchParams();
  const overriding = params.get("view") === "generic";

  function toggle() {
    const sp = new URLSearchParams(params.toString());
    if (overriding) sp.delete("view");
    else sp.set("view", "generic");
    router.replace(`?${sp.toString()}`);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggle}
      title={overriding ? "Restore AI-suggested preset" : "Switch to generic table view"}
    >
      {overriding ? (
        <>
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
          Restore {LABELS[active]} preset
        </>
      ) : (
        <>
          <Table2 className="h-3.5 w-3.5" aria-hidden />
          Switch to generic
        </>
      )}
    </Button>
  );
}
