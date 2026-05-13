"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseCsvString } from "@/lib/csv/parse";
import { IGNORE_COL, type ColumnMap, type ImportSummary, type PreviewRow, type RowError } from "@/lib/csv/types";
import { postImportChunk } from "@/lib/api/hooks";
import { AppError } from "@/lib/errors";
import type { Table } from "@/lib/types/schema";

const MAX_BYTES = 50 * 1024 * 1024;
const PREVIEW_ROWS = 20;
const CHUNK_SIZE = 500;

interface Props {
  open: boolean;
  onClose: () => void;
  connectionId: string;
  table: Table;
}

type Mode = "skip" | "abort";

export function ImportPanel({ open, onClose, connectionId, table }: Props) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef(false);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Array<Record<string, string>>>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMap>({});
  const [mode, setMode] = useState<Mode>("abort");
  const [phase, setPhase] = useState<"idle" | "previewing" | "importing" | "done">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targetColumns = useMemo(
    () =>
      table.columns
        .filter((c) => !c.isGenerated)
        .map((c) => c.name),
    [table.columns],
  );

  function reset() {
    cancelRef.current = false;
    setFileName(null);
    setRawRows([]);
    setHeaders([]);
    setMapping({});
    setPhase("idle");
    setProgress({ done: 0, total: 0 });
    setSummary(null);
    setError(null);
  }

  const handleClose = useCallback(() => {
    if (phase === "importing") {
      cancelRef.current = true;
    }
    reset();
    onClose();
  }, [phase, onClose]);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("File is over 50 MB. Split it: `split -l 5000 file.csv`.");
      return;
    }
    const text = await file.text();
    const rows: Array<Record<string, string>> = [];
    let headerKeys: string[] = [];
    try {
      for await (const r of parseCsvString(text)) {
        if (headerKeys.length === 0) headerKeys = Object.keys(r.values);
        rows.push(r.values);
        // We don't truncate here — keep the full set for the chunked import,
        // but the preview UI only renders the first PREVIEW_ROWS.
      }
    } catch (e) {
      setError(`Could not parse CSV: ${(e as Error).message}`);
      return;
    }
    setFileName(file.name);
    setHeaders(headerKeys);
    setRawRows(rows);
    setMapping(inferMapping(headerKeys, targetColumns));
    setPhase("previewing");
  }

  const previewRows: PreviewRow[] = useMemo(() => {
    if (rawRows.length === 0) return [];
    return rawRows.slice(0, PREVIEW_ROWS).map((raw, i) => {
      const coerced: Record<string, unknown> = {};
      const cellErrors: Record<string, string> = {};
      for (const [src, target] of Object.entries(mapping)) {
        if (target === IGNORE_COL) continue;
        const v = raw[src];
        const col = table.columns.find((c) => c.name === target);
        if (!col) continue;
        const { value, error } = coerce(v, col.category);
        if (error) cellErrors[target] = error;
        coerced[target] = value;
      }
      return { line: i + 2, raw, coerced, cellErrors };
    });
  }, [rawRows, mapping, table.columns]);

  const hasMappedTargets = Object.values(mapping).some((v) => v && v !== IGNORE_COL);
  const errorCount = previewRows.reduce(
    (sum, r) => sum + Object.keys(r.cellErrors).length,
    0,
  );

  async function runImport() {
    cancelRef.current = false;
    setPhase("importing");
    setProgress({ done: 0, total: rawRows.length });
    const errors: RowError[] = [];
    let imported = 0;
    let skipped = 0;

    const chunks: Array<Array<Record<string, unknown>>> = [];
    let buf: Array<Record<string, unknown>> = [];
    for (const raw of rawRows) {
      const row: Record<string, unknown> = {};
      for (const [src, target] of Object.entries(mapping)) {
        if (target === IGNORE_COL) continue;
        const col = table.columns.find((c) => c.name === target);
        if (!col) continue;
        row[target] = coerce(raw[src], col.category).value;
      }
      buf.push(row);
      if (buf.length >= CHUNK_SIZE) {
        chunks.push(buf);
        buf = [];
      }
    }
    if (buf.length > 0) chunks.push(buf);

    let baseIdx = 0;
    for (const chunk of chunks) {
      if (cancelRef.current) break;
      try {
        const res = await postImportChunk(connectionId, table.name, chunk, mode);
        imported += res.imported;
        skipped += res.skipped;
        for (const e of res.errors) {
          errors.push({ ...e, index: baseIdx + e.index, line: baseIdx + e.index + 2 });
        }
        if (mode === "abort" && res.skipped > 0) {
          // Server already rolled back this chunk's audits; remaining chunks
          // don't fire.
          break;
        }
      } catch (e) {
        const app = e instanceof AppError ? e : new AppError("client_bug", String((e as Error).message ?? e));
        errors.push({ index: baseIdx, reason: app.message });
        if (mode === "abort") break;
      }
      baseIdx += chunk.length;
      setProgress({ done: baseIdx, total: rawRows.length });
    }

    setSummary({ total: rawRows.length, imported, skipped, errors });
    setPhase("done");
    qc.invalidateQueries({ queryKey: ["rows", connectionId, table.schema, table.name] });
    qc.invalidateQueries({ queryKey: ["rowCount", connectionId, table.schema, table.name] });
    if (imported > 0) toast.success(`Imported ${imported} ${imported === 1 ? "row" : "rows"}.`);
    if (errors.length > 0) toast.error(`${errors.length} row${errors.length === 1 ? "" : "s"} failed.`);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-fg-muted" aria-hidden />
            <DialogTitle>Import into {table.name}</DialogTitle>
          </div>
          <DialogDescription>
            Drag a CSV file in (max 50 MB), map source columns to target table
            columns, then import in chunks of {CHUNK_SIZE}.
          </DialogDescription>
        </DialogHeader>

        {phase === "idle" && (
          <DropZone
            onFile={handleFile}
            onTriggerPicker={() => fileInputRef.current?.click()}
          />
        )}

        {phase === "previewing" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-fg-muted">
              <span>
                <strong className="text-fg">{fileName}</strong> · {rawRows.length} {rawRows.length === 1 ? "row" : "rows"}
              </span>
              <button
                type="button"
                className="text-fg-faint hover:text-fg"
                onClick={() => {
                  reset();
                }}
              >
                Drop a different file
              </button>
            </div>

            <div className="surface max-h-[24rem] overflow-auto rounded-md">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-bg-raised">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="border-b hairline px-2 py-2 text-left">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[11px] text-fg-faint">{h}</span>
                          <Select
                            value={mapping[h] ?? IGNORE_COL}
                            onValueChange={(v) =>
                              setMapping((m) => ({ ...m, [h]: v }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={IGNORE_COL}>(Ignore)</SelectItem>
                              {targetColumns.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => (
                    <tr key={r.line} className="border-b hairline last:border-b-0">
                      {headers.map((h) => {
                        const target = mapping[h];
                        const err = target ? r.cellErrors[target] : undefined;
                        return (
                          <td
                            key={h}
                            className={
                              err
                                ? "border-r hairline px-2 py-1 bg-danger/10 text-danger"
                                : "border-r hairline px-2 py-1 text-fg"
                            }
                            title={err}
                          >
                            <span className="block max-w-[18ch] truncate font-mono">{r.raw[h] ?? ""}</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-fg-faint">
                Showing first {previewRows.length} of {rawRows.length}.
                {errorCount > 0 && (
                  <span className="ml-2 text-danger">
                    <AlertCircle className="inline h-3 w-3" aria-hidden /> {errorCount} cell error{errorCount === 1 ? "" : "s"} in preview
                  </span>
                )}
              </span>
              <div className="flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="onError"
                    value="abort"
                    checked={mode === "abort"}
                    onChange={() => setMode("abort")}
                    className="accent-accent"
                  />
                  Commit all-or-nothing
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="onError"
                    value="skip"
                    checked={mode === "skip"}
                    onChange={() => setMode("skip")}
                    className="accent-accent"
                  />
                  Skip bad rows
                </label>
              </div>
            </div>
          </div>
        )}

        {phase === "importing" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>
                Importing {progress.done.toLocaleString()} / {progress.total.toLocaleString()}…
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  cancelRef.current = true;
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden /> Cancel
              </Button>
            </div>
            <div className="surface-sunken h-2 w-full overflow-hidden rounded-full">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "0%",
                }}
              />
            </div>
          </div>
        )}

        {phase === "done" && summary && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-fg">
              <Check className="h-4 w-4 text-accent" aria-hidden />
              <span>
                Imported <strong>{summary.imported}</strong> of{" "}
                <strong>{summary.total}</strong>, skipped <strong>{summary.skipped}</strong>.
              </span>
            </div>
            {summary.errors.length > 0 && (
              <details className="surface rounded-md p-3 text-xs">
                <summary className="cursor-pointer text-fg-muted">
                  {summary.errors.length} error{summary.errors.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                  {summary.errors.slice(0, 50).map((e, i) => (
                    <li key={i} className="font-mono text-[11px] text-danger">
                      line {e.line ?? "?"}{e.column ? ` · ${e.column}` : ""}: {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}

        <DialogFooter>
          {phase === "previewing" && (
            <>
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={runImport}
                disabled={!hasMappedTargets || rawRows.length === 0}
              >
                Import {rawRows.length} row{rawRows.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
          {phase === "done" && <Button onClick={handleClose}>Close</Button>}
        </DialogFooter>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function DropZone({ onFile, onTriggerPicker }: { onFile: (f: File) => void; onTriggerPicker: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={
        hover
          ? "rounded-md border-2 border-dashed border-accent bg-accent/5 p-10 text-center text-sm"
          : "rounded-md border-2 border-dashed border-line p-10 text-center text-sm"
      }
    >
      <Upload className="mx-auto mb-3 h-6 w-6 text-fg-faint" aria-hidden />
      <p className="text-fg-muted">Drop a CSV file here</p>
      <p className="mt-1 text-xs text-fg-faint">or</p>
      <Button variant="secondary" size="sm" className="mt-2" onClick={onTriggerPicker}>
        Pick a file
      </Button>
      <p className="mt-3 text-[11px] text-fg-faint">Max 50 MB.</p>
    </div>
  );
}

function inferMapping(headers: string[], targets: string[]): ColumnMap {
  const out: ColumnMap = {};
  const targetByLower = new Map(targets.map((t) => [t.toLowerCase(), t]));
  for (const h of headers) {
    const match = targetByLower.get(h.toLowerCase());
    out[h] = match ?? IGNORE_COL;
  }
  return out;
}

function coerce(
  raw: string | undefined,
  category: string,
): { value: unknown; error?: string } {
  if (raw === undefined || raw === "") return { value: null };
  switch (category) {
    case "integer":
    case "float": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { value: raw, error: "not a number" };
      return { value: n };
    }
    case "boolean": {
      const lower = raw.toLowerCase();
      if (["true", "t", "1", "yes"].includes(lower)) return { value: true };
      if (["false", "f", "0", "no"].includes(lower)) return { value: false };
      return { value: raw, error: "not a boolean" };
    }
    case "date":
    case "datetime": {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return { value: raw, error: "not a date" };
      return { value: raw };
    }
    case "json": {
      const trimmed = raw.trim();
      if (trimmed === "") return { value: null };
      try {
        return { value: JSON.parse(trimmed) };
      } catch {
        // Pass through; server will coerce or reject.
        return { value: raw };
      }
    }
    default:
      return { value: raw };
  }
}
