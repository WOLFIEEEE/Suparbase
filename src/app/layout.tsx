import type { Metadata } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
