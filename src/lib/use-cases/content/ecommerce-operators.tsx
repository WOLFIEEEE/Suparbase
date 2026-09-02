import Link from "next/link";
import { ArrowRight, History, Mail, Pencil, Search, ShoppingCart, Truck } from "lucide-react";
import { CTABand, PageHeader, PageShell, SectionHeading } from "@/components/public/sections";

export const meta = {
  slug: "ecommerce-operators",
  title: "Suparbase for E-commerce Operators",
  description:
    "Order ops, refunds, customer support, returns. The admin workspace e-commerce founders and ops teams reach for when Shopify isn't enough or their stack is built on Supabase.",
  audience: "E-commerce ops + customer support",
  bullets: [
    "Cmd-K to find any order or customer in milliseconds",
    "Inline-edit shipping addresses, statuses, payment notes",
    "Audit log for every refund, edit, and cancellation",
    "AI chat for ad-hoc questions across orders, products, customers",
  ],
} as const;

export function Page() {
  return (
    <>
      <PageShell>
        <PageHeader
          eyebrow="Use case · E-commerce"
          title={
            <>
              The back-office for the
              <br className="hidden sm:inline" /> Supabase-backed shop.
            </>
          }
          subtitle="If you've outgrown Shopify Admin or you're running your own commerce stack on Supabase, you need an admin that knows about orders, customers, and refunds. Suparbase has archetype-aware views built for exactly that shape."
          actions={
            <>
              <Link
                href="/signup"
                className="inline-flex h-11 items-center gap-1.5 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02] hover:bg-accent/90"
              >
                Start free
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/features"
                className="inline-flex h-11 items-center rounded-md border hairline px-5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
              >
                See features
              </Link>
            </>
          }
        />
      </PageShell>

      <section className="border-t hairline bg-bg-raised/40">
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="What e-commerce teams use daily"
            title="The five operations you'll do twenty times a day"
          />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Need
              icon={Search}
              title="Find an order, fast"
              body="Cmd-K, paste the order number or the customer email. The order page is one click away. Beats fishing through three tabs in Shopify."
            />
            <Need
              icon={Pencil}
              title="Fix a shipping address before fulfilment"
              body="Click the address field. Edit. Enter. Done. Audit log captures the change with the original value."
            />
            <Need
              icon={ShoppingCart}
              title="Issue a refund + adjust order status in one click"
              body="The Commerce archetype groups status, totals, and line items together. Update status, leave a payment note, the audit log keeps the trail."
            />
            <Need
              icon={Mail}
              title="Look up customer history in seconds"
              body="From an order, jump to the customer; the User archetype shows last_sign_in_at, past orders, and metadata fields. The next email to the customer is informed."
            />
            <Need
              icon={Truck}
              title="Bulk-update shipping statuses"
              body="Filter orders by status='ready_to_ship', multi-select, bulk-update to 'shipped' with a tracking number from a CSV import. One operation in the audit log."
            />
            <Need
              icon={History}
              title="Answer 'why did this happen?' with proof"
              body="Every change has a row in the audit log. When a customer disputes a charge, you have the timeline. Half your chargeback rebuttals get easier."
            />
          </ul>
        </div>
      </section>

      <section>
        <div className="mx-auto w-full max-w-5xl px-6 py-16 md:py-20">
          <SectionHeading
            eyebrow="The AI angle"
            title="Questions your ops team would have queued for engineering"
          />
          <div className="mt-6 space-y-3 text-sm leading-relaxed text-fg-muted md:text-base">
            <p>
              &quot;How many orders shipped last week?&quot; The AI chat
              calls <code>count_rows</code> with the right filter. Twenty
              seconds, two cents in tokens.
            </p>
            <p>
              &quot;Which customers placed orders over $500 and then asked
              for a refund?&quot; The agent walks <code>orders</code> →{" "}
              <code>customers</code> →{" "}
              <code>refunds</code>, returns the list.
            </p>
            <p>
              &quot;What&apos;s the average days-between-order for our top 50
              customers?&quot; One propose-then-execute query. Apply if it
              looks right; the audit log notes it was AI-initiated.
            </p>
          </div>
        </div>
      </section>

      <CTABand
        title="Operate your shop without the admin tax."
        body="Five minutes to set up. Start free for solo work or try the Hosted team plan for seven days."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/pricing", label: "See pricing" }}
      />
    </>
  );
}

function Need({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  body: string;
}) {
  return (
    <li className="rounded-lg border hairline bg-bg-raised p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border-accent/40 bg-accent/10">
          <Icon className="h-4 w-4 text-accent" aria-hidden />
        </span>
        <h3 className="font-display text-base leading-tight">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">{body}</p>
    </li>
  );
}
