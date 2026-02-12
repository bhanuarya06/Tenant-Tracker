/**
 * Custom error class for API errors
 */
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Async error handler wrapper
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Standard API response format
 */
const sendResponse = (res, statusCode, success, message, data = null, pagination = null) => {
    const response = {
        success,
        message
    };

    if (data !== null) {
        response.data = data;
    }

    if (pagination) {
        response.pagination = pagination;
    }

    res.status(statusCode).json(response);
};

/**
 * Success response helper
 */
const sendSuccess = (res, message, data = null, pagination = null, statusCode = 200) => {
    sendResponse(res, statusCode, true, message, data, pagination);
};

/**
 * Error response helper
 */
const sendError = (res, message, statusCode = 500, data = null) => {
    sendResponse(res, statusCode, false, message, data);
};

/**
 * Validation error formatter
 */
const formatValidationError = (error) => {
    const errors = Object.values(error.errors).map(val => ({
        field: val.path,
        message: val.message
    }));
    
    return {
        message: 'Validation Error',
        errors
    };
};

// Wrapper functions for controller compatibility
const successResponse = (res, statusCode, message, data = null, pagination = null) => {
    sendResponse(res, statusCode, true, message, data, pagination);
};

const errorResponse = (res, statusCode, message, data = null) => {
    sendResponse(res, statusCode, false, message, data);
};

module.exports = {
    AppError,
    asyncHandler,
    sendResponse,
    sendSuccess,
    sendError,
    formatValidationError,
    successResponse,
    errorResponse
};