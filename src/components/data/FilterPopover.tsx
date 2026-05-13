"use client";
import { useState } from "react";
import { Filter } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OPERATOR_LABEL, OPERATORS_FOR_TYPE } from "@/lib/filters/operators";
import type { ChipSpec, FilterOperator } from "@/lib/filters/types";
import type { Column } from "@/lib/types/schema";

interface Props {
  column: Column;
  /** When set, popover opens with this chip pre-filled (edit mode). */
  initial?: ChipSpec;
  onSubmit: (chip: ChipSpec) => void;
  trigger?: React.ReactNode;
}

/**
 * Small popover that opens off a column header (or chip click). Picks an
 * operator + value appropriate to the column's category and emits a
 * `ChipSpec`. Multiple chips combine with AND at the URL level.
 */
export function FilterPopover({ column, initial, onSubmit, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const operators = OPERATORS_FOR_TYPE[column.category] ?? OPERATORS_FOR_TYPE.unknown!;
  const [op, setOp] = useState<FilterOperator>(initial?.op ?? operators[0]!);
  const [value, setValue] = useState<string>(
    Array.isArray(initial?.value)
      ? initial!.value.join(", ")
      : typeof initial?.value === "string"
      ? initial!.value
      : "",
  );

  const isUnary = op === "is_null" || op === "not_null";

  function submit() {
    let chipValue: string | string[] | null;
    if (isUnary) chipValue = null;
    else if (op === "in") {
      chipValue = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else {
      chipValue = value;
    }
    onSubmit({ column: column.name, op, value: chipValue });
    setOpen(false);
    setValue("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Filter ${column.name}`}
            title={`Filter ${column.name}`}
          >
            <Filter className="h-3 w-3" aria-hidden />
            <span className="font-mono text-[11px]">{column.name}</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-fg-faint">
              {column.name}
            </Label>
            <code className="text-[10px] text-fg-muted">{column.pgType}</code>
          </div>
          <Select value={op} onValueChange={(v) => setOp(v as FilterOperator)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {operators.map((o) => (
                <SelectItem key={o} value={o}>
                  {OPERATOR_LABEL[o]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isUnary && (
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={op === "in" ? "a, b, c" : "value"}
              className="h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              autoFocus
            />
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={submit}
              disabled={!isUnary && value.trim().length === 0}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
