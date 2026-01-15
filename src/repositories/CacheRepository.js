const TokenBucket = require('../core/TokenBucket');
const SlidingWindow = require('../core/SlidingWindow');

/**
 * In-memory Cache Repository
 * 
 * Purpose: Fallback when Redis is unavailable
 * Design: LRU cache to prevent memory overflow
 * 
 * Trade-off: Less accurate (per-instance) vs. availability
 * Decision: Availability wins (fail-open strategy)
 * 
 * @class CacheRepository
 */
class CacheRepository {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 10000;
    this.algorithm = options.algorithm || 'token_bucket'; // or 'sliding_window'
  }

  /**
   * Check rate limit using in-memory algorithm
   * 
   * @param {string} userId - User ID
   * @param {string} endpoint - Endpoint
   * @param {Object} config - Configuration
   * @param {number} cost - Request cost
   * @returns {Promise<Object>} Result
   */
  async checkRateLimit(userId, endpoint, config, cost = 1) {
    const key = `${userId}:${endpoint}`;
    
    // Get or create limiter for this user+endpoint
    if (!this.cache.has(key)) {
      this._createLimiter(key, config);
    }

    const limiter = this.cache.get(key);
    const result = this._checkWithLimiter(limiter, cost);

    // Cleanup if cache is too large (LRU eviction)
    if (this.cache.size > this.maxSize) {
      this._evictOldest();
    }

    return {
      ...result,
      source: 'cache'
    };
  }

  /**
   * Create limiter based on algorithm
   * 
   * @private
   * @param {string} key - Cache key
   * @param {Object} config - Configuration
   */
  _createLimiter(key, config) {
    let limiter;

    if (this.algorithm === 'token_bucket') {
      limiter = {
        type: 'token_bucket',
        instance: new TokenBucket({
          capacity: config.max + config.burst,
          refillRate: config.refillRate
        }),
        lastAccess: Date.now()
      };
    } else {
      limiter = {
        type: 'sliding_window',
        instance: new SlidingWindow({
          windowSize: config.window,
          maxRequests: config.max
        }),
        lastAccess: Date.now()
      };
    }

    this.cache.set(key, limiter);
  }

  /**
   * Check limit with specific limiter
   * 
   * @private
   * @param {Object} limiter - Limiter object
   * @param {number} cost - Request cost
   * @returns {Object} Result
   */
  _checkWithLimiter(limiter, cost) {
    limiter.lastAccess = Date.now();

    if (limiter.type === 'token_bucket') {
      return limiter.instance.consume(cost);
    } else {
      return limiter.instance.checkLimit(cost);
    }
  }

  /**
   * Evict oldest (LRU) entries
   * 
   * @private
   */
  _evictOldest() {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    
    // Remove oldest 10%
    const toRemove = Math.floor(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  /**
   * Reset rate limit
   * 
   * @param {string} userId - User ID
   * @param {string} endpoint - Endpoint
   */
  async reset(userId, endpoint) {
    const key = `${userId}:${endpoint}`;
    this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache size
   * @returns {number}
   */
  size() {
    return this.cache.size;
  }
}

module.exports = CacheRepository;