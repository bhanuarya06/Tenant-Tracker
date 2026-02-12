const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { errorResponse } = require('../utils/response');
const logger = require('../utils/logger');
const config = require('../config/config');

const authenticate = async (req, res, next) => {
    let token; // ✅ Move token declaration outside try block
    
    try {
        if (req.cookies.token) {
            token = req.cookies.token;
        } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return errorResponse(res, 401, 'Authentication required. Please log in.');
        }

        // Debug: Log token and secret info before verification
        console.log('🔍 JWT Debug Info:', {
            tokenExists: !!token,
            tokenLength: token?.length,
            tokenStart: token?.substring(0, 20) + '...',
            jwtSecretExists: !!config.JWT_SECRET,
            jwtSecretLength: config.JWT_SECRET?.length,
            jwtSecretStart: config.JWT_SECRET?.substring(0, 20) + '...'
        });

        const decoded = jwt.verify(token, config.JWT_SECRET);
        
        const user = await User.findById(decoded.userId).select('+loginAttempts +lockUntil isActive role firstName lastName email');
        
        if (!user) {
            return errorResponse(res, 401, 'User no longer exists. Please log in again.');
        }

        if (!user.isActive) {
            return errorResponse(res, 401, 'Account has been deactivated. Contact administrator.');
        }

        if (user.isLocked) {
            return errorResponse(res, 423, 'Account is temporarily locked. Please try again later.');
        }

        req.user = {
            userId: user._id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role
        };

        next();
    } catch (error) {
        console.log('❌ JWT Verification Failed:', {
            errorName: error.name,
            errorMessage: error.message,
            tokenProvided: !!token,
            jwtSecretExists: !!config.JWT_SECRET
        });
        
        logger.error('Authentication error:', error);
        
        if (error.name === 'TokenExpiredError') {
            return errorResponse(res, 401, 'Token has expired. Please log in again.');
        } else if (error.name === 'JsonWebTokenError') {
            console.log('🔑 Invalid JWT Signature - This usually means:');
            console.log('   1. Token was signed with different JWT_SECRET');
            console.log('   2. Token is corrupted');
            console.log('   3. Frontend needs to login again');
            return errorResponse(res, 401, 'Invalid token signature. Please login again.');
        }
        
        return errorResponse(res, 500, 'Authentication failed');
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return errorResponse(res, 401, 'Authentication required');
        }

        if (!roles.includes(req.user.role)) {
            return errorResponse(res, 403, 'Access denied. Required roles: ' + roles.join(', '));
        }

        next();
    };
};

module.exports = {
    auth: authenticate,
    requireRole: authorize,
    authenticate,
    authorize
};
