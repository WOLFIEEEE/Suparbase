import type { ChipSpec } from "./types";
import { chipToPostgrest } from "./operators";

const FILTER_PARAM = "filter";

/**
 * Replace every existing `filter` param on `sp` with one repeated entry per
 * chip. Other params are preserved. Returns a fresh URLSearchParams.
 */
export function serializeChipsToParams(
  chips: ChipSpec[],
  sp: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams();
  // Copy existing params except `filter`.
  for (const [key, value] of sp.entries()) {
    if (key === FILTER_PARAM) continue;
    next.append(key, value);
  }
  for (const chip of chips) {
    next.append(FILTER_PARAM, chipToInternalUrl(chip));
  }
  return next;
}

/** Inverse of parse-url's chip parser: `col.op.value` for internal URL. */
function chipToInternalUrl(chip: ChipSpec): string {
  // chipToPostgrest gives us `op.value`. Prefix with `col.`.
  return `${chip.column}.${chipToPostgrest(chip)}`;
}
