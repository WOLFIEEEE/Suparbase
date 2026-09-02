import type { Metadata } from "next";
import { SchemaTypesView } from "@/components/workspace/SchemaTypesView";

export const metadata: Metadata = { title: "Types · Suparbase" };

export default function SchemaTypesViewPage() {
  return <SchemaTypesView />;
}
