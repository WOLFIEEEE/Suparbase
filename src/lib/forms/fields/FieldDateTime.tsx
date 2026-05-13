import { Input } from "@/components/ui/input";
import type { FieldProps } from "./types";

export function FieldDateTime({ column, value, onChange, id }: FieldProps) {
  const isDate = column.category === "date";
  return (
    <Input
      id={id}
      type={isDate ? "date" : "datetime-local"}
      value={value == null ? "" : String(value).slice(0, isDate ? 10 : 16)}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      placeholder={column.nullable ? "null" : ""}
    />
  );
}
