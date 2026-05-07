/**
 * Simple TTL-based in-memory cache.
 * Drop-in replacement interface when Redis is not available.
 * Swap out by replacing get/set/del with ioredis calls when you add Redis.
 *
 * Usage:
 *   cache.set('key', value, 60)      // TTL in seconds
 *   const val = await cache.get('key')
 *   await cache.del('key')
 *   await cache.delPattern('classes:*')
 */

const store = new Map(); // key -> { value, expiresAt }

const cache = {
  async get(key) {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.value;
  },

  async set(key, value, ttlSeconds = 60) {
    store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  },

  async del(key) {
    store.delete(key);
  },

  async delPattern(pattern) {
    // pattern supports trailing '*' wildcard
    const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : null;
    for (const key of store.keys()) {
      if (prefix ? key.startsWith(prefix) : key === pattern) {
        store.delete(key);
      }
    }
  },

  size() {
    return store.size;
  },
};

// Evict expired entries every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 5 * 60 * 1000);

module.exports = cache;
