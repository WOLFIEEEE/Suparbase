import { THEME_COOKIE, isTheme, type Theme } from "./types";

/**
 * Server-side reader. Pass the cookie store from `next/headers`'s `cookies()`.
 * Returns `null` when no preference has been recorded.
 *
 * Typed minimally so this module stays import-able from both server and
 * client contexts (the client side never calls this fn).
 */
interface CookieStoreLike {
  get(name: string): { value: string } | undefined;
}

export function readThemeCookie(store: CookieStoreLike): Theme | null {
  const raw = store.get(THEME_COOKIE)?.value;
  return raw && isTheme(raw) ? raw : null;
}

/** Client-side writer. Use from a `"use client"` component. */
export function writeThemeCookie(theme: Theme): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}
