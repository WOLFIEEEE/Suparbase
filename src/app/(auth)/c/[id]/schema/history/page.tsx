import type { Metadata } from "next";
import { SchemaHistoryView } from "@/components/workspace/SchemaHistoryView";

export const metadata: Metadata = { title: "Schema history · Suparbase" };

export default function SchemaHistoryViewPage() {
  return <SchemaHistoryView />;
}
