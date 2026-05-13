import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationBarProps {
  page: number;
  pageSize: number;
  totalCount: number | null;
  onPageChange: (page: number) => void;
}

export function PaginationBar({ page, pageSize, totalCount, onPageChange }: PaginationBarProps) {
  const totalPages =
    totalCount != null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;
  const from = (page - 1) * pageSize + 1;
  const to = totalCount != null ? Math.min(page * pageSize, totalCount) : page * pageSize;

  return (
    <div className="flex items-center justify-between gap-3 text-xs text-fg-muted">
      <div className="tabular-nums">
        {totalCount != null ? (
          totalCount === 0 ? (
            <>0 rows</>
          ) : (
            <>
              {from.toLocaleString()}–{to.toLocaleString()} of{" "}
              <span className="text-fg">{totalCount.toLocaleString()}</span>
            </>
          )
        ) : (
          <>page {page}</>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <div className="px-2 tabular-nums">
          {page}
          {totalPages != null && <span className="text-fg-faint"> / {totalPages}</span>}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={totalPages != null ? page >= totalPages : false}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
