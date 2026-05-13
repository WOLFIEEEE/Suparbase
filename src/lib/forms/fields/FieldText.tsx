import { Input } from "@/components/ui/input";
import type { FieldProps } from "./types";

export function FieldText({ column, value, onChange, id }: FieldProps) {
  return (
    <Input
      id={id}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      placeholder={column.nullable ? "null" : ""}
      maxLength={column.maxLength}
      autoComplete="off"
      spellCheck={false}
    />
  );
}
