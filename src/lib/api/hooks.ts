"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrimaryKeyValue, Row, Schema, Table } from "@/lib/types/schema";
import { listRows, type ListParams, type ListResult, insertRow, updateRow, deleteRow, getRow } from "@/lib/pgrest/rows";
import { countRows } from "@/lib/pgrest/count";
import { lookupReferenceLabels } from "@/lib/pgrest/reference";
import { AppError } from "@/lib/errors";
import { pgrest } from "@/lib/pgrest/client";

export interface FetchSchemaOptions {
  /** Force PostgREST to reload its schema cache before introspecting. */
  force?: boolean;
}

export interface FetchSchemaResult {
  schema: Schema;
  /** True when the force flag triggered a server-side NOTIFY pgrst reload. */
  postgrestReloaded: boolean;
}

async function fetchSchema(connectionId: string, opts: FetchSchemaOptions = {}): Promise<Schema> {
  const result = await fetchSchemaWithMeta(connectionId, opts);
  return result.schema;
}

/**
 * Public wrapper that exposes the `postgrestReloaded` flag, so the UI
 * can show "we asked PostgREST to drop its cache and waited for it" vs.
 * "we re-introspected against possibly-stale PostgREST data". Used by
 * the Refresh schema button.
 */
export async function fetchSchemaWithMeta(
  connectionId: string,
  opts: FetchSchemaOptions = {},
): Promise<FetchSchemaResult> {
  const url = `/api/v/${encodeURIComponent(connectionId)}/introspect${opts.force ? "?force=true" : ""}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      // Belt-and-braces: in addition to the server's Cache-Control:
      // no-store, instruct the browser to bypass HTTP cache. Stale
      // OpenAPI from a CDN edge has caused "refresh schema doesn't
      // work" reports historically.
      cache: "no-store",
    });
  } catch (cause) {
    throw new AppError("network", "Could not reach the server.", { cause });
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    if (payload && typeof payload === "object" && "category" in payload) {
      const e = payload as { category: AppError["category"]; message: string };
      throw new AppError(e.category, e.message);
    }
    throw new AppError("server", `Server responded with ${res.status}.`);
  }
  const data = (await res.json()) as { schema: Schema; postgrestReloaded?: boolean };
  return { schema: data.schema, postgrestReloaded: !!data.postgrestReloaded };
}

export function useSchema(connectionId: string | undefined) {
  return useQuery<Schema>({
    queryKey: ["schema", connectionId],
    queryFn: () => fetchSchema(connectionId!),
    enabled: !!connectionId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function useRowCount(connectionId: string | undefined, table: Table | undefined) {
  return useQuery({
    queryKey: ["rowCount", connectionId, table?.schema, table?.name],
    queryFn: () => countRows(connectionId!, table!.name),
    enabled: !!connectionId && !!table && !!table.name,
    staleTime: 60_000,
  });
}

export function useRows(connectionId: string | undefined, table: Table | undefined, params: ListParams) {
  return useQuery<ListResult>({
    queryKey: ["rows", connectionId, table?.schema, table?.name, params],
    queryFn: () => listRows(connectionId!, table!, params),
    enabled: !!connectionId && !!table && !!table.name,
    staleTime: 5_000,
  });
}

export function useRow(connectionId: string | undefined, table: Table | undefined, pk: PrimaryKeyValue | null) {
  return useQuery<Row>({
    queryKey: ["row", connectionId, table?.schema, table?.name, pk],
    queryFn: () => {
      if (!connectionId || !table || !pk) throw new Error("Missing connection/table/pk.");
      return getRow(connectionId, table, pk);
    },
    enabled: !!connectionId && !!table && !!table.name && !!pk,
    staleTime: 5_000,
  });
}

export function useInsertRow(connectionId: string | undefined, table: Table | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Row) => {
      if (!connectionId || !table) throw new Error("Connection or table is not loaded yet.");
      return insertRow(connectionId, table, values);
    },
    onSuccess: () => {
      if (!connectionId || !table) return;
      qc.invalidateQueries({ queryKey: ["rows", connectionId, table.schema, table.name] });
      qc.invalidateQueries({ queryKey: ["rowCount", connectionId, table.schema, table.name] });
    },
  });
}

export function useUpdateRow(connectionId: string | undefined, table: Table | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pk, patch }: { pk: PrimaryKeyValue; patch: Row }) => {
      if (!connectionId || !table) throw new Error("Connection or table is not loaded yet.");
      return updateRow(connectionId, table, pk, patch);
    },
    onSuccess: (_data, variables) => {
      if (!connectionId || !table) return;
      qc.invalidateQueries({ queryKey: ["rows", connectionId, table.schema, table.name] });
      qc.invalidateQueries({
        queryKey: ["row", connectionId, table.schema, table.name, variables.pk],
      });
    },
  });
}

export function useDeleteRow(connectionId: string | undefined, table: Table | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pk: PrimaryKeyValue) => {
      if (!connectionId || !table) throw new Error("Connection or table is not loaded yet.");
      return deleteRow(connectionId, table, pk);
    },
    onSuccess: () => {
      if (!connectionId || !table) return;
      qc.invalidateQueries({ queryKey: ["rows", connectionId, table.schema, table.name] });
      qc.invalidateQueries({ queryKey: ["rowCount", connectionId, table.schema, table.name] });
    },
  });
}

export function useReferenceLabels(
  connectionId: string | undefined,
  table: Table | undefined,
  columnName: string,
  values: unknown[],
  schema: Schema | undefined,
) {
  const col = table?.columns.find((c) => c.name === columnName);
  const fk = col?.fk;
  const targetTable = fk ? schema?.tables.find((t) => t.name === fk.table && t.schema === fk.schema) : undefined;
  const targetLabel = targetTable?.labelColumn ?? null;
  const valuesKey = values.length > 0 ? values.map(String).sort().join(",") : "";
  return useQuery<Map<string, string>>({
    queryKey: ["fkLabels", connectionId, fk?.schema, fk?.table, fk?.column, targetLabel, valuesKey],
    queryFn: () => {
      if (!connectionId || !fk) return new Map<string, string>();
      return lookupReferenceLabels(connectionId, fk, targetLabel, values);
    },
    enabled: !!connectionId && !!fk && values.length > 0,
    staleTime: 30_000,
  });
}

export interface BulkDeleteResponse {
  deleted: number;
  snapshots?: Row[];
}

async function postBulkDelete(
  connectionId: string,
  tableName: string,
  primaryKeys: PrimaryKeyValue[],
  returnSnapshots: boolean,
): Promise<BulkDeleteResponse> {
  const res = await fetch(
    `/api/v/${encodeURIComponent(connectionId)}/rest/${encodeURIComponent(tableName)}/bulk-delete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryKeys, returnSnapshots }),
    },
  );
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Bulk delete failed.");
  }
  return res.json();
}

export function useBulkDelete(
  connectionId: string | undefined,
  table: Table | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      primaryKeys,
      returnSnapshots = true,
    }: {
      primaryKeys: PrimaryKeyValue[];
      returnSnapshots?: boolean;
    }) => {
      if (!connectionId || !table) throw new Error("Connection or table is not loaded yet.");
      return postBulkDelete(connectionId, table.name, primaryKeys, returnSnapshots);
    },
    onSuccess: () => {
      if (!connectionId || !table) return;
      qc.invalidateQueries({ queryKey: ["rows", connectionId, table.schema, table.name] });
      qc.invalidateQueries({ queryKey: ["rowCount", connectionId, table.schema, table.name] });
    },
  });
}

async function postBulkUpdate(
  connectionId: string,
  tableName: string,
  primaryKeys: PrimaryKeyValue[],
  patch: Row,
): Promise<{ updated: number }> {
  const res = await fetch(
    `/api/v/${encodeURIComponent(connectionId)}/rest/${encodeURIComponent(tableName)}/bulk-update`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryKeys, patch }),
    },
  );
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Bulk update failed.");
  }
  return res.json();
}

export function useBulkUpdate(
  connectionId: string | undefined,
  table: Table | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ primaryKeys, patch }: { primaryKeys: PrimaryKeyValue[]; patch: Row }) => {
      if (!connectionId || !table) throw new Error("Connection or table is not loaded yet.");
      return postBulkUpdate(connectionId, table.name, primaryKeys, patch);
    },
    onSuccess: () => {
      if (!connectionId || !table) return;
      qc.invalidateQueries({ queryKey: ["rows", connectionId, table.schema, table.name] });
      qc.invalidateQueries({ queryKey: ["rowCount", connectionId, table.schema, table.name] });
    },
  });
}

export interface ImportChunkResponse {
  imported: number;
  skipped: number;
  errors: Array<{ index: number; column?: string; reason: string }>;
}

export async function postImportChunk(
  connectionId: string,
  tableName: string,
  rows: Record<string, unknown>[],
  onError: "skip" | "abort",
): Promise<ImportChunkResponse> {
  const res = await fetch(
    `/api/v/${encodeURIComponent(connectionId)}/rest/${encodeURIComponent(tableName)}/import`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, onError }),
    },
  );
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Import failed.");
  }
  return res.json();
}

export interface RecentAuditEntry {
  id: string;
  verb: "insert" | "update" | "delete";
  tableSchema: string;
  tableName: string;
  primaryKey: Record<string, unknown> | null;
  createdAt: string;
}

async function fetchRecentAuditEntries(connectionId: string, limit: number): Promise<RecentAuditEntry[]> {
  const res = await fetch(
    `/api/v/${encodeURIComponent(connectionId)}/audit/recent?limit=${limit}`,
    { method: "GET" },
  );
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed to load audit log.");
  }
  const data = (await res.json()) as { entries: RecentAuditEntry[] };
  return data.entries ?? [];
}

export function useRecentAudit(connectionId: string | undefined, limit = 10) {
  return useQuery<RecentAuditEntry[]>({
    queryKey: ["auditRecent", connectionId, limit],
    queryFn: () => fetchRecentAuditEntries(connectionId!, limit),
    enabled: !!connectionId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

// re-export `pgrest` so callers from components can drop in usage without an extra import path
export { pgrest };
