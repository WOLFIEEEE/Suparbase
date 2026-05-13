"use client";
import { TableListView } from "@/components/workspace/TableListView";
import type { PresetProps } from "./types";

export default function GenericAdmin({ table }: PresetProps) {
  // GenericAdmin is the existing data-driven CRUD experience.
  return <TableListView tableName={table.name} />;
}
