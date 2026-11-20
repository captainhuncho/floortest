/**
 * A rate limit kept in this server's memory, for hot read-only endpoints where writing a `rate_events` row on every
 * request would cost more than the request itself (the public receipt pulse, 19 Nov). Each key is a token bucket:
 * `burst` requests at once, then one more every `everyMs`. Memory only, so the count is per server instance, not
 * shared: it slows a script down cheaply and never touches the database. Bounded: past `maxKeys` the least recently
 * used key is dropped (it simply starts full again).
 */
export function memoryLimit(burst: number, everyMs: number, maxKeys = 5000) {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return {
    /** Takes one request for `key`; false when it's over the limit. */
    take(key: string, now = Date.now()) {
      const b = buckets.get(key);
      const tokens = b ? Math.min(burst, b.tokens + (now - b.at) / everyMs) : burst;
      buckets.delete(key);
      if (tokens < 1) {
        buckets.set(key, { tokens, at: now });
        return false;
      }
      buckets.set(key, { tokens: tokens - 1, at: now });
      if (buckets.size > maxKeys) buckets.delete(buckets.keys().next().value!);
      return true;
    },
    /** Seconds until `key` gets its next request (for Retry-After), at least 1. */
    retryAfter(key: string, now = Date.now()) {
      const b = buckets.get(key);
      if (!b) return 1;
      const tokens = Math.min(burst, b.tokens + (now - b.at) / everyMs);
      return Math.max(1, Math.ceil(((1 - tokens) * everyMs) / 1000));
    },
    size: () => buckets.size,
  };
}
