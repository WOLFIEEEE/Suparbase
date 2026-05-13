"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useCurrentConnectionId } from "@/lib/contexts/CurrentConnection";
import { searchReferences } from "@/lib/pgrest/reference";
import { cn } from "@/lib/ui/cn";
import type { FieldProps } from "./types";

export function FieldFk({ column, schema, value, onChange }: FieldProps) {
  const fk = column.fk;
  const connectionId = useCurrentConnectionId();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term, 250);

  const targetTable = useMemo(
    () => (fk ? schema.tables.find((t) => t.name === fk.table && t.schema === fk.schema) : undefined),
    [schema, fk],
  );
  const labelColumn = targetTable?.labelColumn ?? null;

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["fkPicker", connectionId, fk?.schema, fk?.table, fk?.column, labelColumn, debounced],
    queryFn: () => {
      if (!fk) return [];
      return searchReferences(connectionId, fk, labelColumn, debounced);
    },
    enabled: open && !!fk,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  if (!fk) {
    return (
      <Button type="button" variant="outline" disabled>
        no foreign key
      </Button>
    );
  }

  const currentLabel = value == null ? null : String(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-mono"
        >
          <span className="truncate text-left">
            {currentLabel ?? <span className="text-fg-faint">Pick a {fk.table} row…</span>}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder={`Search ${fk.table} by ${labelColumn ?? fk.column}…`}
          />
          <CommandList>
            {isLoading && <div className="p-3 text-xs text-fg-faint">loading…</div>}
            {!isLoading && options.length === 0 && <CommandEmpty>No matches.</CommandEmpty>}
            {column.nullable && (
              <CommandItem
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <X className="mr-2 h-3.5 w-3.5 text-fg-faint" aria-hidden />
                <span className="font-mono text-fg-faint">clear (null)</span>
              </CommandItem>
            )}
            {options.map((opt) => {
              const selected = String(opt.value) === String(value);
              return (
                <CommandItem
                  key={String(opt.value)}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-3.5 w-3.5 text-accent", selected ? "opacity-100" : "opacity-0")}
                    aria-hidden
                  />
                  <span className="flex flex-1 items-center justify-between gap-2">
                    <span className="truncate">{opt.label}</span>
                    {opt.label !== String(opt.value) && (
                      <span className="font-mono text-[10px] text-fg-faint">
                        {String(opt.value).slice(0, 8)}
                      </span>
                    )}
                  </span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
