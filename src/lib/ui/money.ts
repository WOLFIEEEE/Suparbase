/**
 * Money formatting for the Commerce archetype.
 *
 * Inputs come in a few shapes:
 *  - regular number: 1234.56 → $1,234.56
 *  - integer in _cents column: 123456 → $1,234.56 (divides by 100)
 *  - string: parsed as Number, fallback to raw if not numeric
 *
 * The currency code can be supplied (when the row has a `currency`
 * column); defaults to USD.
 */
export function formatMoney(
  raw: unknown,
  currency: string | null | undefined,
  isCents: boolean,
): string {
  if (raw == null) return "—";
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  const value = isCents ? n / 100 : n;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency ?? "USD").toUpperCase(),
      currencyDisplay: "symbol",
    }).format(value);
  } catch {
    // Bad currency code — fall back to USD.
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    }).format(value);
  }
}

const MONEY_NAME_RE =
  /^(total|total_amount|amount|amount_cents|price|price_cents|subtotal|fee|tax|grand_total|paid|due)$/i;

export function isMoneyColumnName(name: string): boolean {
  return MONEY_NAME_RE.test(name) || /_cents$|_amount$|_price$/i.test(name);
}

export function isCentsColumnName(name: string): boolean {
  return /_cents$|amount_cents$/i.test(name);
}

/** Known order/payment workflow vocab → step index for the pipeline. */
const COMMERCE_PIPELINE = [
  ["draft", "pending", "open", "created"],
  ["paid", "processing", "captured", "confirmed"],
  ["shipped", "fulfilling", "fulfilled"],
  ["delivered", "completed", "closed"],
] as const;

export const COMMERCE_TERMINAL_STATES = new Set([
  "refunded",
  "cancelled",
  "canceled",
  "failed",
  "void",
  "voided",
  "expired",
]);

/**
 * Map a status value to its step index in a 4-step commerce pipeline.
 * Returns -1 for unknown / terminal states (rendered as a single chip).
 */
export function pipelineStepFor(status: string | null | undefined): number {
  if (!status) return -1;
  const s = status.toLowerCase().trim();
  if (COMMERCE_TERMINAL_STATES.has(s)) return -1;
  for (let i = 0; i < COMMERCE_PIPELINE.length; i++) {
    if ((COMMERCE_PIPELINE[i] as readonly string[]).includes(s)) return i;
  }
  return -1;
}

export const COMMERCE_STEP_LABELS = ["Placed", "Paid", "Shipped", "Delivered"];
