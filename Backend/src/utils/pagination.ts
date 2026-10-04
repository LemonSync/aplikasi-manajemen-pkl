/**
 * Helper pagination & parsing query.
 */

export interface PaginationParams {
  page: number;
  perPage: number;
  skip: number;
  take: number;
}

const MAX_PER_PAGE = 100;

export const parsePagination = (query: Record<string, unknown>): PaginationParams => {
  const page = Math.max(1, Number(query.page) || 1);
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, Number(query.perPage) || 10));
  return {
    page,
    perPage,
    skip: (page - 1) * perPage,
    take: perPage,
  };
};

/**
 * Membangun objek `orderBy` Prisma dari query `sortBy` & `sortDir`.
 * @example buildOrderBy(req.query, ['createdAt', 'name'], 'createdAt')
 */
export const buildOrderBy = (
  query: Record<string, unknown>,
  allowedFields: string[],
  fallback = 'createdAt'
): Record<string, 'asc' | 'desc'> => {
  const sortBy = typeof query.sortBy === 'string' && allowedFields.includes(query.sortBy)
    ? query.sortBy
    : fallback;
  const sortDir = query.sortDir === 'asc' ? 'asc' : 'desc';
  return { [sortBy]: sortDir };
};
