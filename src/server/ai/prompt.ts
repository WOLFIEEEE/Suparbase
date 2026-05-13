import "server-only";
import type { Schema, Table } from "@/lib/types/schema";

const SYSTEM_PROMPT = `You analyze database schemas for an admin dashboard.

For each table I provide, classify it into EXACTLY ONE category. When
two could apply, pick the one that drives the dominant UI need:
- "users":    end users / accounts / profiles / members. Email/username/
              handle columns, password hashes, role, avatar URLs,
              last_sign_in_at, etc.
- "content":  user-authored content like posts, articles, pages, docs.
              Title, slug, body/content/markdown, published_at, status
              (draft/published).
- "logs":     append-only events / activity / audit trails. created_at +
              event_type/verb, jsonb payload, no update timestamps.
- "commerce": money-moving records — orders, invoices, transactions,
              payments, charges, line_items. Look for total/amount/
              price/subtotal/fee/tax columns, currency, customer or
              buyer FK, order_number, status in {pending, paid,
              shipped, delivered, refunded, cancelled}.
- "tasks":    workflow items — tasks, tickets, issues, todos. Look for
              a status column with workflow values ({todo, in_progress,
              done, blocked, ...}), assignee/reporter FK, priority,
              due_date.
- "messages": conversation records — comments, messages, threads,
              conversations, posts-on-a-post. Look for body/text +
              author/sender FK + (thread_id|conversation_id|parent_id).
              Distinguished from "content" by the presence of a thread
              parent and the absence of a slug/title (messages have
              author + body but no slug).
- "generic":  none of the above.

Then for each table also produce:

- displayName: clean Title Case label derived from the table name.
- listColumns: up to 6 columns to render in a list view, ordered by
  importance. Always lead with the primary key, then identity columns
  (name/title/email), then status/category, then created_at. Skip
  password hashes, raw jsonb metadata, and FK id columns when the FK
  target has a better label column.
- statusColumn: column that holds an enumerated state (status/state/
  kind/type). null if none.
- titleColumn: legacy "headline" column for a row (deprecated by primary
  below). null if none.
- notes: at most one short sentence stating the reason for the category.

- primary: the identity of a single row, used in row cards and detail
  pages. An object with these fields (each nullable, omit if not
  applicable):
    titleColumn:    the strongest single label column (e.g. display_name
                    for users, title for content, order_number for an
                    order). REQUIRED if you can find one.
    subtitleColumn: a secondary identifier shown under the title (e.g.
                    email under a user's display name, slug under a
                    post's title).
    avatarColumn:   a column that holds an image URL (avatar_url,
                    image, photo_url, picture).
    badgeColumn:    the column to render as a chip — usually the
                    statusColumn or a role/tier column.

- hiddenColumns: columns to hide by default in list and detail views.
  Always hide: password_hash, password_digest, encrypted_*, salt,
  mfa_secret, raw_app_meta_data, raw_user_meta_data, *_token,
  refresh_token, confirmation_token. Also hide any column whose name
  suggests internal bookkeeping (instance_id, aud, banned_until_*,
  reauthentication_*, providers, identity_data) and large jsonb payload
  columns that are not the bodyColumn.

- relations: for each foreign-key column on this table, emit an entry
  describing how to surface it on the row detail page:
    { fkColumn: <string>, label: <string>, showOnDetail: <boolean> }
  - label is the singular noun for the referenced table ("Author",
    "Customer", "Post").
  - showOnDetail = true for FKs that meaningfully describe the row
    (a comment's post, an order's customer); false for bookkeeping FKs
    (created_by_id on a row that has many "made by user" relations).

Respond with JSON ONLY in this shape:
{
  "tables": [
    {
      "schema": string,
      "name": string,
      "category": "users" | "content" | "logs" | "commerce" | "tasks" | "messages" | "generic",
      "displayName": string,
      "listColumns": string[],
      "statusColumn": string | null,
      "titleColumn": string | null,
      "notes": string,
      "primary": {
        "titleColumn":    string | null,
        "subtitleColumn": string | null,
        "avatarColumn":   string | null,
        "badgeColumn":    string | null
      },
      "hiddenColumns": string[],
      "relations": [
        { "fkColumn": string, "label": string, "showOnDetail": boolean }
      ]
    }
  ]
}

Use exact column names as they appear in the input. Do not include any
tables not present in the input. Do not include explanations outside the
JSON.`;

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
