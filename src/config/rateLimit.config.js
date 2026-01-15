
/**
 * Rate limit configuration for different tiers and endpoints
 * 
 * Structure:
 * - window: Time window in seconds
 * - max: Maximum requests allowed in window
 * - burst: Additional burst capacity above max
 * 
 * Best Practice: Define limits based on business requirements
 * Trade-off: Higher limits = better UX, Lower limits = better security
 */
const RATE_LIMITS = {
  free: {
    '/api/search': {
      window: 3600,      // 1 hour
      max: 100,          // 100 requests/hour
      burst: 20,         // Allow 20 extra for burst
      description: 'Free tier search limit'
    },
    '/api/checkout': {
      window: 3600,
      max: 10,           // Strict limit for fraud prevention
      burst: 2,
      description: 'Free tier checkout limit (fraud prevention)'
    },
    '/api/profile': {
      window: 3600,
      max: 50,
      burst: 10,
      description: 'Free tier profile access'
    }
  },
  
  premium: {
    '/api/search': {
      window: 3600,
      max: 1000,         // 10x of free tier
      burst: 100,
      description: 'Premium tier search limit'
    },
    '/api/checkout': {
      window: 3600,
      max: 100,          // 10x of free tier
      burst: 20,
      description: 'Premium tier checkout limit'
    },
    '/api/profile': {
      window: 3600,
      max: 200,
      burst: 40,
      description: 'Premium tier profile access'
    }
  },
  
  enterprise: {
    '/api/search': {
      window: 3600,
      max: 10000,        // 100x of free tier
      burst: 1000,
      description: 'Enterprise tier search limit'
    },
    '/api/checkout': {
      window: 3600,
      max: 1000,
      burst: 200,
      description: 'Enterprise tier checkout limit'
    },
    '/api/profile': {
      window: 3600,
      max: 1000,
      burst: 200,
      description: 'Enterprise tier profile access'
    }
  },
};

/**
 * Request cost multipliers
 * Some endpoints consume more resources and should count as multiple requests
 * 
 * Best Practice: Assign higher costs to resource-intensive operations
 * Example: Database writes > reads, Complex queries > simple lookups
 */
const REQUEST_COSTS = {
  '/api/search': 1,         // Standard cost
  '/api/checkout': 5,       // 5x cost (fraud checks, payment processing)
  '/api/profile': 2,        // 2x cost (includes database join queries)
};

/**
 * Slow start configuration
 * Gradually increase limits for new users to prevent abuse
 * 
 * Best Practice: Prevent account farming by limiting new accounts
 * Trade-off: Legitimate new users may feel restricted initially
 */
const SLOW_START_CONFIG = {
  enabled: process.env.SLOW_START_ENABLED !== 'false',
  duration: 7 * 24 * 3600,  // 7 days in seconds
  startMultiplier: 0.3,      // Start at 30% of normal limits
  
  // Formula: limit * (startMultiplier + (1 - startMultiplier) * progress)
  // Day 0: 30%, Day 3.5: 65%, Day 7: 100%
};

/**
 * Default endpoint mapping
 * Maps actual request paths to configured endpoints
 */
const ENDPOINT_MAPPING = {
  patterns: [
    { pattern: /^\/api\/search/, endpoint: '/api/search' },
    { pattern: /^\/api\/checkout/, endpoint: '/api/checkout' },
    { pattern: /^\/api\/profile/, endpoint: '/api/profile' }
  ],
  default: '/api/search' // Fallback for unmatched paths
};

module.exports = {
  RATE_LIMITS,
  REQUEST_COSTS,
  SLOW_START_CONFIG,
  ENDPOINT_MAPPING
};
