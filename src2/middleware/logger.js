const morgan = require('morgan');
const logger = require('../utils/logger');
const config = require('../config/config');

/**
 * HTTP request logging middleware
 */
const httpLogger = () => {
    // Custom token for user ID
    morgan.token('user', (req) => {
        return req.user ? req.user.id : 'anonymous';
    });

    // Custom format
    const format = config.NODE_ENV === 'production' 
        ? 'combined'
        : ':method :url :status :res[content-length] - :response-time ms :user';

    return morgan(format, {
        stream: {
            write: (message) => {
                logger.http(message.trim());
            }
        },
        skip: (req, res) => {
            // Skip logging for health check endpoints in production
            return config.NODE_ENV === 'production' && req.url === '/health';
        }
    });
};

module.exports = { httpLogger };