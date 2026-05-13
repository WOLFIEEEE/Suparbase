"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppError } from "@/lib/errors";
import type { SavedView, ViewState } from "@/lib/types/views";

interface ListResp {
  views: SavedView[];
}

async function fetchViews(
  connectionId: string,
  schema: string,
  table: string,
): Promise<SavedView[]> {
  const params = new URLSearchParams({ connectionId, schema, table });
  const res = await fetch(`/api/views?${params.toString()}`);
  if (!res.ok) {
    const e = await res.json().catch(() => null);
    throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed to load views.");
  }
  const data = (await res.json()) as ListResp;
  return data.views ?? [];
}

export function useSavedViews(
  connectionId: string | undefined,
  schema: string | undefined,
  table: string | undefined,
) {
  return useQuery({
    queryKey: ["views", connectionId, schema, table],
    queryFn: () => fetchViews(connectionId!, schema!, table!),
    enabled: !!connectionId && !!schema && !!table,
    staleTime: 60_000,
  });
}

interface CreateInput {
  connectionId: string;
  schema: string;
  table: string;
  name: string;
  state: ViewState;
}

export function useCreateView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInput): Promise<SavedView> => {
      const res = await fetch("/api/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed to save view.");
      }
      const data = (await res.json()) as { view: SavedView };
      return data.view;
    },
    onSuccess: (_view, vars) => {
      qc.invalidateQueries({ queryKey: ["views", vars.connectionId, vars.schema, vars.table] });
    },
  });
}

interface UpdateInput {
  id: string;
  connectionId: string;
  schema: string;
  table: string;
  name?: string;
  state?: ViewState;
}

export function useUpdateView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, state }: UpdateInput): Promise<SavedView> => {
      const res = await fetch(`/api/views/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, state }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed to update view.");
      }
      const data = (await res.json()) as { view: SavedView };
      return data.view;
    },
    onSuccess: (_view, vars) => {
      qc.invalidateQueries({ queryKey: ["views", vars.connectionId, vars.schema, vars.table] });
    },
  });
}

interface DeleteInput {
  id: string;
  connectionId: string;
  schema: string;
  table: string;
}

export function useDeleteView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: DeleteInput): Promise<void> => {
      const res = await fetch(`/api/views/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new AppError((e?.category as AppError["category"]) ?? "server", e?.message ?? "Failed to delete view.");
      }
    },
    onSuccess: (_void, vars) => {
      qc.invalidateQueries({ queryKey: ["views", vars.connectionId, vars.schema, vars.table] });
    },
  });
}
