# Contract — Audit Log

## Insertion

Audit rows are inserted by the proxy handler after a successful 2xx
response from the user's Supabase. The insert is fire-and-forget (no
await on the response stream), so a slow audit insert cannot delay the
user-visible response.

```ts
// src/server/audit/log.ts
export async function auditWrite(input: {
  userId: string;
  connectionId: string;
  schemaName: string;
  tableName: string;
  primaryKey: Record<string, unknown>;
  verb: "insert" | "update" | "delete";
  httpStatus: number;
}): Promise<void>
```

## Retention

Indefinite in v1. Operators may add a cron'd `DELETE FROM audit_log
WHERE created_at < now() - interval '90 days'` outside the app.

## Privacy posture

- We do NOT store the row body — only the primary key.
- We do NOT store the user's API key or any header value.
- `userId` and `connectionId` use ON DELETE SET NULL so audit history
  survives user/connection deletion (operator may purge later).

## Surfacing in UI

Audit log is not surfaced in the user UI in v1 — it exists for
operator-side incident response. Future work: a "Recent activity" tab
per connection.

## Sampling

We don't sample writes (volume is bounded by the 60/min rate limit
per user).
