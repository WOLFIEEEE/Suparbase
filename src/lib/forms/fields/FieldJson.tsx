import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { FieldProps } from "./types";

export function FieldJson({ column, value, onChange, id }: FieldProps) {
  const [draft, setDraft] = useState<string>(() => normalize(value));
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(normalize(value));
  }, [value]);

  function commit(next: string) {
    setDraft(next);
    if (next.trim() === "") {
      setParseError(null);
      onChange(column.nullable ? null : "");
      return;
    }
    try {
      JSON.parse(next);
      setParseError(null);
      onChange(next);
    } catch (e) {
      setParseError((e as Error).message);
      onChange(next); // we still pass through; row mutate will surface the error
    }
  }

  function formatPretty() {
    if (!draft.trim()) return;
    try {
      const parsed = JSON.parse(draft);
      const pretty = JSON.stringify(parsed, null, 2);
      setDraft(pretty);
      onChange(pretty);
      setParseError(null);
    } catch (e) {
      setParseError((e as Error).message);
    }
  }

  return (
    <div className="space-y-1">
      <Textarea
        id={id}
        value={draft}
        onChange={(e) => commit(e.target.value)}
        rows={6}
        spellCheck={false}
        placeholder={column.nullable ? "null" : "{}"}
        className="font-mono text-[12px]"
      />
      <div className="flex items-center justify-between text-[11px]">
        <span className={parseError ? "text-danger" : "text-fg-faint"}>
          {parseError ? `JSON: ${parseError}` : "valid JSON"}
        </span>
        <button
          type="button"
          className="text-fg-muted hover:text-fg"
          onClick={formatPretty}
        >
          format
        </button>
      </div>
    </div>
  );
}

function normalize(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
