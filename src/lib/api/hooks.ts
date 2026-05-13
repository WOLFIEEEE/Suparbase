"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrimaryKeyValue, Row, Schema, Table } from "@/lib/types/schema";
import { listRows, type ListParams, type ListResult, insertRow, updateRow, deleteRow, getRow } from "@/lib/pgrest/rows";
import { countRows } from "@/lib/pgrest/count";
import { lookupReferenceLabels } from "@/lib/pgrest/reference";
import { AppError } from "@/lib/errors";
import { pgrest } from "@/lib/pgrest/client";

async function fetchSchema(connectionId: string): Promise<Schema> {
  let res: Response;
  try {
    res = await fetch(`/api/v/${encodeURIComponent(connectionId)}/introspect`, { method: "GET" });
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
  const data = (await res.json()) as { schema: Schema };
  return data.schema;
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
