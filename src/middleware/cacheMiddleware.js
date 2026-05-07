const cache = require('../utils/cache');

/**
 * Express middleware: cache GET responses.
 * The cache key is derived from the request URL (including query string).
 * Only caches 2xx responses.
 *
 * Usage:
 *   router.get('/live/count', auth, cacheResponse(30), getLiveClassesCount);
 *   // ^^ caches for 30 seconds
 */
const cacheResponse = (ttlSeconds = 60) => async (req, res, next) => {
  if (req.method !== 'GET') return next();

  const key = `http:${req.originalUrl}`;
  const cached = await cache.get(key);

  if (cached !== null) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  // Intercept res.json to store the response
  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      await cache.set(key, body, ttlSeconds);
    }
    res.set('X-Cache', 'MISS');
    return originalJson(body);
  };

  next();
};

module.exports = { cacheResponse };
