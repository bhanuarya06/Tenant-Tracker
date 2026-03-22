/**
 * OAuth 2.0 / OIDC Routes
 * 
 * Implements all standard OAuth2 and OIDC endpoints along with
 * first-party convenience endpoints for the SPA.
 * 
 * Rate limiting is applied per endpoint based on sensitivity:
 * - Auth endpoints (login, register, authorize): strict (10 req/15 min)
 * - Token endpoints (token, refresh): moderate (30 req/15 min)
 * - Read-only endpoints (discovery, jwks, userinfo): lenient
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const oauth2Controller = require('../controllers/oauth2Controller');
const { authenticate, authenticateOAuth2, requireScope } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { oauthLogin, oauthRegister, oauthToken, oauthAuthorizePost } = require('../validators');

const router = express.Router();

// ─────────────────────────────────────────
// Rate limiters (per endpoint sensitivity)
// ─────────────────────────────────────────

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                   // 10 attempts
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'too_many_requests',
        error_description: 'Too many authentication attempts. Please try again later.',
    },
});

const tokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'too_many_requests',
        error_description: 'Too many token requests. Please try again later.',
    },
});

// ─────────────────────────────────────────
// OIDC Discovery (Public, Cacheable)
// ─────────────────────────────────────────

/**
 * GET /.well-known/openid-configuration
 * OIDC Discovery Document — auto-discovery for any OIDC client.
 */
router.get('/.well-known/openid-configuration', (req, res) => oauth2Controller.discovery(req, res));

/**
 * GET /.well-known/jwks.json
 * Public keys for JWT verification.
 */
router.get('/.well-known/jwks.json', (req, res) => oauth2Controller.jwks(req, res));

// ─────────────────────────────────────────
// Authorization Code Flow (OAuth2 Standard)
// ─────────────────────────────────────────

/**
 * GET /oauth/authorize
 * Authorization endpoint — validates params for the SPA.
 */
router.get('/oauth/authorize', (req, res) => oauth2Controller.authorize(req, res));

/**
 * POST /oauth/authorize
 * Process credentials and issue authorization code.
 */
router.post('/oauth/authorize', authLimiter, validate(oauthAuthorizePost),
    (req, res) => oauth2Controller.authorizePost(req, res));

/**
 * POST /oauth/token
 * Token endpoint — exchange auth code or refresh token for tokens.
 */
router.post('/oauth/token', tokenLimiter, validate(oauthToken),
    (req, res) => oauth2Controller.token(req, res));

// ─────────────────────────────────────────
// Token Management (OAuth2 Standard)
// ─────────────────────────────────────────

/**
 * POST /oauth/revoke
 * Revoke a token (RFC 7009).
 */
router.post('/oauth/revoke', (req, res) => oauth2Controller.revoke(req, res));

/**
 * POST /oauth/introspect
 * Introspect a token (RFC 7662).
 */
router.post('/oauth/introspect', (req, res) => oauth2Controller.introspect(req, res));

// ─────────────────────────────────────────
// OIDC UserInfo
// ─────────────────────────────────────────

/**
 * GET /oauth/userinfo
 * Returns identity claims for the authenticated user.
 * Requires: access token with 'openid' scope.
 */
router.get('/oauth/userinfo', authenticateOAuth2, requireScope('openid'),
    (req, res) => oauth2Controller.userinfo(req, res));

// ─────────────────────────────────────────
// First-Party Convenience Endpoints
// (For TenantTracker Web SPA)
// ─────────────────────────────────────────

/**
 * POST /oauth/register
 * Direct registration with token issuance.
 */
router.post('/oauth/register', authLimiter, validate(oauthRegister),
    (req, res) => oauth2Controller.register(req, res));

/**
 * POST /oauth/login
 * Direct login with token issuance.
 */
router.post('/oauth/login', authLimiter, validate(oauthLogin),
    (req, res) => oauth2Controller.login(req, res));

/**
 * POST /oauth/logout
 * Logout (revoke current refresh token).
 */
router.post('/oauth/logout', authenticate,
    (req, res) => oauth2Controller.logout(req, res));

/**
 * POST /oauth/logout-all
 * Revoke all sessions/devices.
 */
router.post('/oauth/logout-all', authenticate,
    (req, res) => oauth2Controller.logoutAll(req, res));

/**
 * GET /oauth/sessions
 * List active sessions.
 */
router.get('/oauth/sessions', authenticate,
    (req, res) => oauth2Controller.sessions(req, res));

module.exports = router;
