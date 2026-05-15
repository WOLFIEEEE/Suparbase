import Link from "next/link";
import { ArticleH2, Callout, CodeBlock } from "@/components/public/article-bits";

export const meta = {
  slug: "ai-assisted-database-admin",
  title: "The AI-Assisted Database Admin in 2026: What Actually Works",
  description:
    "Two years into LLM-assisted database operations, here's what we've learned shipping AI features in admin tools: tool-use beats text-to-SQL, schema-aware agents, confirm-then-execute writes, and the failure modes.",
  publishedAt: "2026-05-13",
  updatedAt: "2026-05-14",
  readingMinutes: 14,
  tags: ["ai", "postgres", "supabase", "tooling"],
  related: ["row-level-security-postgres-2026", "pgvector-rag-production", "ai-assisted-database-admin"],
  toc: [
    { id: "the-2023-failure", label: "Why 2023's text-to-SQL flopped" },
    { id: "tool-use-pattern", label: "The tool-use pattern that won" },
    { id: "schema-grounding", label: "Schema grounding" },
    { id: "confirm-execute", label: "Confirm-then-execute for writes" },
    { id: "audit-everything", label: "Audit everything" },
    { id: "failure-modes", label: "Failure modes in 2026" },
    { id: "what-comes-next", label: "What comes next" },
  ],
} as const;

export function Article() {
  return (
    <>
      <p>
        Almost every database tool now has a chat box. Some of them genuinely
        help; most are demos that fall apart the first time you point them
        at a real production schema. After two years of building, shipping,
        and operating an AI-assisted admin in production, here&apos;s what
        we&apos;ve learned about which patterns actually work.
      </p>

      <ArticleH2 id="the-2023-failure">Why 2023&apos;s text-to-SQL flopped</ArticleH2>

      <p>
        The first wave of LLM-on-databases was simple: prompt the model with
        a schema dump, give it a user question, ask for SQL, execute. By 2024
        every team that shipped this had the same complaint: it hallucinated
        column names. Tables that didn&apos;t exist. JOINs that referenced
        nonexistent foreign keys. Queries that looked right and weren&apos;t.
      </p>

      <p>The four root causes:</p>

      <ol>
        <li>
          <strong>Schemas don&apos;t fit in context.</strong> Real schemas have
          hundreds of tables. Stuffing them all into the prompt either truncated
          (model invents what it can&apos;t see) or cost a fortune in tokens
          per query.
        </li>
        <li>
          <strong>The model couldn&apos;t verify before writing.</strong>{" "}
          &quot;Generate SQL&quot; gives the model one shot. If it&apos;s wrong,
          it can&apos;t notice; only the human running the query notices, after
          it&apos;s already produced bad output.
        </li>
        <li>
          <strong>No feedback loop.</strong> When a query errored, the
          system handed the error back to the human, not to the model. So the
          same hallucinations recurred.
        </li>
        <li>
          <strong>Writes were terrifying.</strong> If reads occasionally
          fabricate, writes do too. &quot;Update all users&quot; with no
          confirmation is not a feature.
        </li>
      </ol>

      <ArticleH2 id="tool-use-pattern">The tool-use pattern that won</ArticleH2>

      <p>
        The model that has actually shipped in production by 2026 is a
        tool-using agent with narrow, schema-aware primitives. Instead of
        &quot;here&apos;s the schema, write SQL&quot;, the pattern is:
      </p>

      <ol>
        <li>The model is given a small set of tools (functions).</li>
        <li>The model decides which tool to call, and with what arguments.</li>
        <li>The server runs the tool, returns a result.</li>
        <li>The model decides what to do next: call another tool, or answer the user.</li>
        <li>The loop continues until the model produces a final reply.</li>
      </ol>

      <p>
        The tools for an admin agent look like this:
      </p>

      <CodeBlock language="ts" filename="tools.ts">{`type Tools = {
  list_tables(category?: string): TableSummary[];
  get_table_schema(table_name: string): ColumnInfo[];
  query_rows(args: {
    table_name: string;
    columns?: string[];
    filters?: Filter[];
    sort?: { column: string; direction: "asc" | "desc" };
    limit?: number;  // hard cap at 50
  }): { rows: Row[]; estimatedTotal: number };
  count_rows(args: { table_name: string; filters?: Filter[] }): { count: number };
};`}</CodeBlock>

      <p>
        Notice what&apos;s <em>not</em> there. No <code>run_arbitrary_sql</code>.
        The model can&apos;t fabricate columns because the tools validate every
        argument against the actual schema before they execute. If the model
        passes <code>tables.naame</code>, the tool returns &quot;column doesn&apos;t
        exist&quot; and the model corrects itself on the next turn.
      </p>

      <Callout variant="tip" title="The smaller the tool surface, the better">
        Counter-intuitively, fewer tools work better than more. The model has
        an easier time picking among 4 options than 20. Compose primitives at
        the orchestration layer, not the tool layer. &quot;Find the user with
        this email&quot; is <code>list_tables → get_table_schema(users) →
        query_rows(users, filters: [email ilike '%term%'])</code>, not a
        dedicated <code>find_user_by_email</code> tool.
      </Callout>

      <ArticleH2 id="schema-grounding">Schema grounding</ArticleH2>

      <p>
        The model needs to know what tables exist, but it doesn&apos;t need
        the full schema in the system prompt. Two-pass works much better:
      </p>

      <ol>
        <li>
          The system prompt tells the model that <code>list_tables</code> is
          its starting point and gives the table count.
        </li>
        <li>
          The model calls <code>list_tables</code> on its first turn,
          receives a compact catalogue (name + AI-inferred description +
          column count).
        </li>
        <li>
          For the 2-3 tables the model decides are relevant, it calls{" "}
          <code>get_table_schema</code> to load the full column list.
        </li>
        <li>
          Only then does it construct a query.
        </li>
      </ol>

      <p>
        This pattern uses ~10x fewer tokens than dumping the schema, and
        scales to schemas of any size. We&apos;ve tested it on production
        Supabase projects with 200+ tables; the model usually nails the right
        table on the first <code>list_tables</code> call.
      </p>

      <p>
        The &quot;AI-inferred description&quot; matters. A table called{" "}
        <code>tbl_usr_acc</code> is opaque; a description &quot;Users and
        their account metadata&quot; tells the model what it does. Generating
        these descriptions once per schema and caching them is cheap and
        durable. (This is exactly what our{" "}
        <Link href="/features">schema analysis</Link> does.)
      </p>

      <ArticleH2 id="confirm-execute">Confirm-then-execute for writes</ArticleH2>

      <p>
        Reads can be lossy and the worst that happens is a wrong answer.
        Writes can be catastrophic. The pattern that has actually shipped in
        production:
      </p>

      <ul>
        <li>
          The agent has <strong>no direct write tools</strong>. There&apos;s no{" "}
          <code>update_rows</code> or <code>delete_rows</code> in its toolbox.
        </li>
        <li>
          Instead, there are <strong>propose_*</strong> tools that build a
          proposal payload with: the planned change, the affected-row count,
          and a preview of the first N affected rows.
        </li>
        <li>
          The UI renders the proposal as a card with a diff and an{" "}
          <strong>Apply</strong> button.
        </li>
        <li>
          When the human clicks Apply, the server <em>re-validates</em> the
          proposal (re-counts affected rows, re-checks the diff would match)
          and executes it through the same audit-logged proxy as any other
          write.
        </li>
      </ul>

      <CodeBlock language="ts" filename="propose-update.ts">{`type ProposeUpdate = {
  table_name: string;
  filters: Filter[];     // identifying which rows to change
  patch: Record<string, unknown>;  // column -> new value
  summary: string;       // one-sentence English description for the user
};

type UpdateProposal = ProposeUpdate & {
  kind: "proposed_update";
  preview: Row[];       // up to 5 affected rows
  totalCount: number | null;
};`}</CodeBlock>

      <p>
        The crucial property: the agent <em>cannot</em> turn a proposal into
        an execution by itself. Only an explicit human click does that. This
        is the difference between a useful assistant and a foot-gun.
      </p>

      <ArticleH2 id="audit-everything">Audit everything</ArticleH2>

      <p>
        Every AI-assisted write needs to land in your audit log indistinguishably
        from a human-driven write, with one extra bit of metadata: that an
        agent originated the proposal. After an incident, you want to be able
        to answer &quot;who or what made this change?&quot; from a single
        query.
      </p>

      <p>For Suparbase, every Apply click writes:</p>

      <ul>
        <li>User id (the human who clicked).</li>
        <li>Connection id (which Supabase project was touched).</li>
        <li>Table, primary key, verb, HTTP status.</li>
        <li>The full before / after snapshot.</li>
        <li>The proposal text (so you can see what the agent suggested).</li>
      </ul>

      <p>
        The row history panel surfaces these per-row; the audit log on the
        dashboard shows them globally. Skipping this step is how teams end
        up with an unrecoverable Friday afternoon.
      </p>

      <ArticleH2 id="failure-modes">Failure modes in 2026</ArticleH2>

      <p>Two years in, the patterns that still fail:</p>

      <h3>1. Cross-table queries past three joins</h3>

      <p>
        Models in mid-2026 can compose two-table joins reliably. Three-table
        joins with non-obvious foreign keys are still where they invent
        relationships. The mitigation is to expose the foreign-key graph
        explicitly in the schema tool, so the model can see what joins exist
        before constructing them.
      </p>

      <h3>2. Aggregates over windows that exceed the model&apos;s context</h3>

      <p>
        &quot;Summarise the last 10,000 orders&quot; doesn&apos;t fit in
        context. You need to either give the model a SUM/COUNT tool with a
        narrow surface, or accept that the assistant&apos;s output is over
        a sample.
      </p>

      <h3>3. Time-relative queries</h3>

      <p>
        &quot;Users who signed up last week&quot; depends on what &quot;last
        week&quot; means. Embed the current time in the system prompt and
        define what relative ranges resolve to. Otherwise the model picks an
        arbitrary anchor.
      </p>

      <h3>4. Ambiguous tables</h3>

      <p>
        When two tables could match (<code>orders</code> and{" "}
        <code>archived_orders</code>), the model often picks the first one in
        alphabetical order. The fix: better descriptions in the schema
        analysis, and a system-prompt instruction to ask the user when
        ambiguous.
      </p>

      <ArticleH2 id="what-comes-next">What comes next</ArticleH2>

      <p>
        Three directions that look like they&apos;ll matter through 2026:
      </p>

      <ul>
        <li>
          <strong>Schema-aware refactoring proposals.</strong> &quot;This
          column has the wrong type&quot; or &quot;these two tables should be
          one&quot;, surfaced by the agent reviewing the schema, not by a
          query. Useful for migrations.
        </li>
        <li>
          <strong>RLS policy generation.</strong> Tell the agent the
          authorization model (&quot;users can only see their own orders, but
          admins see all&quot;) and have it emit a policy with the appropriate
          USING / WITH CHECK clauses. We&apos;ve experimented; the agent gets
          80% of the way there, and humans need to verify the last 20%.
        </li>
        <li>
          <strong>Anomaly detection over recent writes.</strong> The audit
          log + an agent + simple summarisation tools = &quot;tell me if
          anything weird happened today&quot;.
        </li>
      </ul>

      <p>
        None of these will replace the engineer in the loop. The bar that
        has shipped is &quot;the assistant makes the engineer faster at the
        things they were already going to do&quot;. That&apos;s the bar
        we&apos;ve held{" "}
        <Link href="/features">our AI chat</Link> to, and it&apos;s the bar
        we think other tools in the space should aim at too.
      </p>
    </>
  );
}
