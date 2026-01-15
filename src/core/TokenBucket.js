/**
 * Token Bucket Algorithm
 * 
 * Concept: Bucket holds tokens that refill at a constant rate
 * - Each request consumes tokens
 * - Bucket has maximum capacity
 * - Refills at specified rate per second
 * 
 * Best for: Rate limiting with burst support
 * 
 * @class TokenBucket
 */
class TokenBucket {
  /**
   * @param {Object} config - Configuration object
   * @param {number} config.capacity - Maximum tokens (burst capacity)
   * @param {number} config.refillRate - Tokens added per second
   */
  constructor(config) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.tokens = config.capacity; // Start full
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on time elapsed
   * Formula: tokens += (timePassed * refillRate)
   * 
   * @private
   */
  _refill() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = timePassed * this.refillRate;
    
    // Cap at maximum capacity
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Try to consume tokens
   * 
   * @param {number} cost - Number of tokens to consume
   * @returns {Object} Result object
   */
  consume(cost = 1) {
    this._refill();

    if (this.tokens >= cost) {
      this.tokens -= cost;
      return {
        allowed: true,
        remaining: Math.floor(this.tokens),
        retryAfter: 0
      };
    }

    // Calculate retry time
    const tokensNeeded = cost - this.tokens;
    const retryAfter = Math.ceil(tokensNeeded / this.refillRate);

    return {
      allowed: false,
      remaining: 0,
      retryAfter
    };
  }

  /**
   * Get current state
   * @returns {Object} Current bucket state
   */
  getState() {
    this._refill();
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      refillRate: this.refillRate,
      lastRefill: this.lastRefill
    };
  }

  /**
   * Reset bucket to full capacity
   */
  reset() {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }
}

module.exports = TokenBucket;
