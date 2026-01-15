const redisConfig = require('./redis.config');
const rateLimitConfig = require('./rateLimit.config');
const geoConfig = require('./geo.config');
const loggerConfig = require('./logger.config');

module.exports = {
  redis: redisConfig,
  rateLimit: rateLimitConfig,
  geo: geoConfig,
  logger: loggerConfig,
  
  // Application config
  app: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
    trustProxy: true,
    enableCors: true,
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*']
  },
  
  // Security config
  security: {
    adminToken: process.env.ADMIN_TOKEN,
    metricsToken: process.env.METRICS_TOKEN,
    jwtSecret: process.env.JWT_SECRET,
    bcryptRounds: 10
  },
  
  // Feature flags
  features: {
    slowStart: process.env.SLOW_START_ENABLED !== 'false',
    ddosDetection: process.env.DDOS_DETECTION_ENABLED !== 'false',
    fallbackCache: process.env.FALLBACK_CACHE_ENABLED !== 'false',
    metrics: process.env.METRICS_ENABLED !== 'false'
  }
};

