import { JsonLd } from "@/components/public/JsonLd";
import { Prose } from "@/components/public/sections";

/**
 * Long-form SEO body for a tool page. `children` is written as plain prose
 * (h2 / p / ul), rendered through the shared Prose typography. `faqs` are
 * rendered as a visible FAQ section AND emitted as FAQPage structured data
 * so they can win a rich result. Answers are plain strings so the visible
 * copy and the schema never drift apart.
 */
export interface Faq {
  q: string;
  a: string;
}

export function ToolContent({
  children,
  faqs,
}: {
  children: React.ReactNode;
  faqs?: Faq[];
}) {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 pb-8">
      <div className="border-t hairline pt-12 md:pt-16">
        <Prose>{children}</Prose>
        {faqs && faqs.length > 0 && <FaqBlock faqs={faqs} />}
      </div>
    </section>
  );
}

function FaqBlock({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="mt-12">
      <h2 className="font-display text-xl leading-tight text-fg md:text-2xl">
        Frequently asked questions
      </h2>
      <dl className="mt-5 divide-y divide-[rgb(var(--line))] border-y hairline">
        {faqs.map((f) => (
          <div key={f.q} className="py-4">
            <dt className="font-display text-base leading-snug text-fg">{f.q}</dt>
            <dd className="mt-1.5 max-w-3xl text-sm leading-relaxed text-fg-muted">{f.a}</dd>
          </div>
        ))}
      </dl>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
    </div>
  );
}
