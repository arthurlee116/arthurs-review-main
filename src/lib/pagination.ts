export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

export function pageWindow(total: number, requestedPage: number | undefined, requestedPageSize: number) {
  const pageSize = Math.max(1, Math.floor(requestedPageSize));
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const normalizedPage = requestedPage && Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
  const page = totalPages === 0 ? 1 : Math.min(normalizedPage, totalPages);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    offset: (page - 1) * pageSize,
  };
}
