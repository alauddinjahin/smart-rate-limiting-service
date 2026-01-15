const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');

const config = require('./config');
const logger = require('./utils/logger');
const { createRateLimiterMiddleware } = require('./middleware/rateLimiter.middleware');
const { authenticate } = require('./middleware/auth.middleware');
const { notFoundHandler, errorHandler, asyncHandler } = require('./middleware/errorHandler.middleware');
const { HTTP_STATUS } = require('./utils/constants');

const apiRoutes = require('./routes');

function createApp(dependencies) {
  const { rateLimiter } = dependencies;
  
  const app = express();
  
  // ==========================================
  // Security Middleware
  // ==========================================
  
  // Helmet for security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:']
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));
  
  // CORS configuration
  app.use(cors({
    origin: config.app.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Cost', 'X-Country-Code']
  }));
  
  // ==========================================
  // Request Processing Middleware
  // ==========================================
  
  // Trust proxy (for accurate IP behind load balancer)
  if (config.app.trustProxy) {
    app.set('trust proxy', 1);
  }
  
  // Compression
  app.use(compression());
  
  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // HTTP logging
  app.use(morgan('combined', { stream: logger.stream }));
  

  app.use(authenticate);
  
  // ==========================================
  // Routes
  // ==========================================
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    const isHealthy = rateLimiter.redisRepository.isConnected();
    const statusCode = isHealthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
    
    res.status(statusCode).json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      redis: {
        connected: isHealthy,
        fallbackMode: rateLimiter.fallbackMode
      },
      circuitBreaker: rateLimiter.circuitBreaker.getState()
    });
  });
  
  // ==========================================
  // API Routes (with rate limiting)
  // ==========================================
  const rateLimiterMiddleware = createRateLimiterMiddleware(rateLimiter);
  app.use(`/api`, rateLimiterMiddleware, apiRoutes);

  // ==========================================
  // Test/Debug Routes (development only)
  // ==========================================
  
  if (config.app.env !== 'production') {
    // Burst test
    app.get('/test/burst', authenticate, asyncHandler(async (req, res) => {
      const promises = Array(50).fill(null).map(() =>
        rateLimiter.checkLimit(
          req.user.id,
          '/api/search',
          req.user.tier,
          'US',
          { tier: req.user.tier, countryCode: 'US' }
        )
      );
      
      const results = await Promise.all(promises);
      const allowed = results.filter(r => r.allowed).length;
      
      res.json({
        test: 'burst',
        totalRequests: 50,
        allowed,
        blocked: 50 - allowed,
        tier: req.user.tier
      });
    }));
    
    // Geographic test
    app.get('/test/geo', authenticate, asyncHandler(async (req, res) => {
      const countries = ['US', 'CN', 'IN', 'EU'];
      const results = {};
      
      for (const country of countries) {
        const result = await rateLimiter.checkLimit(
          `${req.user.id}-${country}`,
          '/api/search',
          req.user.tier,
          country,
          { tier: req.user.tier, countryCode: country }
        );
        results[country] = result;
      }
      
      res.json({
        test: 'geographic',
        results
      });
    }));
  }
  
  // ==========================================
  // Error Handling
  // ==========================================
  
  // 404 handler
  app.use('*', notFoundHandler);
  
  // Global error handler
  app.use(errorHandler);
  
  return app;
}

module.exports = createApp;
