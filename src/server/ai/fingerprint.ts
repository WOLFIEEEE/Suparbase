import "server-only";
import { createHash } from "node:crypto";
import type { Schema } from "@/lib/types/schema";

/**
 * Deterministic schema fingerprint. Changes iff the user's set of tables /
 * columns / pgTypes changes. Used as the cache key for AI analyses.
 */
export function fingerprintSchema(schema: Schema): string {
  const lines: string[] = [];
  for (const t of schema.tables) {
    for (const c of t.columns) {
      lines.push(`${t.schema}.${t.name}|${c.name}:${c.pgType}`);
    }
  }
  lines.sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}
