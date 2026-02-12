const { AppError, sendError, formatValidationError } = require('../utils/response');
const logger = require('../utils/logger');
const config = require('../config/config');

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log error
    logger.error(`${err.name}: ${err.message}`, {
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        user: req.user?.id || 'anonymous'
    });

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Invalid resource ID format';
        error = new AppError(message, 400);
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const message = `${field} already exists`;
        error = new AppError(message, 400);
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const validationErrors = formatValidationError(err);
        return sendError(res, validationErrors.message, 400, validationErrors.errors);
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        const message = 'Invalid token';
        error = new AppError(message, 401);
    }

    if (err.name === 'TokenExpiredError') {
        const message = 'Token expired';
        error = new AppError(message, 401);
    }

    // MongoDB connection errors
    if (err.name === 'MongoNetworkError' || err.name === 'MongoServerError') {
        const message = 'Database connection failed';
        error = new AppError(message, 500);
    }

    // File upload errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        const message = `File too large. Maximum size is ${config.MAX_FILE_SIZE / 1000000}MB`;
        error = new AppError(message, 400);
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        const message = 'Unexpected file field';
        error = new AppError(message, 400);
    }

    // Send error response
    sendError(
        res,
        error.message || 'Internal Server Error',
        error.statusCode || 500,
        config.NODE_ENV === 'development' ? {
            stack: err.stack,
            error: err
        } : null
    );
};

/**
 * 404 handler
 */
const notFoundHandler = (req, res, next) => {
    const error = new AppError(`Route ${req.originalUrl} not found`, 404);
    next(error);
};

/**
 * Async error wrapper
 */
const asyncErrorHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncErrorHandler
};