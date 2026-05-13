import { Wand2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FieldProps } from "./types";

export function FieldUuid({ column, value, onChange, id }: FieldProps) {
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        placeholder={column.nullable ? "null" : "00000000-0000-0000-0000-000000000000"}
        autoComplete="off"
        spellCheck={false}
        className="flex-1"
      />
      <Button type="button" variant="secondary" onClick={() => onChange(crypto.randomUUID())}>
        <Wand2 className="h-3.5 w-3.5" aria-hidden />
        Generate
      </Button>
    </div>
  );
}
