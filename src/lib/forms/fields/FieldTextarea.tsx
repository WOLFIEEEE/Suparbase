import { Textarea } from "@/components/ui/textarea";
import type { FieldProps } from "./types";

export function FieldTextarea({ column, value, onChange, id }: FieldProps) {
  return (
    <Textarea
      id={id}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      placeholder={column.nullable ? "null" : ""}
      rows={4}
      spellCheck={false}
    />
  );
}
