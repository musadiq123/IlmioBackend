/**
 * Lightweight in-memory rate limiter — no Redis dependency required.
 * For production at scale, replace with express-rate-limit + Redis store.
 *
 * Usage: rateLimiter({ windowMs, max, message })
 */
const rateLimiter = ({ windowMs = 60 * 1000, max = 60, message = 'Too many requests, please try again later.' } = {}) => {
  const hits = new Map(); // ip -> [timestamp, ...]

  // Prune stale buckets every window period to prevent memory growth
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of hits) {
      const fresh = timestamps.filter((t) => now - t < windowMs);
      if (fresh.length === 0) hits.delete(ip);
      else hits.set(ip, fresh);
    }
  }, windowMs);

  return (req, res, next) => {
    const ip  = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    const timestamps = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    timestamps.push(now);
    hits.set(ip, timestamps);

    res.set('X-RateLimit-Limit', max);
    res.set('X-RateLimit-Remaining', Math.max(0, max - timestamps.length));

    if (timestamps.length > max) {
      return res.status(429).json({ message });
    }

    next();
  };
};

// Preset: strict limit for auth endpoints (login / register)
const authRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,
  message: 'Too many authentication attempts. Please wait 15 minutes.',
});

// Preset: general API limit
const apiRateLimiter = rateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  max: 120,
  message: 'Request rate exceeded. Please slow down.',
});

module.exports = { rateLimiter, authRateLimiter, apiRateLimiter };
