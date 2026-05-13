import type { SupabaseClient } from "@supabase/supabase-js";
import { toAppError } from "./errors";

export interface RowCount {
  count: number | null;
  estimated: boolean;
}

export async function countRows(
  client: SupabaseClient,
  schema: string,
  tableName: string,
): Promise<RowCount> {
  const { count, error } = await client
    .schema(schema)
    .from(tableName)
    .select("*", { count: "estimated", head: true });
  if (error) {
    // Counting a view can fail; surface null rather than throwing so the dashboard renders.
    const app = toAppError(error);
    if (app.category === "forbidden" || app.category === "not_found") {
      return { count: null, estimated: false };
    }
    throw app;
  }
  return { count: count ?? null, estimated: true };
}
