import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, useRequiredClient } from "@/lib/connection/context";
import { introspect } from "@/lib/schema/introspect";
import type { PrimaryKeyValue, Row, Schema, Table } from "@/lib/schema/types";
import { countRows } from "./count";
import { deleteRow, getRow, insertRow, type ListParams, listRows, type ListResult, updateRow } from "./rows";
import { lookupReferenceLabels } from "./reference";

export function useSchema() {
  const { connection } = useConnection();
  return useQuery<Schema>({
    queryKey: ["schema", connection?.hostname],
    queryFn: () => {
      if (!connection) throw new Error("No active connection.");
      return introspect(connection);
    },
    enabled: !!connection,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function useRowCount(table: Table) {
  const client = useRequiredClient();
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["rowCount", connection?.hostname, table.schema, table.name],
    queryFn: () => countRows(client, table.schema, table.name),
    staleTime: 60_000,
  });
}

export function useRows(table: Table, params: ListParams) {
  const client = useRequiredClient();
  const { connection } = useConnection();
  return useQuery<ListResult>({
    queryKey: ["rows", connection?.hostname, table.schema, table.name, params],
    queryFn: () => listRows(client, table, params),
    staleTime: 5_000,
  });
}

export function useRow(table: Table, pk: PrimaryKeyValue | null) {
  const client = useRequiredClient();
  const { connection } = useConnection();
  return useQuery<Row>({
    queryKey: ["row", connection?.hostname, table.schema, table.name, pk],
    queryFn: () => {
      if (!pk) throw new Error("Missing primary key.");
      return getRow(client, table, pk);
    },
    enabled: !!pk,
    staleTime: 5_000,
  });
}

export function useInsertRow(table: Table) {
  const client = useRequiredClient();
  const qc = useQueryClient();
  const { connection } = useConnection();
  return useMutation({
    mutationFn: (values: Row) => insertRow(client, table, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rows", connection?.hostname, table.schema, table.name] });
      qc.invalidateQueries({ queryKey: ["rowCount", connection?.hostname, table.schema, table.name] });
    },
  });
}

export function useUpdateRow(table: Table) {
  const client = useRequiredClient();
  const qc = useQueryClient();
  const { connection } = useConnection();
  return useMutation({
    mutationFn: ({ pk, patch }: { pk: PrimaryKeyValue; patch: Row }) =>
      updateRow(client, table, pk, patch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["rows", connection?.hostname, table.schema, table.name] });
      qc.invalidateQueries({
        queryKey: ["row", connection?.hostname, table.schema, table.name, variables.pk],
      });
    },
  });
}

export function useDeleteRow(table: Table) {
  const client = useRequiredClient();
  const qc = useQueryClient();
  const { connection } = useConnection();
  return useMutation({
    mutationFn: (pk: PrimaryKeyValue) => deleteRow(client, table, pk),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rows", connection?.hostname, table.schema, table.name] });
      qc.invalidateQueries({ queryKey: ["rowCount", connection?.hostname, table.schema, table.name] });
    },
  });
}

export function useReferenceLabels(
  table: Table | undefined,
  columnName: string,
  values: unknown[],
  schema: Schema | undefined,
) {
  const client = useRequiredClient();
  const { connection } = useConnection();
  const col = table?.columns.find((c) => c.name === columnName);
  const fk = col?.fk;
  const targetTable = fk ? schema?.tables.find((t) => t.name === fk.table && t.schema === fk.schema) : undefined;
  const targetLabel = targetTable?.labelColumn ?? null;

  return useQuery<Map<string, string>>({
    queryKey: ["fkLabels", connection?.hostname, fk?.schema, fk?.table, fk?.column, targetLabel, values.length > 0 ? values.map(String).sort().join(",") : ""],
    queryFn: () => {
      if (!fk) return new Map<string, string>();
      return lookupReferenceLabels(client, fk, targetLabel, values);
    },
    enabled: !!fk && values.length > 0,
    staleTime: 30_000,
  });
}
