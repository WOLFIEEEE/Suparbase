import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FieldProps } from "./types";

const NULL_SENTINEL = "__null__";

export function FieldEnum({ column, value, onChange }: FieldProps) {
  const stringValue = value == null ? NULL_SENTINEL : String(value);
  return (
    <Select
      value={stringValue}
      onValueChange={(v) => onChange(v === NULL_SENTINEL ? null : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        {column.nullable && (
          <SelectItem value={NULL_SENTINEL}>
            <span className="font-mono text-fg-faint">null</span>
          </SelectItem>
        )}
        {(column.enumValues ?? []).map((v) => (
          <SelectItem key={v} value={v}>
            <span className="font-mono">{v}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
