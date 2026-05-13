import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { FieldProps } from "./types";

export function FieldBool({ column, value, onChange, id }: FieldProps) {
  const isNull = value === null || value === undefined || value === "";
  return (
    <div className="flex items-center gap-3">
      <Switch
        id={id}
        checked={value === true}
        onCheckedChange={(c) => onChange(c)}
        disabled={isNull && column.nullable}
      />
      <span className="font-mono text-xs text-fg-muted">
        {isNull ? "null" : value === true ? "true" : "false"}
      </span>
      {column.nullable && !isNull && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
          set null
        </Button>
      )}
      {column.nullable && isNull && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(false)}>
          set value
        </Button>
      )}
    </div>
  );
}
