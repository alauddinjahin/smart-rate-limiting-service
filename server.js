
require('dotenv').config();

const http = require('http');
const Redis = require('ioredis');

const createApp = require('./src/app');
const config = require('./src/config');
const logger = require('./src/utils/logger');

// Core classes
const RateLimiter = require('./src/core/rateLimiter');
const RedisRepository = require('./src/repositories/RedisRepository');
const CacheRepository = require('./src/repositories/CacheRepository');
const MetricsService = require('./src/services/MetricsService');


async function initializeDependencies() {
  // Initialize Redis
  const redisClient = new Redis({
    ...config.redis,
    lazyConnect: true
  });
  
  try {
    await redisClient.connect();
    logger.info('Redis connected successfully');
  } catch (error) {
    logger.warn('Redis connection failed, using fallback mode', {
      error: error.message
    });
  }
  
  // Initialize repositories
  const redisRepository = new RedisRepository(redisClient);
  const cacheRepository = new CacheRepository({
    maxSize: 10000,
    algorithm: 'token_bucket'
  });
  
  // Initialize services
  const metricsService = new MetricsService();
  
  // Initialize rate limiter
  const rateLimiter = new RateLimiter(
    redisRepository,
    cacheRepository,
    metricsService,
    {
      slowStart: config.rateLimit.SLOW_START_CONFIG,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000
    }
  );
  
  return {
    rateLimiter,
    metricsService,
    redisClient
  };
}

/**
 * Start HTTP server
 */
async function startServer() {
  try {
    // Initialize dependencies
    const dependencies = await initializeDependencies();
    
    // Create Express app
    const app = createApp(dependencies);
    
    // Create HTTP server
    const server = http.createServer(app);
    
    // Start listening
    const PORT = config.app.port;
    server.listen(PORT, () => {

      logger.info('Server started successfully', {
        port: PORT,
        environment: config.app.env,
        nodeVersion: process.version,
        pid: process.pid
      });
      
      console.log('\n' + '='.repeat(70));
      console.log('Smart Rate Limiting Service');
      console.log('='.repeat(70));
      console.log(`Server:        http://localhost:${PORT}`);
      console.log(`Health:        http://localhost:${PORT}/health`);
      console.log(`Environment:   ${config.app.env}`);
      console.log(`Node Version:  ${process.version}`);
      console.log('='.repeat(70));
      console.log('\nTest Tokens:');
      console.log('  Free:        Authorization: Bearer free-token');
      console.log('  Premium:     Authorization: Bearer premium-token');
      console.log('  Enterprise:  Authorization: Bearer enterprise-token');
      console.log('\nEndpoints:');
      console.log('  GET  /api/search    - Search products (high limits)');
      console.log('  POST /api/checkout  - Checkout (strict limits, 5x cost)');
      console.log('  GET  /api/profile   - User profile (medium limits)');
      console.log('  GET  /health        - Health check');
      
      if (config.app.env !== 'production') {
        console.log('  GET  /test/burst    - Burst test');
        console.log('  GET  /test/geo      - Geographic test');
      }
      
      console.log('='.repeat(70) + '\n');
    });
    
    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`${signal} received, starting graceful shutdown`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        // Shutdown rate limiter
        await dependencies.rateLimiter.shutdown();
        logger.info('Rate limiter shutdown complete');
        
        // Disconnect Redis
        await dependencies.redisClient.quit();
        logger.info('Redis disconnected');
        
        process.exit(0);
      });
      
      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };
    
    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught errors
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', {
        error: err.message,
        stack: err.stack
      });
      shutdown('uncaughtException');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', {
        reason,
        promise
      });
    });
    
  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = { startServer, initializeDependencies, createApp };