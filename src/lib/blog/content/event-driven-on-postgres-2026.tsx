import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "event-driven-on-postgres-2026",
  title: "Event-Driven Architecture on Postgres in 2026",
  description:
    "You don't need Kafka. Postgres ships LISTEN/NOTIFY, logical replication, and the outbox pattern. The 2026 guide to event-driven on the database you already have.",
  publishedAt: "2026-05-11",
  updatedAt: "2026-05-14",
  readingMinutes: 12,
  tags: ["postgres", "events", "architecture"],
  related: ["postgres-mvcc-when-it-bites", "multi-tenant-saas-postgres", "postgres-observability-stack-2026"],
  toc: [
    { id: "the-pitch", label: "Why Postgres for events" },
    { id: "listen-notify", label: "LISTEN/NOTIFY" },
    { id: "outbox", label: "The outbox pattern" },
    { id: "logical-replication", label: "Logical replication" },
    { id: "when-to-add-kafka", label: "When you actually need Kafka" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Event-driven architecture suffers from premature complexity. Teams
        reach for Kafka or Pulsar at scale they don&apos;t have, paying
        operational tax for years before they need it. Postgres has the
        primitives for most real event-driven needs; you ship faster and
        graduate later if you actually have to.
      </p>

      <ArticleH2 id="the-pitch">Why Postgres for events</ArticleH2>
      <p>Three things Postgres gives you:</p>
      <ul>
        <li>
          <strong>LISTEN/NOTIFY</strong>: pub/sub semantics over a
          connection. Real-time notifications when something happens.
        </li>
        <li>
          <strong>Logical replication</strong>: stream changes from a
          publication to subscribers. The basis of every Supabase Realtime
          dashboard and most CDC pipelines.
        </li>
        <li>
          <strong>The outbox pattern</strong>: events written in the same
          transaction as the business data, drained by a worker.
        </li>
      </ul>
      <p>Together these cover ~90% of the &quot;we need events&quot; use cases.</p>

      <ArticleH2 id="listen-notify">LISTEN/NOTIFY</ArticleH2>
      <p>
        The simplest mechanism. A trigger fires <code>NOTIFY</code> on a
        channel; subscribers <code>LISTEN</code>.
      </p>
      <CodeBlock language="sql" filename="notify-on-write.sql">{`-- Trigger: when an order is created, NOTIFY
CREATE OR REPLACE FUNCTION notify_order_created()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('orders', json_build_object('id', NEW.id, 'tenant_id', NEW.tenant_id)::text);
  RETURN NEW;
END $$;

CREATE TRIGGER orders_created_notify
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_order_created();`}</CodeBlock>
      <p>Application side (Node + postgres-js):</p>
      <CodeBlock language="ts">{`import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const listener = await sql.listen("orders", (msg) => {
  console.log("new order:", msg);
});`}</CodeBlock>
      <Callout variant="watch-out" title="LISTEN/NOTIFY's limits">
        Messages are not durable. A subscriber that&apos;s offline misses
        them entirely. Payloads are limited to 8KB. Use LISTEN/NOTIFY for
        &quot;wake up and check the database&quot;, not as a message queue.
      </Callout>

      <ArticleH2 id="outbox">The outbox pattern</ArticleH2>
      <p>
        For durable, replayable events. Every transaction that updates
        business data also inserts an event row into an <code>outbox</code>{" "}
        table. A worker drains the outbox and dispatches the events
        (HTTP webhook, queue, downstream service).
      </p>
      <CodeBlock language="sql" filename="outbox.sql">{`CREATE TABLE outbox (
  id         bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  topic      text NOT NULL,           -- 'order.created'
  payload    jsonb NOT NULL,
  dispatched_at timestamptz
);
CREATE INDEX outbox_pending_idx
  ON outbox (occurred_at)
  WHERE dispatched_at IS NULL;`}</CodeBlock>
      <CodeBlock language="ts" filename="dispatch.ts">{`// Run on a schedule (every second or so).
async function dispatch() {
  const batch = await sql\`
    SELECT id, topic, payload
    FROM outbox
    WHERE dispatched_at IS NULL
    ORDER BY occurred_at
    LIMIT 100
    FOR UPDATE SKIP LOCKED
  \`;
  for (const ev of batch) {
    await sendToDownstream(ev.topic, ev.payload);
    await sql\`UPDATE outbox SET dispatched_at = now() WHERE id = \${ev.id}\`;
  }
}`}</CodeBlock>
      <p>
        <code>FOR UPDATE SKIP LOCKED</code> is the magic word; it lets
        multiple workers drain the same outbox concurrently without
        stepping on each other.
      </p>

      <ArticleH2 id="logical-replication">Logical replication</ArticleH2>
      <p>
        Built-in CDC. You create a publication on the source, a
        subscription on the target; Postgres streams INSERT/UPDATE/DELETE
        changes.
      </p>
      <p>Common uses:</p>
      <ul>
        <li>
          Replicate to a read-only analytics database (so analytics queries
          don&apos;t affect the OLTP workload).
        </li>
        <li>
          Feed a search index. <code>pg_replication_slot</code> + a CDC
          consumer (Debezium, or a custom Go service) pipes changes to
          Elasticsearch / OpenSearch.
        </li>
        <li>
          Power Supabase Realtime. The platform&apos;s realtime service
          reads logical replication and pushes WebSocket events.
        </li>
      </ul>

      <ArticleH2 id="when-to-add-kafka">When you actually need Kafka</ArticleH2>
      <p>Concrete signals:</p>
      <ul>
        <li>
          You need multiple consumers replaying the same event stream from
          arbitrary points. Postgres can do this with logical slots, but
          managing many slots gets operational.
        </li>
        <li>
          You&apos;re processing 50k+ events per second sustained. Above
          this point Postgres&apos; WAL backpressure starts mattering and
          Kafka&apos;s log-as-disk design wins.
        </li>
        <li>
          You need cross-region replication of your event stream with
          strong ordering guarantees per partition.
        </li>
      </ul>
      <p>If none of these apply, you don&apos;t need Kafka. You need the outbox pattern.</p>

      <Callout variant="sparkle" title="The honest 2026 take">
        Most teams who think they need Kafka actually need the outbox
        pattern + a worker. Most teams who think they need an event bus
        actually need LISTEN/NOTIFY. Most teams who think they need
        CDC actually need logical replication directly to a read replica.
        Postgres covers the 90%; the operational cost difference vs Kafka
        is huge for small and mid-sized teams.
      </Callout>
    </>
  );
}
