import "server-only";
import type { Schema, Table } from "@/lib/types/schema";

const SYSTEM_PROMPT = `You analyze database schemas for an admin dashboard.

For each table I provide, classify it into ONE category:
- "users":   the table represents end users / accounts / profiles / members.
             Look for email/username/handle columns, password hashes, role,
             avatar URLs, last_sign_in_at, etc.
- "content": the table represents user-authored content like posts, articles,
             pages, stories, documents. Look for title, slug, body/content/
             markdown, published_at, status (draft/published).
- "logs":    the table represents append-only events / activity / audit
             trails. Look for created_at + event_type or verb, jsonb payload
             columns, absence of update timestamps.
- "generic": none of the above.

For each table also:
- displayName: a clean Title Case label derived from the table name.
- listColumns: up to 6 column names that should appear in a list view, in
  priority order. Prefer the primary key first, then identity columns
  (name, title, email), then status/category, then created_at.
- statusColumn: a column that holds a small enumerated state, if any
  (e.g. "status", "state", "kind"). null otherwise.
- titleColumn: the "headline" column for a row in a list view, if any
  (e.g. "title" for content, "name" for users). null otherwise.
- notes: at most one short sentence stating the reason.

Respond with JSON ONLY in this shape:
{
  "tables": [
    {
      "schema": string,
      "name": string,
      "category": "users" | "content" | "logs" | "generic",
      "displayName": string,
      "listColumns": string[],
      "statusColumn": string | null,
      "titleColumn": string | null,
      "notes": string
    }
  ]
}

Do not include any tables not present in the input. Do not include
explanations outside the JSON.`;

function formatTable(t: Table): string {
  const cols = t.columns
    .map((c) => {
      const parts: string[] = [`${c.name} ${c.pgType}`];
      if (!c.nullable) parts.push("not null");
      if (c.isPrimaryKey) parts.push("pk");
      if (c.fk) parts.push(`fk -> ${c.fk.schema}.${c.fk.table}.${c.fk.column}`);
      return parts.join(" ");
    })
    .join(", ");
  return `${t.schema}.${t.name} (${cols})`;
}

export function buildUserPrompt(schema: Schema): string {
  const tables = schema.tables.map(formatTable).join("\n");
  return `Schema for project ${schema.hostname}:\n${tables}\n\nReturn the JSON now.`;
}

export function getSystemPrompt(): string {
  return SYSTEM_PROMPT;
}
