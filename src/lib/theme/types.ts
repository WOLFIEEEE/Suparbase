export type Theme = "light" | "dark" | "system";

export const THEME_COOKIE = "suparbase-theme";

export function isTheme(v: unknown): v is Theme {
  return v === "light" || v === "dark" || v === "system";
}
