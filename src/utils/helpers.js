/**
 * Sleep for specified duration
 * @param {number} ms - Milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate jitter for retry-after
 * @param {number} baseValue - Base retry time
 * @param {number} jitterPercent - Jitter percentage (0-1)
 * @returns {number} Value with jitter
 */
function addJitter(baseValue, jitterPercent = 0.3) {
  const jitter = Math.random() * jitterPercent;
  return Math.ceil(baseValue * (1 + jitter));
}

/**
 * Normalize endpoint path
 * @param {string} path - Request path
 * @returns {string} Normalized endpoint
 */
function normalizeEndpoint(path) {
  const { ENDPOINT_MAPPING } = require('../config/rateLimit.config');
  
  for (const { pattern, endpoint } of ENDPOINT_MAPPING.patterns) {
    if (pattern.test(path)) {
      return endpoint;
    }
  }
  
  return ENDPOINT_MAPPING.default;
}

/**
 * Get country code from request
 * @param {Object} req - Express request
 * @returns {string} Country code
 */
function getCountryCode(req) {
  // Check CloudFlare header
  if (req.headers['cf-ipcountry']) {
    return req.headers['cf-ipcountry'];
  }
  
  // Check custom header
  if (req.headers['x-country-code']) {
    return req.headers['x-country-code'];
  }
  
  // Fallback to DEFAULT
  return 'DEFAULT';
}

/**
 * Format error response
 * @param {Error} error - Error object
 * @param {boolean} includeStack - Include stack trace
 * @returns {Object} Formatted error
 */
function formatError(error, includeStack = false) {
  const response = {
    error: error.message || 'Internal Server Error',
    code: error.code || 'INTERNAL_ERROR'
  };
  
  if (includeStack && process.env.NODE_ENV !== 'production') {
    response.stack = error.stack;
  }
  
  return response;
}

module.exports = {
  sleep,
  addJitter,
  normalizeEndpoint,
  getCountryCode,
  formatError
};
