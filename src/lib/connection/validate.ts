export type UrlValidation =
  | { ok: true; url: string; hostname: string }
  | { ok: false; reason: string };

const ALLOWED_TLDS = [".supabase.co", ".supabase.in"];

export function validateUrl(input: string): UrlValidation {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "Project URL is required." };

  // Allow user to omit the scheme.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That doesn't look like a valid URL." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "URL must use https://" };
  }

  const host = parsed.hostname;
  const isSupabaseHost = ALLOWED_TLDS.some((tld) => host.endsWith(tld));
  if (!isSupabaseHost) {
    return {
      ok: false,
      reason: "URL must point to a *.supabase.co (or *.supabase.in) project.",
    };
  }

  // Strip any path / query — we only need the origin.
  return { ok: true, url: parsed.origin, hostname: host };
}

export function validateKey(input: string): { ok: true; key: string } | { ok: false; reason: string } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "API key is required." };
  if (trimmed.split(".").length !== 3) {
    return { ok: false, reason: "API key should be a JWT (three dot-separated segments)." };
  }
  return { ok: true, key: trimmed };
}
