const TokenBucket = require('./TokenBucket');
const SlidingWindow = require('./SlidingWindow');
const { CircuitBreaker } = require('./CircuitBreaker');
const { RATE_LIMITS, REQUEST_COSTS, SLOW_START_CONFIG } = require('../config/rateLimit.config');
const { getGeoMultiplier } = require('../config/geo.config');

/**
 * Main Rate Limiter
 * 
 * Orchestrates:
 * - Token bucket for burst support
 * - Sliding window for accuracy
 * - Geographic multipliers
 * - Tier-based limits
 * - Slow start for new users
 * 
 * Design Pattern: Facade pattern
 * SOLID: Single Responsibility - orchestration only
 * 
 * @class RateLimiter
 */
class RateLimiter {
  /**
   * @param {Object} redisRepository - Redis data access
   * @param {Object} cacheRepository - Fallback cache
   * @param {Object} metricsService - Analytics service
   * @param {Object} options - Additional options
   */
  constructor(redisRepository, cacheRepository, metricsService, options = {}) {
    // Dependency Injection (SOLID - Dependency Inversion)
    this.redisRepository = redisRepository;
    this.cacheRepository = cacheRepository;
    this.metricsService = metricsService;
    
    // Circuit breaker for Redis failures
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: options.circuitBreakerThreshold || 5,
      resetTimeout: options.circuitBreakerTimeout || 60000
    });
    
    this.fallbackMode = false;
    this.slowStartConfig = options.slowStart || SLOW_START_CONFIG;

  }

  /**
   * Check rate limit
   * 
   * @param {string} userId - User identifier
   * @param {string} endpoint - API endpoint
   * @param {string} tier - User tier (free, premium, enterprise, unlimited)
   * @param {string} countryCode - Country code (US, CN, etc.)
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Rate limit result
   */
  async checkLimit(userId, endpoint, tier, countryCode, options = {}) {
    try {
      // Fast path for unlimited tier (Task 4: Optimization)
      if (tier === 'unlimited') {
        return {
          allowed: true,
          remaining: Infinity,
          retryAfter: 0,
          tier,
          endpoint,
          source: 'unlimited'
        };
      }

      // Get effective configuration
      const config = this._getEffectiveConfig(
        tier, 
        endpoint, 
        countryCode, 
        options.userCreatedAt
      );

      if (!config) {
        throw new Error(`No configuration found for tier: ${tier}, endpoint: ${endpoint}`);
      }

      // Apply request cost multiplier (Task 4: Request costing)
      const cost = options.cost || REQUEST_COSTS[endpoint] || 1;

      // Try Redis first, fallback to cache if needed
      let result;
      
      if (this.fallbackMode || this.circuitBreaker.isOpen()) {
        result = await this._checkLimitFallback(userId, endpoint, config, cost);
      } else {
        result = await this._checkLimitRedis(userId, endpoint, config, cost);
      }

      // Record metrics (Task 3: Analytics)
      this.metricsService.recordRateLimitCheck({
        userId,
        endpoint,
        tier,
        countryCode,
        allowed: result.allowed,
        cost
      });

      return {
        ...result,
        tier,
        endpoint,
        timestamp: Date.now()
      };

    } catch (error) {
      // Graceful degradation (Task 2: Error handling)
      this.metricsService.recordError('rate_limit_check_failed', error);
      
      // Fail open - allow request but log
      return {
        allowed: true,
        remaining: 0,
        retryAfter: 0,
        error: 'Rate limiter unavailable',
        fallback: true,
        tier,
        endpoint
      };
    }
  }

  /**
   * Get effective configuration with all multipliers applied
   * 
   * @private
   * @param {string} tier - User tier
   * @param {string} endpoint - API endpoint
   * @param {string} countryCode - Country code
   * @param {string} userCreatedAt - User creation timestamp
   * @returns {Object} Effective configuration
   */
  _getEffectiveConfig(tier, endpoint, countryCode, userCreatedAt) {
    const baseConfig = RATE_LIMITS[tier]?.[endpoint];
    if (!baseConfig) return null;

    // Apply geographic multiplier (Task 1: Geographic multipliers)
    const geoMultiplier = getGeoMultiplier(countryCode);
    
    // Apply slow start multiplier (Task 3: Slow start)
    const slowStartMultiplier = this._getSlowStartMultiplier(userCreatedAt);
    
    // Calculate effective limits
    const effectiveMax = Math.floor(baseConfig.max * geoMultiplier * slowStartMultiplier);
    const effectiveBurst = Math.floor(baseConfig.burst * geoMultiplier * slowStartMultiplier);

    return {
      window: baseConfig.window,
      max: effectiveMax,
      burst: effectiveBurst,
      refillRate: effectiveMax / baseConfig.window // tokens per second
    };
  }

  /**
   * Calculate slow start multiplier for new users
   * 
   * @private
   * @param {string} userCreatedAt - ISO timestamp
   * @returns {number} Multiplier between startMultiplier and 1.0
   */
  _getSlowStartMultiplier(userCreatedAt) {
    if (!this.slowStartConfig.enabled || !userCreatedAt) {
      return 1.0;
    }

    const accountAge = (Date.now() - new Date(userCreatedAt).getTime()) / 1000;
    
    if (accountAge >= this.slowStartConfig.duration) {
      return 1.0;
    }

    // Linear ramp: startMultiplier + (1 - startMultiplier) * progress
    const progress = accountAge / this.slowStartConfig.duration;
    return this.slowStartConfig.startMultiplier + 
           (1.0 - this.slowStartConfig.startMultiplier) * progress;
  }

  /**
   * Check limit using Redis (primary method)
   * 
   * @private
   * @param {string} userId - User ID
   * @param {string} endpoint - Endpoint
   * @param {Object} config - Rate limit config
   * @param {number} cost - Request cost
   * @returns {Promise<Object>} Result
   */
  async _checkLimitRedis(userId, endpoint, config, cost) {
    try {
      return await this.circuitBreaker.execute(async () => {
        const result = await this.redisRepository.checkRateLimit(
          userId,
          endpoint,
          config,
          cost
        );
        
        this.fallbackMode = false;
        return result;
      });
    } catch (error) {
      // Circuit breaker opened or Redis failed
      this.fallbackMode = true;
      return await this._checkLimitFallback(userId, endpoint, config, cost);
    }
  }

  /**
   * Check limit using fallback cache (Task 2: Fallback)
   * 
   * @private
   */
  async _checkLimitFallback(userId, endpoint, config, cost) {
    const result = await this.cacheRepository.checkRateLimit(
      userId,
      endpoint,
      config,
      cost
    );
    
    return {
      ...result,
      fallback: true
    };
  }

  /**
   * Get current metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    return this.metricsService.getMetrics();
  }

  /**
   * Reset rate limit for a user (admin function)
   * @param {string} userId - User ID
   * @param {string} endpoint - Endpoint
   */
  async reset(userId, endpoint) {
    await this.redisRepository.reset(userId, endpoint);
    await this.cacheRepository.reset(userId, endpoint);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    await this.redisRepository.disconnect();
    this.cacheRepository.clear();
  }


  updateConfig(tier, endpoint, newConfig) {
    if (RATE_LIMITS[tier] && RATE_LIMITS[tier][endpoint]) {
      RATE_LIMITS[tier][endpoint] = {
        ...RATE_LIMITS[tier][endpoint],
        ...newConfig
      };
      console.log('Configuration updated:', { tier, endpoint, newConfig });
      return true;
    }
    return false;
  }

}

module.exports = RateLimiter;