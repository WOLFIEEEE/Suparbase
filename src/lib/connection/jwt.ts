export type KeyRole = "anon" | "authenticated" | "service_role" | "unknown";

interface JwtPayload {
  role?: string;
  iss?: string;
  exp?: number;
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  try {
    return atob(padded + pad);
  } catch {
    return "";
  }
}

export function decodeJwtRole(token: string): KeyRole {
  const parts = token.split(".");
  if (parts.length !== 3) return "unknown";
  const decoded = base64UrlDecode(parts[1] ?? "");
  if (!decoded) return "unknown";
  let payload: JwtPayload;
  try {
    payload = JSON.parse(decoded) as JwtPayload;
  } catch {
    return "unknown";
  }
  const role = payload.role;
  if (role === "anon" || role === "authenticated" || role === "service_role") {
    return role;
  }
  return "unknown";
}
