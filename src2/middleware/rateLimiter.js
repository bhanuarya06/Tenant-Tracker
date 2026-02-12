const rateLimit = require('express-rate-limit');
const config = require('../config/config');

/**
 * General API rate limiting
 */
const apiLimiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW * 60 * 1000, // Convert minutes to milliseconds
    max: config.RATE_LIMIT_MAX,
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: config.RATE_LIMIT_WINDOW
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip successful requests
    skip: (req, res) => res.statusCode < 400,
});

/**
 * Strict rate limiting for authentication endpoints
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: {
        success: false,
        message: 'Too many authentication attempts, please try again after 15 minutes.',
        retryAfter: 15
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Password reset rate limiting
 */
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 password reset requests per hour
    message: {
        success: false,
        message: 'Too many password reset attempts, please try again after 1 hour.',
        retryAfter: 60
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * File upload rate limiting
 */
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 uploads per 15 minutes
    message: {
        success: false,
        message: 'Too many file uploads, please try again later.',
        retryAfter: 15
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    apiLimiter,
    authLimiter,
    passwordResetLimiter,
    uploadLimiter
};