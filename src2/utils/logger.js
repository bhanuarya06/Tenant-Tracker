const winston = require('winston');
const config = require('../config/config');

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

winston.addColors(colors);

// Create log format
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.colorize({ all: true }),
    winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
);

// Define transports
const transports = [
    new winston.transports.Console(),
    new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error' 
    }),
    new winston.transports.File({ 
        filename: 'logs/combined.log' 
    }),
];

// Create the logger
const logger = winston.createLogger({
    level: config.NODE_ENV === 'development' ? 'debug' : 'warn',
    levels,
    format,
    transports,
});

module.exports = logger;