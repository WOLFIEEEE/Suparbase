import { Input } from "@/components/ui/input";
import type { FieldProps } from "./types";

export function FieldNumber({ column, value, onChange, id }: FieldProps) {
  const step = column.category === "integer" ? "1" : "any";
  return (
    <Input
      id={id}
      type="number"
      step={step}
      value={value == null ? "" : String(value)}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") onChange(null);
        else onChange(v);
      }}
      placeholder={column.nullable ? "null" : ""}
      inputMode={column.category === "integer" ? "numeric" : "decimal"}
    />
  );
}
