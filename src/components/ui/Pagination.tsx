import { PAGE_SIZE_OPTIONS } from "@/hooks/usePagination";

interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function Pagination({ page, pageCount, pageSize, total, onPageChange, onPageSizeChange }: PaginationProps) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm text-white/50">
      <span>
        Showing {start}–{end} of {total}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          Per page
          <select
            className="input !w-auto !py-1.5"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button className="btn-ghost !px-3 !py-1.5" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            ← Prev
          </button>
          <span className="px-2 text-white/70">
            Page {page} / {pageCount}
          </span>
          <button
            className="btn-ghost !px-3 !py-1.5"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
