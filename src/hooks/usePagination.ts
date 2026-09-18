import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 50, 100] as const;

// Client-side pagination over an already-filtered array. Resets to page 1
// whenever the input array identity/length changes (e.g. a search/filter
// narrows the result set), so you never land on an empty trailing page.
export function usePagination<T>(items: T[], defaultPageSize: number = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);

  useEffect(() => {
    setPage(1);
  }, [total]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  function changePageSize(size: number) {
    setPageSize(size);
    setPage(1);
  }

  return {
    page: currentPage,
    pageSize,
    pageCount,
    total,
    pageItems,
    setPage,
    changePageSize,
  };
}
