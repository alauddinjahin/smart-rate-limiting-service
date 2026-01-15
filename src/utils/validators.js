/**
 * Validate user ID
 * @param {string} userId - User identifier
 * @returns {boolean}
 */
function isValidUserId(userId) {
  if (!userId || typeof userId !== 'string') return false;
  return userId.length > 0 && userId.length <= 255;
}

/**
 * Validate endpoint
 * @param {string} endpoint - API endpoint
 * @returns {boolean}
 */
function isValidEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') return false;
  return endpoint.startsWith('/api/');
}

/**
 * Validate tier
 * @param {string} tier - User tier
 * @returns {boolean}
 */
function isValidTier(tier) {
  const validTiers = ['free', 'premium', 'enterprise'];
  return validTiers.includes(tier);
}

/**
 * Validate country code
 * @param {string} code - ISO country code
 * @returns {boolean}
 */
function isValidCountryCode(code) {
  if (!code || typeof code !== 'string') return false;
  return /^[A-Z]{2}$/.test(code.toUpperCase());
}

/**
 * Sanitize input to prevent injection attacks
 * @param {string} input - User input
 * @returns {string} Sanitized input
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[<>'"]/g, '');
}

module.exports = {
  isValidUserId,
  isValidEndpoint,
  isValidTier,
  isValidCountryCode,
  sanitizeInput
};