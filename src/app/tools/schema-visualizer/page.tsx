import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd } from "@/components/public/JsonLd";
import { SchemaVisualizerTool } from "@/components/tools/SchemaVisualizerTool";
import { ToolContent } from "@/components/tools/ToolContent";
import { toolBySlug } from "@/lib/tools/registry";
import { absoluteUrl } from "@/lib/seo/site";

const tool = toolBySlug("schema-visualizer")!;

export const metadata: Metadata = {
  title: `${tool.title} · Free · Suparbase`,
  description: tool.description,
  alternates: { canonical: absoluteUrl(`/tools/${tool.slug}`) },
  openGraph: { title: tool.title, description: tool.description, type: "website" },
};

export default function Page() {
  return (
    <PublicLayout>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: tool.title,
          description: tool.description,
          url: absoluteUrl(`/tools/${tool.slug}`),
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      <PageShell>
        <PageHeader
          eyebrow="Free tool · runs in your browser"
          title="Schema → ERD Visualizer"
          subtitle="Paste your Postgres DDL or a pg_dump and get an entity-relationship diagram with foreign-key links. Copy the SVG straight into your docs."
        />
        <div className="mt-10">
          <SchemaVisualizerTool />
        </div>
      </PageShell>

      <ToolContent
        faqs={[
          {
            q: "What input does the visualizer accept?",
            a: "Any Postgres DDL. That includes CREATE TABLE statements copied from the Supabase SQL editor, the output of pg_dump with the schema-only flag, or a migration file. It reads column names and types, primary keys, and foreign keys, both inline REFERENCES and table-level FOREIGN KEY constraints.",
          },
          {
            q: "Is my schema uploaded anywhere?",
            a: "No. Parsing and drawing happen entirely in your browser. The DDL you paste never leaves your machine, so it is safe to use with a production schema.",
          },
          {
            q: "How do I get my schema out of Supabase?",
            a: "The quickest way is the SQL editor. Run a query that returns your table definitions, or open the Table Editor and copy the CREATE statements. If you have the database connection string, pg_dump with the --schema-only flag gives you the full DDL in one file.",
          },
          {
            q: "Can I download the diagram?",
            a: "Yes. The diagram renders as an SVG, and the Download SVG button saves it as a vector file. It scales cleanly, so you can drop it into documentation, a README, or a slide without it going blurry.",
          },
          {
            q: "Why is a foreign key pointing at a table that is not drawn?",
            a: "That happens when the DDL references a table you did not paste, for example a table in the auth schema. The tool keeps working and adds a small note so you know a relationship points somewhere outside the diagram. Paste the missing table to complete the picture.",
          },
        ]}
      >
        <h2>Turn Postgres DDL into an entity-relationship diagram</h2>
        <p>
          A schema is easy to read one table at a time and hard to hold in your head all at
          once. An entity-relationship diagram fixes that. It lays every table out as a box,
          lists its columns, marks the primary key, and draws a line for each foreign key, so
          the shape of the data becomes obvious. This tool builds that diagram from plain SQL.
          Paste your <code>CREATE TABLE</code> statements and the diagram appears.
        </p>
        <p>
          It is built for Supabase and Postgres schemas specifically, so it understands the
          things those schemas actually use: quoted identifiers, <code>numeric(10,2)</code> and
          array types, <code>uuid</code> primary keys with <code>gen_random_uuid()</code>
          defaults, and foreign keys written either inline with <code>REFERENCES</code> or as a
          separate constraint.
        </p>

        <h2>When a diagram helps</h2>
        <ul>
          <li>
            Onboarding someone new to a codebase, where the fastest explanation of the data
            model is a picture rather than a tour of migration files.
          </li>
          <li>
            Planning a change, when you need to see which tables a new foreign key will touch
            before you write the migration.
          </li>
          <li>
            Documentation, where a current diagram in the README saves everyone from reading
            the schema by hand.
          </li>
          <li>
            Reviewing an inherited project, where the relationships between tables are not
            obvious until you can see them.
          </li>
        </ul>

        <h2>How to read the diagram</h2>
        <p>
          Each box is a table. The row with a key icon is the primary key. A column shown in the
          accent colour is a foreign key, and the line running from it points to the table it
          references, with an arrowhead at the target. Column types sit on the right of each
          row. If two tables are joined by a foreign key, you will always see a line between
          them, which makes many-to-one relationships easy to spot at a glance.
        </p>

        <h2>From diagram to a working admin</h2>
        <p>
          Seeing the schema is the first step. The next one is usually working with the data
          inside it. A Suparbase account connects to a Supabase project and gives you row
          browsing, type-aware editing, foreign-key lookups, and bulk operations, all through an
          encrypted server-side proxy so your API key never reaches the browser. The diagram
          shows you the structure. The workspace lets you operate on it.
        </p>
      </ToolContent>

      <CTABand
        title="Diagrams are nice. Editing the data is better."
        body="Connect a Supabase project to Suparbase and browse, edit, and bulk-operate on real rows through an encrypted server-side proxy, so your key never reaches the browser."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/features", label: "See the full product" }}
      />
    </PublicLayout>
  );
}
