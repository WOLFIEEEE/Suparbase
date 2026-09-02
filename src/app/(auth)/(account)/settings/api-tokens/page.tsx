import type { Metadata } from "next";
import { ApiTokensPanel } from "@/components/settings/ApiTokensPanel";

export const metadata: Metadata = { title: "API tokens · Suparbase" };

export default function ApiTokensPage() {
  return <ApiTokensPanel />;
}
