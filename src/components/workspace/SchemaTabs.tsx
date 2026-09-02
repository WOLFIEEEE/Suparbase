"use client";
import { PageHeaderTab } from "@/components/workspace/PageHeader";

export type SchemaTabId = "columns" | "erd" | "types" | "history";

const TABS: Array<{ id: SchemaTabId; sub: string; label: string }> = [
  { id: "columns", sub: "", label: "Columns" },
  { id: "erd", sub: "/erd", label: "ERD" },
  { id: "types", sub: "/types", label: "Types" },
  { id: "history", sub: "/history", label: "History" },
];

/** Tab strip shared by every /c/[id]/schema/* page. */
export function SchemaTabs({ connectionId, active }: { connectionId: string; active: SchemaTabId }) {
  const base = `/c/${connectionId}/schema`;
  return (
    <>
      {TABS.map((t) => (
        <PageHeaderTab key={t.id} href={`${base}${t.sub}`} active={active === t.id}>
          {t.label}
        </PageHeaderTab>
      ))}
    </>
  );
}
