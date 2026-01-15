const winston = require('winston');
const path = require('path');
const config = require('../config').logger;

// Create logger instance
const logger = winston.createLogger({
  levels: config.levels,
  level: config.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: config.format.timestamp }),
    winston.format.errors({ stack: true }),
    winston.format.metadata({ 
      fillExcept: ['message', 'level', 'timestamp', 'label'] 
    }),
    winston.format.json()
  ),
  defaultMeta: config.defaultMeta,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: config.format.colorize 
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        : winston.format.json()
    }),
    
    // Error log file
    new winston.transports.File({
      filename: config.files.error,
      level: 'error',
      maxsize: config.rotation.maxSize,
      maxFiles: config.rotation.maxFiles
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: config.files.combined,
      maxsize: config.rotation.maxSize,
      maxFiles: config.rotation.maxFiles
    })
  ]
});

// Add colors to Winston
winston.addColors(config.colors);

// Stream for Morgan HTTP logging
logger.stream = {
  write: (message) => logger.http(message.trim())
};

module.exports = logger;


