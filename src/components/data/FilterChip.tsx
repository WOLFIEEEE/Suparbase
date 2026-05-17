"use client";
import { X } from "lucide-react";
import { OPERATOR_LABEL } from "@/lib/filters/operators";
import type { ChipSpec } from "@/lib/filters/types";

interface Props {
  chip: ChipSpec;
  onRemove: () => void;
}

function formatValue(chip: ChipSpec): string {
  if (chip.op === "is_null") return "is empty";
  if (chip.op === "not_null") return "is not empty";
  if (chip.op === "in" && Array.isArray(chip.value)) {
    const list = chip.value.slice(0, 3).join(", ");
    return chip.value.length > 3 ? `(${list}, …)` : `(${list})`;
  }
  return String(chip.value ?? "");
}

export function FilterChip({ chip, onRemove }: Props) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-bg-raised px-2.5 py-1 text-[11px]">
      <span className="font-mono text-fg-muted">{chip.column}</span>
      <span className="text-fg-faint">{OPERATOR_LABEL[chip.op]}</span>
      {chip.op !== "is_null" && chip.op !== "not_null" && (
        <span className="max-w-[16ch] truncate font-mono text-fg">
          {formatValue(chip)}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 rounded p-1.5 text-fg-faint hover:bg-bg-sunken hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Remove filter"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}
