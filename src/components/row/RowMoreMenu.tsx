"use client";
import Link from "next/link";
import { toast } from "sonner";
import { Braces, Copy, CopyPlus, Link2, MoreHorizontal, SquareCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { rowToInsertSql, rowToJson } from "@/lib/table/row-sql";
import type { Row, Table } from "@/lib/types/schema";

interface Props {
  connectionId: string;
  table: Table;
  row: Row;
  pkSegment: string;
  /** Editors see Duplicate; viewers only get the copy actions. */
  canEdit: boolean;
}

async function copyText(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error("Clipboard is not available in this browser.");
  }
}

/**
 * "More" menu on every row detail page: duplicate the row into a
 * prefilled new-row form, or copy it as JSON / an INSERT statement / a
 * deep link. Copy actions are local; nothing leaves the browser.
 */
export function RowMoreMenu({ connectionId, table, row, pkSegment, canEdit }: Props) {
  const tableHref = `/c/${connectionId}/tables/${encodeURIComponent(table.name)}`;
  const canDuplicate = canEdit && table.kind === "table";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="icon" aria-label="More row actions">
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Row</DropdownMenuLabel>
        {canDuplicate && (
          <DropdownMenuItem asChild>
            <Link href={`${tableHref}/new?from=${encodeURIComponent(pkSegment)}`}>
              <CopyPlus className="mr-2 h-3.5 w-3.5" aria-hidden /> Duplicate
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void copyText(rowToJson(table, row), "row as JSON")}>
          <Braces className="mr-2 h-3.5 w-3.5" aria-hidden /> Copy as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void copyText(rowToInsertSql(table, row), "INSERT statement")}>
          <SquareCode className="mr-2 h-3.5 w-3.5" aria-hidden /> Copy as SQL INSERT
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void copyText(`${window.location.origin}${tableHref}/${pkSegment}`, "link")}
        >
          <Link2 className="mr-2 h-3.5 w-3.5" aria-hidden /> Copy link
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void copyText(
              table.primaryKey.map((c) => String(row[c] ?? "")).join(", "),
              "primary key",
            )
          }
        >
          <Copy className="mr-2 h-3.5 w-3.5" aria-hidden /> Copy primary key
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
