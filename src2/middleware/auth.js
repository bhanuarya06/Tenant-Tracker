/**
 * Authentication Middleware
 * 
 * Supports both:
 * 1. NEW: RS256 JWT access tokens from OAuth2/OIDC system (verified with public key)
 * 2. LEGACY: HS256 JWT tokens from old auth system (verified with JWT_SECRET)
 * 
 * The middleware auto-detects the token type by checking the JWT header algorithm.
 * This ensures backward compatibility during migration.
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { errorResponse } = require('../utils/response');
const logger = require('../utils/logger');
const config = require('../config/config');

/**
 * Primary authentication middleware.
 * Extracts JWT from Authorization header or cookie, verifies it,
 * and populates req.user with user identity.
 */
const authenticate = async (req, res, next) => {
    let token;

    try {
        // Extract token from Authorization header (preferred) or cookie (fallback)
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.cookies.token) {
            token = req.cookies.token;
        }

        if (!token) {
            return errorResponse(res, 401, 'Authentication required. Please log in.');
        }

        let decoded;

        // Detect token type by peeking at the JWT header
        const header = JSON.parse(
            Buffer.from(token.split('.')[0], 'base64url').toString()
        );

        if (header.alg === 'RS256') {
            // NEW OAuth2/OIDC token — verify with RSA public key
            const keyManager = require('../services/keyManager');
            decoded = jwt.verify(token, keyManager.publicKey, {
                algorithms: ['RS256'],
                issuer: config.OIDC_ISSUER,
                audience: config.OIDC_AUDIENCE,
            });

            // Map OIDC claims to req.user format
            const user = await User.findById(decoded.sub)
                .select('+loginAttempts +lockUntil isActive role firstName lastName email');

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
                sub: user._id.toString(),
                userId: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: decoded['https://tenanttracker.app/claims/role'] || user.role,
                scope: decoded.scope || '',
            };
        } else {
            // LEGACY HS256 token — verify with symmetric secret (backward compat)
            decoded = jwt.verify(token, config.JWT_SECRET);

            const userId = decoded.userId || decoded.id || decoded.sub;
            const user = await User.findById(userId)
                .select('+loginAttempts +lockUntil isActive role firstName lastName email');

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
                sub: user._id.toString(),
                userId: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                scope: '',
            };
        }

        next();
    } catch (error) {
        logger.error('Authentication error:', {
            name: error.name,
            message: error.message,
        });

        if (error.name === 'TokenExpiredError') {
            return errorResponse(res, 401, 'Token has expired. Please log in again.');
        }
        if (error.name === 'JsonWebTokenError') {
            return errorResponse(res, 401, 'Invalid token. Please login again.');
        }

        return errorResponse(res, 500, 'Authentication failed');
    }
};

/**
 * Lightweight OAuth2 token authentication.
 * Used by OIDC endpoints (userinfo, introspect) that only accept RS256 tokens.
 * Does NOT load the full user from DB — just decodes the JWT.
 */
const authenticateOAuth2 = async (req, res, next) => {
    let token;

    try {
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                error: 'invalid_token',
                error_description: 'Access token required',
            });
        }

        const keyManager = require('../services/keyManager');
        const decoded = jwt.verify(token, keyManager.publicKey, {
            algorithms: ['RS256'],
            issuer: config.OIDC_ISSUER,
            audience: config.OIDC_AUDIENCE,
        });

        req.user = decoded;
        next();
    } catch (error) {
        logger.error('OAuth2 authentication error:', { name: error.name, message: error.message });

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'invalid_token',
                error_description: 'Access token has expired',
            });
        }

        return res.status(401).json({
            error: 'invalid_token',
            error_description: 'Invalid access token',
        });
    }
};

/**
 * Role-based authorization middleware.
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return errorResponse(res, 401, 'Authentication required');
        }

        const userRole = req.user.role ||
            req.user['https://tenanttracker.app/claims/role'];

        if (!roles.includes(userRole)) {
            return errorResponse(res, 403, 'Access denied. Required roles: ' + roles.join(', '));
        }

        next();
    };
};

/**
 * Scope-based authorization middleware.
 * Ensures the access token has the required scope(s).
 */
const requireScope = (...requiredScopes) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'invalid_token',
                error_description: 'Authentication required',
            });
        }

        const tokenScopes = (req.user.scope || '').split(' ').filter(Boolean);
        const missingScopes = requiredScopes.filter(s => !tokenScopes.includes(s));

        if (missingScopes.length > 0) {
            return res.status(403).json({
                error: 'insufficient_scope',
                error_description: `Required scopes: ${requiredScopes.join(' ')}`,
                scope: requiredScopes.join(' '),
            });
        }

        next();
    };
};

module.exports = {
    auth: authenticate,
    authenticate,
    authenticateOAuth2,
    authorize,
    requireRole: authorize,
    requireScope,
};
