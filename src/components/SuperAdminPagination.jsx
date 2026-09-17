import React from 'react';

export const DEFAULT_PAGE_SIZE = 6;
export const BLOG_PAGE_SIZE = 3;

export function useSuperAdminPagination(items, deps = [], pageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = React.useState(1);
  const size = Math.max(Number(pageSize) || DEFAULT_PAGE_SIZE, 1);

  React.useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, size, ...deps]);

  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const safePage = Math.min(page, totalPages);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedItems = React.useMemo(() => {
    const start = (safePage - 1) * size;
    return items.slice(start, start + size);
  }, [items, safePage, size]);

  return {
    page: safePage,
    setPage,
    totalPages,
    paginatedItems,
    pageSize: size,
    totalItems: items.length,
  };
}

export function PrevNextPagination({
  page,
  totalPages,
  onPageChange,
  disabled = false,
  className = '',
  buttonClassName = 'rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40',
}) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-end gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={disabled || page <= 1}
        className={buttonClassName}
      >
        Previous
      </button>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || page >= totalPages}
        className={buttonClassName}
      >
        Next
      </button>
    </div>
  );
}

export default function SuperAdminPagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  pageSize = DEFAULT_PAGE_SIZE,
  disabled = false,
}) {
  if (totalItems <= pageSize) return null;

  return (
    <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
      <PrevNextPagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        disabled={disabled}
      />
    </div>
  );
}
