/**
 * Sliding Window Counter
 * 
 * Concept: Track requests in a sliding time window
 * - More accurate than fixed window
 * - Prevents boundary issue (sudden spike at window reset)
 * 
 * Best for: Accurate rate limiting without boundary spikes
 * 
 * @class SlidingWindow
 */
class SlidingWindow {
  /**
   * @param {Object} config - Configuration object
   * @param {number} config.windowSize - Window size in seconds
   * @param {number} config.maxRequests - Maximum requests in window
   */
  constructor(config) {
    this.windowSize = config.windowSize;
    this.maxRequests = config.maxRequests;
    this.requests = []; // Array of timestamps
  }

  /**
   * Remove requests outside current window
   * 
   * @private
   * @param {number} now - Current timestamp
   */
  _cleanOldRequests(now) {
    const windowStart = now - (this.windowSize * 1000);
    this.requests = this.requests.filter(timestamp => timestamp > windowStart);
  }

  /**
   * Check if request is allowed
   * 
   * @param {number} cost - Request cost multiplier
   * @returns {Object} Result object
   */
  checkLimit(cost = 1) {
    const now = Date.now();
    this._cleanOldRequests(now);

    const currentCount = this.requests.length;
    const wouldExceed = currentCount + cost > this.maxRequests;

    if (!wouldExceed) {
      // Add request timestamp(s) based on cost
      for (let i = 0; i < cost; i++) {
        this.requests.push(now);
      }

      return {
        allowed: true,
        remaining: this.maxRequests - (currentCount + cost),
        currentCount: currentCount + cost
      };
    }

    // Calculate when oldest request will expire
    const oldestRequest = this.requests[0];
    const retryAfter = Math.ceil((oldestRequest + (this.windowSize * 1000) - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      currentCount,
      retryAfter: Math.max(retryAfter, 1)
    };
  }

  /**
   * Get current state
   * @returns {Object} Current window state
   */
  getState() {
    const now = Date.now();
    this._cleanOldRequests(now);

    return {
      currentCount: this.requests.length,
      maxRequests: this.maxRequests,
      windowSize: this.windowSize,
      oldestRequest: this.requests[0] || null
    };
  }

  /**
   * Reset window
   */
  reset() {
    this.requests = [];
  }
}

module.exports = SlidingWindow;
