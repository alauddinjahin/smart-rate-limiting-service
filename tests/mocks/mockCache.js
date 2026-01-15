class MockCacheRepository {
  constructor() {
    this.store = new Map(); // Stores tokens & sliding window
  }

  async get(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  async set(key, value, ttlSeconds = 60) {
    this.store.set(key, value);

    if (ttlSeconds > 0) {
      setTimeout(() => this.store.delete(key), ttlSeconds * 1000).unref();
    }

    return true;
  }

  async del(key) {
    return this.store.delete(key);
  }

  async incr(key) {
    let val = Number(this.store.get(key) || 0) + 1;
    this.store.set(key, val);
    return val;
  }

  async exists(key) {
    return this.store.has(key) ? 1 : 0;
  }

  async flushAll() {
    this.store.clear();
  }

  clear() {
    this.store.clear();
  }

  /**
   * Simulate rate limit check for fallback
   * Similar to Redis sliding window + token bucket but simpler
   */
  async checkRateLimit(userId, endpoint, config, cost = 1) {
    const now = Date.now();
    const slidingKey = `sliding:${userId}:${endpoint}`;
    const tokenKey = `tokens:${userId}:${endpoint}`;
    const burstKey = `burst:${userId}:${endpoint}`;
    const windowStart = now - config.window * 1000;

    // Initialize
    if (!this.store.has(slidingKey)) this.store.set(slidingKey, []);
    if (!this.store.has(tokenKey)) this.store.set(tokenKey, config.max);
    if (!this.store.has(burstKey)) this.store.set(burstKey, 0);

    const sliding = this.store.get(slidingKey).filter(ts => ts > windowStart);
    this.store.set(slidingKey, sliding);

    let tokens = this.store.get(tokenKey);
    let burstUsed = this.store.get(burstKey);
    const burstAvailable = config.burst - burstUsed;

    let allowed = false;
    let remaining = 0;
    let retryAfter = 0;

    if (tokens >= cost) {
      tokens -= cost;
      allowed = true;
      remaining = tokens;
      sliding.push(now);
    } else if (burstAvailable >= cost) {
      burstUsed += cost;
      this.store.set(burstKey, burstUsed);
      allowed = true;
      remaining = 0;
      sliding.push(now);
    } else {
      allowed = false;
      remaining = 0;
      retryAfter = Math.ceil((cost - tokens) / config.refillRate);
    }

    this.store.set(tokenKey, tokens);
    this.store.set(slidingKey, sliding);

    return { allowed, remaining, retryAfter };
  }

  async reset(userId, endpoint) {
    ['sliding', 'tokens', 'burst'].forEach(prefix => this.store.delete(`${prefix}:${userId}:${endpoint}`));
  }
}

module.exports = { MockCacheRepository };
