const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * Middleware to validate request data using Joi schemas
 * @param {object} schema - Joi validation schema
 * @returns {function} Express middleware function
 */
const validate = (schema) => {
    return (req, res, next) => {
        try {
            // Combine query, params, and body for validation
            const dataToValidate = {
                ...req.query,
                ...req.params,
                ...req.body
            };

            // Validate the data against the schema
            const { error, value } = schema.validate(dataToValidate, {
                abortEarly: false, // Return all errors, not just the first one
                stripUnknown: true, // Remove unknown fields
                convert: true // Convert string numbers to actual numbers, etc.
            });

            if (error) {
                // Format error messages
                const errors = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                    value: detail.context.value
                }));

                logger.warn('Validation error:', { 
                    errors, 
                    url: req.originalUrl, 
                    method: req.method 
                });

                return errorResponse(res, 400, 'Validation failed', errors);
            }

            // Update request objects with validated and sanitized data
            Object.keys(value).forEach(key => {
                if (req.query.hasOwnProperty(key)) {
                    req.query[key] = value[key];
                } else if (req.params.hasOwnProperty(key)) {
                    req.params[key] = value[key];
                } else if (req.body.hasOwnProperty(key)) {
                    req.body[key] = value[key];
                }
            });

            next();
        } catch (err) {
            logger.error('Validation middleware error:', err);
            return errorResponse(res, 500, 'Validation error occurred');
        }
    };
};

/**
 * Validate specific parts of the request
 */
const validateBody = (schema) => {
    return (req, res, next) => {
        try {
            const { error, value } = schema.validate(req.body, {
                abortEarly: false,
                stripUnknown: true,
                convert: true
            });

            if (error) {
                const errors = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                    value: detail.context.value
                }));

                return errorResponse(res, 400, 'Request body validation failed', errors);
            }

            req.body = value;
            next();
        } catch (err) {
            logger.error('Body validation error:', err);
            return errorResponse(res, 500, 'Validation error occurred');
        }
    };
};

const validateQuery = (schema) => {
    return (req, res, next) => {
        try {
            const { error, value } = schema.validate(req.query, {
                abortEarly: false,
                stripUnknown: true,
                convert: true
            });

            if (error) {
                const errors = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                    value: detail.context.value
                }));

                return errorResponse(res, 400, 'Query parameters validation failed', errors);
            }

            req.query = value;
            next();
        } catch (err) {
            logger.error('Query validation error:', err);
            return errorResponse(res, 500, 'Validation error occurred');
        }
    };
};

const validateParams = (schema) => {
    return (req, res, next) => {
        try {
            const { error, value } = schema.validate(req.params, {
                abortEarly: false,
                stripUnknown: true,
                convert: true
            });

            if (error) {
                const errors = error.details.map(detail => ({
                    field: detail.path.join('.'),
                    message: detail.message,
                    value: detail.context.value
                }));

                return errorResponse(res, 400, 'URL parameters validation failed', errors);
            }

            req.params = value;
            next();
        } catch (err) {
            logger.error('Params validation error:', err);
            return errorResponse(res, 500, 'Validation error occurred');
        }
    };
};

module.exports = {
    validate,
    validateBody,
    validateQuery,
    validateParams
};