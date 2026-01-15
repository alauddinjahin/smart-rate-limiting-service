
const logger = require('../utils/logger');

/**
 * Mock authentication middleware
 * In production, replace with real JWT/OAuth validation
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      // Anonymous user
      req.user = {
        id: req.ip,
        tier: 'free',
        createdAt: new Date().toISOString(),
        authenticated: false
      };
      return next();
    }
    
    // Mock user lookup (replace with real auth)
    const mockUsers = {
      'free-token': {
        id: 'user_free_001',
        tier: 'free',
        createdAt: '2025-01-01T00:00:00Z',
        email: 'free@example.com'
      },
      'premium-token': {
        id: 'user_premium_001',
        tier: 'premium',
        createdAt: '2025-01-01T00:00:00Z',
        email: 'premium@example.com'
      },
      'enterprise-token': {
        id: 'user_enterprise_001',
        tier: 'enterprise',
        createdAt: '2025-01-01T00:00:00Z',
        email: 'enterprise@example.com'
      },
      'unlimited-token': {
        id: 'user_unlimited_001',
        tier: 'unlimited',
        createdAt: '2025-01-01T00:00:00Z',
        email: 'unlimited@example.com'
      },
      'new-user-token': {
        id: 'user_new_001',
        tier: 'free',
        createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day old
        email: 'new@example.com'
      }
    };
    
    const user = mockUsers[token];
    
    if (user) {
      req.user = { ...user, authenticated: true };
    } else {
      req.user = {
        id: req.ip,
        tier: 'free',
        createdAt: new Date().toISOString(),
        authenticated: false
      };
    }
    
    next();
    
  } catch (error) {
    logger.error('Authentication error', { error: error.message });
    next();
  }
}

/**
 * Admin authentication middleware
 */
function authenticateAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const config = require('../config');
  
  if (process.env.NODE_ENV === 'production' && token !== config.security.adminToken) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid admin token'
    });
  }
  
  next();
}

module.exports = {
  authenticate,
  authenticateAdmin
};