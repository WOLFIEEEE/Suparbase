import { pgrest } from "./client";

export interface RowCount {
  count: number | null;
  estimated: boolean;
}

export async function countRows(connectionId: string, tableName: string): Promise<RowCount> {
  const query = new URLSearchParams();
  query.set("select", "*");
  try {
    const res = await pgrest({
      connectionId,
      path: encodeURIComponent(tableName),
      query,
      method: "HEAD",
      headers: {
        Prefer: "count=estimated",
        Range: "0-0",
        "Range-Unit": "items",
      },
    });
    return { count: res.count, estimated: true };
  } catch {
    return { count: null, estimated: false };
  }
}
