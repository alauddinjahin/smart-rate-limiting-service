const logger = require('../utils/logger');
const { formatError } = require('../utils/helpers');
const { HTTP_STATUS } = require('../utils/constants');

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res) {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    path: req.path
  });
}

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  // Log error
  logger.error('Application error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });
  
  // Determine status code
  const statusCode = err.statusCode || err.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;
  
  // Format response
  const response = formatError(err, process.env.NODE_ENV !== 'production');
  
  res.status(statusCode).json(response);
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  notFoundHandler,
  errorHandler,
  asyncHandler
};