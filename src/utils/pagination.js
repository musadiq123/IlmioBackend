/**
 * Parse and validate pagination query params.
 * Returns { page, limit, skip } ready for Mongoose queries.
 */
const parsePagination = (query, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  const page  = Math.max(1, parseInt(query.page,  10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

/**
 * Build the standard pagination envelope returned in all list endpoints.
 */
const paginationMeta = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

module.exports = { parsePagination, paginationMeta };
