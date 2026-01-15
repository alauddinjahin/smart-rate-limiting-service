const path = require('path');

/**
 * Log levels (Winston default)
 * error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6
 */
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
  trace: 5
};

/**
 * Log level colors
 */
const LOG_COLORS = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
  trace: 'gray'
};

/**
 * Environment-specific log level
 */
const getLogLevel = () => {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') return 'info';
  if (env === 'test') return 'error';
  return 'debug';
};

/**
 * Logger configuration
 */
module.exports = {
  levels: LOG_LEVELS,
  colors: LOG_COLORS,
  level: process.env.LOG_LEVEL || getLogLevel(),
  
  // File paths
  files: {
    error: path.join(__dirname, '../../logs/error.log'),
    combined: path.join(__dirname, '../../logs/combined.log'),
    http: path.join(__dirname, '../../logs/http.log')
  },
  
  // File rotation
  rotation: {
    maxSize: '10m',      // 10 MB
    maxFiles: '14d',     // Keep for 14 days
    compress: true       // Gzip old logs
  },
  
  // Formatting
  format: {
    timestamp: 'YYYY-MM-DD HH:mm:ss',
    json: true,
    colorize: process.env.NODE_ENV !== 'production'
  },
  
  // Service metadata
  defaultMeta: {
    service: 'rate-limiter-service',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  }
};