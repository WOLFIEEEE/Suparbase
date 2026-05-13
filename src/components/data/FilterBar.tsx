"use client";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Plus } from "lucide-react";
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
import { FilterChip } from "./FilterChip";
import { OPERATOR_LABEL, OPERATORS_FOR_TYPE } from "@/lib/filters/operators";
import { parseFilterParams } from "@/lib/filters/parse-url";
import { serializeChipsToParams } from "@/lib/filters/serialize-url";
import type { ChipSpec, FilterOperator } from "@/lib/filters/types";
import type { Column, Table } from "@/lib/types/schema";

interface Props {
  table: Table;
  /** Columns the user can filter on. Defaults to every non-json column. */
  filterableColumns?: Column[];
}

/**
 * Filter chip toolbar. Renders the active chips parsed from the URL, plus an
 * "+ Filter" trigger that opens a popover with column / operator / value
 * pickers. Removing a chip narrows the URL atomically.
 */
export function FilterBar({ table, filterableColumns }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const chips = useMemo(() => parseFilterParams(sp), [sp]);

  const cols = useMemo(
    () => filterableColumns ?? table.columns.filter((c) => c.category !== "json"),
    [filterableColumns, table.columns],
  );

  function setChips(next: ChipSpec[]) {
    const params = serializeChipsToParams(next, sp);
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c, i) => (
        <FilterChip
          key={`${c.column}-${c.op}-${i}`}
          chip={c}
          onRemove={() => setChips(chips.filter((_, j) => j !== i))}
        />
      ))}
      <AddFilterPopover
        columns={cols}
        onApply={(chip) => setChips([...chips, chip])}
        hasChips={chips.length > 0}
      />
      {chips.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setChips([])}
          className="text-fg-faint hover:text-fg"
        >
          Clear all
        </Button>
      )}
    </div>
  );
}

function AddFilterPopover({
  columns,
  onApply,
  hasChips,
}: {
  columns: Column[];
  onApply: (chip: ChipSpec) => void;
  hasChips: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [columnName, setColumnName] = useState<string>(columns[0]?.name ?? "");
  const col = columns.find((c) => c.name === columnName) ?? columns[0]!;
  const operators = OPERATORS_FOR_TYPE[col?.category ?? "unknown"] ?? OPERATORS_FOR_TYPE.unknown!;
  const [op, setOp] = useState<FilterOperator>(operators[0]!);
  const [value, setValue] = useState<string>("");
  const isUnary = op === "is_null" || op === "not_null";

  function reset() {
    setColumnName(columns[0]?.name ?? "");
    setOp(operators[0]!);
    setValue("");
  }

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
    onApply({ column: col.name, op, value: chipValue });
    setOpen(false);
    reset();
  }

  if (columns.length === 0) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Add filter">
          {hasChips ? (
            <>
              <Plus className="h-3 w-3" aria-hidden /> filter
            </>
          ) : (
            <>
              <Filter className="h-3 w-3" aria-hidden /> Filter
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-fg-faint">Column</Label>
            <Select
              value={columnName}
              onValueChange={(v) => {
                setColumnName(v);
                const nextCol = columns.find((c) => c.name === v);
                if (nextCol) {
                  const nextOps = OPERATORS_FOR_TYPE[nextCol.category] ?? OPERATORS_FOR_TYPE.unknown!;
                  setOp(nextOps[0]!);
                  setValue("");
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {columns.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    <span className="font-mono text-[11px]">{c.name}</span>
                    <span className="ml-2 text-[10px] text-fg-faint">{c.pgType}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-fg-faint">Operator</Label>
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
          </div>
          {!isUnary && (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-fg-faint">Value</Label>
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
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={!isUnary && value.trim().length === 0}>
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
