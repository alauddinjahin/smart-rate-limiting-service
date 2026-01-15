const logger = require('../utils/logger');

/**
 * Metrics Service
 * 
 * Purpose: Track rate limiting analytics
 * Task 3: Analytics & Monitoring
 * 
 * Metrics tracked:
 * - Hits per endpoint/tier/region
 * - Blocks per endpoint/tier/region
 * - Errors
 * - Performance metrics
 * 
 * @class MetricsService
 */
class MetricsService {
  constructor() {
    this.metrics = {
      hits: new Map(),
      blocks: new Map(),
      errors: new Map(),
      latency: [],
      
      // Performance counters
      totalRequests: 0,
      totalAllowed: 0,
      totalBlocked: 0,
      totalErrors: 0
    };
  }

  /**
   * Record rate limit check
   * 
   * @param {Object} data - Check data
   */
  recordRateLimitCheck(data) {
    const { userId, endpoint, tier, countryCode, allowed, cost } = data;
    const key = `${tier}:${endpoint}:${countryCode}`;

    this.metrics.totalRequests++;

    if (allowed) {
      this.metrics.totalAllowed++;
      const hits = this.metrics.hits.get(key) || 0;
      this.metrics.hits.set(key, hits + 1);
    } else {
      this.metrics.totalBlocked++;
      const blocks = this.metrics.blocks.get(key) || 0;
      this.metrics.blocks.set(key, blocks + 1);
      
      // Security logging for blocked requests
      logger.warn('Rate limit exceeded', {
        userId,
        endpoint,
        tier,
        countryCode,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Record error
   * 
   * @param {string} type - Error type
   * @param {Error} error - Error object
   */
  recordError(type, error) {
    this.metrics.totalErrors++;
    const count = this.metrics.errors.get(type) || 0;
    this.metrics.errors.set(type, count + 1);
    
    logger.error('Rate limiter error', {
      type,
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Record latency
   * 
   * @param {number} latencyMs - Latency in milliseconds
   */
  recordLatency(latencyMs) {
    this.metrics.latency.push(latencyMs);
    
    // Keep only last 1000 measurements
    if (this.metrics.latency.length > 1000) {
      this.metrics.latency.shift();
    }
  }

  /**
   * Get all metrics
   * 
   * @returns {Object} All metrics
   */
  getMetrics() {
    return {
      hits: Object.fromEntries(this.metrics.hits),
      blocks: Object.fromEntries(this.metrics.blocks),
      errors: Object.fromEntries(this.metrics.errors),
      
      summary: {
        totalRequests: this.metrics.totalRequests,
        totalAllowed: this.metrics.totalAllowed,
        totalBlocked: this.metrics.totalBlocked,
        totalErrors: this.metrics.totalErrors,
        blockRate: this._calculateBlockRate(),
        errorRate: this._calculateErrorRate()
      },
      
      performance: this._calculatePerformanceMetrics()
    };
  }

  /**
   * Calculate block rate
   * @private
   */
  _calculateBlockRate() {
    if (this.metrics.totalRequests === 0) return 0;
    return (this.metrics.totalBlocked / this.metrics.totalRequests * 100).toFixed(2);
  }

  /**
   * Calculate error rate
   * @private
   */
  _calculateErrorRate() {
    if (this.metrics.totalRequests === 0) return 0;
    return (this.metrics.totalErrors / this.metrics.totalRequests * 100).toFixed(2);
  }

  /**
   * Calculate performance metrics (p50, p95, p99)
   * @private
   */
  _calculatePerformanceMetrics() {
    if (this.metrics.latency.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0 };
    }

    const sorted = [...this.metrics.latency].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
      avg: (sorted.reduce((a, b) => a + b, 0) / len).toFixed(2)
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.hits.clear();
    this.metrics.blocks.clear();
    this.metrics.errors.clear();
    this.metrics.latency = [];
    this.metrics.totalRequests = 0;
    this.metrics.totalAllowed = 0;
    this.metrics.totalBlocked = 0;
    this.metrics.totalErrors = 0;
  }
}

module.exports = MetricsService;