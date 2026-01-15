const logger = require('../utils/logger');
const { addJitter, normalizeEndpoint, getCountryCode } = require('../utils/helpers');
const { isValidUserId, isValidEndpoint, isValidTier } = require('../utils/validators');
const { HTTP_STATUS, ERROR_CODES } = require('../utils/constants');

/**
 * Create rate limiter middleware
 * 
 * Design Pattern: Factory pattern
 * 
 * @param {Object} rateLimiter - RateLimiter instance
 * @param {Object} options - Middleware options
 * @returns {Function} Express middleware
 */
function createRateLimiterMiddleware(rateLimiter, options = {}) {
  return async (req, res, next) => {
    const startTime = Date.now();
    
    try {
      // Extract user information
      const userId = req.user?.id || req.ip;
      const tier = req.user?.tier || options.defaultTier || 'free';
      const endpoint = normalizeEndpoint(req.path);
      const countryCode = getCountryCode(req);
      
      // Validate inputs
      if (!isValidUserId(userId)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Invalid user identifier',
          code: ERROR_CODES.INVALID_TIER
        });
      }
      
      if (!isValidTier(tier)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          error: 'Invalid user tier',
          code: ERROR_CODES.INVALID_TIER
        });
      }
      
      // Custom cost from header (Task 4: Request costing)
      const customCost = parseInt(req.headers['x-request-cost']) || undefined;
      
      // Check rate limit
      const result = await rateLimiter.checkLimit(
        userId,
        endpoint,
        tier,
        countryCode,
        {
          tier,
          countryCode,
          userCreatedAt: req.user?.createdAt,
          cost: customCost
        }
      );
      
      // Record latency
      const latency = Date.now() - startTime;
      rateLimiter.metricsService.recordLatency(latency);
      
      // Add rate limit headers (standard practice)
      res.setHeader('X-RateLimit-Limit', result.remaining + (result.allowed ? 1 : 0));
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', Date.now() + (result.retryAfter * 1000));
      
      if (result.fallback) {
        res.setHeader('X-RateLimit-Fallback', 'true');
      }
      
      if (!result.allowed) {
        // Task 4: Add jitter to prevent thundering herd
        const retryAfter = addJitter(result.retryAfter, 0.3);
        res.setHeader('Retry-After', retryAfter);
        
        return res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Please retry after ${retryAfter} seconds.`,
          code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
          retryAfter,
          limit: result.remaining + 1,
          tier,
          endpoint
        });
      }
      
      // Request allowed
      next();
      
    } catch (error) {
      logger.error('Rate limiter middleware error', {
        error: error.message,
        stack: error.stack,
        path: req.path
      });
      
      // Graceful degradation (fail open)
      next();
    }
  };
}

module.exports = { createRateLimiterMiddleware };
