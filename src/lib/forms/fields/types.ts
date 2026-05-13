import type { Column, Schema, Table } from "@/lib/schema/types";

export interface FieldProps {
  id: string;
  column: Column;
  table: Table;
  schema: Schema;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}
