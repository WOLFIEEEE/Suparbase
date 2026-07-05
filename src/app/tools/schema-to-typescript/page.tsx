import type { Metadata } from "next";
import { PublicLayout } from "@/components/public/PublicLayout";
import { CTABand, PageHeader, PageShell } from "@/components/public/sections";
import { JsonLd } from "@/components/public/JsonLd";
import { TypeGenTool } from "@/components/tools/TypeGenTool";
import { ToolContent } from "@/components/tools/ToolContent";
import { toolBySlug } from "@/lib/tools/registry";
import { absoluteUrl } from "@/lib/seo/site";

const tool = toolBySlug("schema-to-typescript")!;

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
          title="Postgres to TypeScript type generator"
          subtitle="Paste your Supabase or Postgres schema and get typed interfaces or Zod schemas, with the right nullability and array handling. No install, no account, nothing uploaded."
        />
        <div className="mt-10">
          <TypeGenTool />
        </div>
      </PageShell>

      <ToolContent
        faqs={[
          {
            q: "How does it decide if a field can be null?",
            a: "A column marked NOT NULL, or one that is part of the primary key, becomes a required non-null field. Every other column is treated as nullable, so its type gets a null option in TypeScript and a .nullable() in Zod. That matches how a row actually comes back from the database.",
          },
          {
            q: "What does it do with jsonb columns?",
            a: "A json or jsonb column becomes unknown in TypeScript and z.unknown() in Zod, because the shape is not described in the schema. Narrow it yourself where you read it, or replace unknown with a specific interface once you know the payload.",
          },
          {
            q: "Does it handle arrays and custom types?",
            a: "Yes for arrays: a text[] column becomes string[], and the Zod output wraps the element validator in z.array. Types it does not recognise, including enums and custom domains, fall back to unknown so the output still compiles. You can swap those for a union or a specific type by hand.",
          },
          {
            q: "Is this the same as supabase gen types?",
            a: "It covers the same need, generate types from your schema, but it works from pasted DDL instead of a live connection or the CLI. That makes it handy for a quick one-off, a schema you are still drafting, or a table you copied from a migration. For a full generated Database type across every table, the Supabase CLI is still the tool to reach for.",
          },
          {
            q: "Is my schema sent anywhere?",
            a: "No. Parsing and code generation run entirely in your browser. The DDL you paste is never uploaded or stored, so it is safe to use with a production schema.",
          },
        ]}
      >
        <h2>Generate TypeScript types from a Postgres schema</h2>
        <p>
          Keeping your TypeScript types in sync with your database is tedious work that is easy
          to get subtly wrong. A column is nullable but the type says it is not, an array comes
          back as a string, a timestamp is typed as a Date when the API actually returns a
          string. This tool takes that guesswork away. Paste your <code>CREATE TABLE</code>{" "}
          statements and it writes an interface for each table, with every column mapped to the
          type it really has.
        </p>
        <p>
          It reads the same DDL that our <a href="/tools/schema-visualizer">schema visualizer</a>{" "}
          uses, so you can diagram a schema and type it from the exact same paste. Switch between
          plain TypeScript interfaces and Zod schemas with one click, and copy the result
          straight into your project.
        </p>

        <h2>How the types are mapped</h2>
        <ul>
          <li>
            <code>uuid</code>, <code>text</code>, <code>varchar</code>, and the character types
            become <code>string</code>.
          </li>
          <li>
            <code>int</code>, <code>bigint</code>, <code>numeric</code>, and the floating types
            become <code>number</code>.
          </li>
          <li>
            <code>boolean</code> becomes <code>boolean</code>, and{" "}
            <code>timestamptz</code>, <code>date</code>, and <code>time</code> become{" "}
            <code>string</code>, matching what the REST API returns.
          </li>
          <li>
            <code>jsonb</code> becomes <code>unknown</code> so you narrow it deliberately, and{" "}
            an array type like <code>text[]</code> becomes <code>string[]</code>.
          </li>
          <li>
            Nullable columns get a <code>| null</code> in TypeScript or a <code>.nullable()</code>{" "}
            in Zod, so the types tell the truth about what can be missing.
          </li>
        </ul>

        <h2>TypeScript interfaces or Zod schemas</h2>
        <p>
          TypeScript interfaces are what you want for typing query results and props. Zod schemas
          go a step further: they validate data at runtime, which is exactly what you need when
          the data crosses a boundary you do not control, like a webhook body, a form submission,
          or an API response. The Zod output includes an inferred type for each table with{" "}
          <code>z.infer</code>, so you get both the validator and the static type from one
          definition.
        </p>

        <h2>Where types stop and the workspace begins</h2>
        <p>
          Typed rows make your code safer to write. Working with the rows themselves is the next
          step. A Suparbase account connects to a Supabase project and gives you type-aware
          editing, foreign-key lookups, filtering, and bulk operations through an encrypted
          server-side proxy, so your API key never reaches the browser. Generate the types here,
          then operate on the data there.
        </p>
      </ToolContent>

      <CTABand
        title="Types are step one. Operating on the data is step two."
        body="Connect a Supabase project to Suparbase for a full admin workspace, with type-aware editing and an encrypted server-side proxy that keeps your key off the client."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/features", label: "See the full product" }}
      />
    </PublicLayout>
  );
}
