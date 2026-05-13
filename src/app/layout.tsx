import type { Metadata } from "next";
import { cookies } from "next/headers";
import { readThemeCookie } from "@/lib/theme/cookie";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Suparbase — managed admin for any Supabase",
    template: "%s · Suparbase",
  },
  description:
    "Sign in, save your Supabase projects, and run a real admin dashboard. Your keys stay on the server — never in the browser.",
  metadataBase: new URL(process.env.AUTH_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "Suparbase",
    description: "Managed admin for any Supabase project. Auth, encryption, audit, done.",
    type: "website",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = readThemeCookie(cookieStore);
  // Only set the attribute when the user has made an explicit choice. When
  // absent (or "system"), CSS prefers-color-scheme falls back to the OS pref.
  const dataTheme = theme === "light" || theme === "dark" ? theme : undefined;
  return (
    <html lang="en" data-theme={dataTheme} suppressHydrationWarning>
      <body className="bg-bg text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
