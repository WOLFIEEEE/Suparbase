import type { Metadata } from "next";
import { SchemaErdView } from "@/components/workspace/SchemaErdView";

export const metadata: Metadata = { title: "ERD · Suparbase" };

export default function SchemaErdViewPage() {
  return <SchemaErdView />;
}
