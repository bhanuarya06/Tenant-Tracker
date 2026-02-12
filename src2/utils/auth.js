const jwt = require('jsonwebtoken');
const config = require('../config/config');

/**
 * Generate JWT token
 * @param {Object} payload - The payload to encode in the token
 * @returns {String} JWT token
 */
const generateToken = (payload) => {
    return jwt.sign(payload, config.JWT_SECRET, {
        expiresIn: config.JWT_EXPIRE,
    });
};

/**
 * Verify JWT token
 * @param {String} token - The token to verify
 * @returns {Object} Decoded payload
 */
const verifyToken = (token) => {
    return jwt.verify(token, config.JWT_SECRET);
};

/**
 * Generate tokens and set cookie
 * @param {Object} user - User object
 * @param {Object} res - Express response object
 * @returns {String} JWT token
 */
const sendTokenResponse = (user, statusCode, res) => {
    const token = generateToken({ 
        id: user._id, 
        role: user.role || 'user',
        email: user.email 
    });

    const options = {
        expires: new Date(
            Date.now() + config.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
        ),
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict'
    };

    res.status(statusCode)
        .cookie('token', token, options)
        .json({
            success: true,
            token,
            data: {
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role || 'user'
            }
        });

    return token;
};

module.exports = {
    generateToken,
    verifyToken,
    sendTokenResponse
};