/**
 * OAuth 2.0 / OIDC Controller
 * 
 * Implements the full OAuth 2.0 Authorization Server with OIDC support.
 * 
 * Endpoints:
 * 
 * PUBLIC (OIDC Discovery):
 *   GET  /.well-known/openid-configuration  — OIDC Discovery Document
 *   GET  /.well-known/jwks.json             — JSON Web Key Set
 * 
 * AUTHORIZATION:
 *   GET  /oauth/authorize                   — Authorization endpoint (starts auth code flow)
 *   POST /oauth/authorize                   — Process login & generate auth code
 * 
 * TOKEN:
 *   POST /oauth/token                       — Token endpoint (exchange code, refresh tokens)
 *   POST /oauth/revoke                      — Revoke a token (RFC 7009)
 *   POST /oauth/introspect                  — Introspect a token (RFC 7662)
 * 
 * OIDC:
 *   GET  /oauth/userinfo                    — UserInfo endpoint (OIDC Core 5.3)
 * 
 * FIRST-PARTY (convenience for own SPA):
 *   POST /oauth/register                    — Direct registration + token issuance
 *   POST /oauth/login                       — Direct login + token issuance
 *   POST /oauth/logout                      — Revoke tokens + clear cookies
 *   GET  /oauth/sessions                    — List active sessions
 *   DELETE /oauth/sessions                  — Revoke all sessions
 */
const crypto = require('crypto');
const User = require('../models/User');
const AuthorizationCode = require('../models/AuthorizationCode');
const tokenService = require('../services/tokenService');
const oidcService = require('../services/oidcService');
const keyManager = require('../services/keyManager');
const config = require('../config/config');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/response');

class OAuth2Controller {

    // ══════════════════════════════════════════════
    // OIDC DISCOVERY
    // ══════════════════════════════════════════════

    /**
     * GET /.well-known/openid-configuration
     * Returns the OIDC Discovery Document.
     */
    discovery(req, res) {
        const doc = oidcService.getDiscoveryDocument();
        res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24h
        res.json(doc);
    }

    /**
     * GET /.well-known/jwks.json
     * Returns the JSON Web Key Set for token verification.
     */
    jwks(req, res) {
        const jwks = keyManager.getJwks();
        res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1h
        res.json(jwks);
    }

    // ══════════════════════════════════════════════
    // AUTHORIZATION CODE FLOW (with PKCE)
    // ══════════════════════════════════════════════

    /**
     * GET /oauth/authorize
     * 
     * Authorization endpoint — the SPA redirects the user here.
     * In a full server-rendered setup, this would render a login page.
     * For a SPA, this validates parameters and returns them for the SPA to handle.
     * 
     * Required params:
     *   response_type=code
     *   client_id
     *   redirect_uri
     *   code_challenge (PKCE)
     *   code_challenge_method=S256
     *   scope (space-separated)
     *   state (CSRF protection)
     * Optional:
     *   nonce (for OIDC ID token replay protection)
     */
    authorize(req, res) {
        const {
            response_type,
            client_id,
            redirect_uri,
            code_challenge,
            code_challenge_method,
            scope,
            state,
            nonce,
        } = req.query;

        // Validate required parameters
        const errors = [];

        if (response_type !== 'code') {
            errors.push('response_type must be "code"');
        }
        if (!client_id || client_id !== config.OIDC_CLIENT_ID) {
            errors.push('Invalid client_id');
        }
        if (!redirect_uri || !config.ALLOWED_REDIRECT_URIS.includes(redirect_uri)) {
            errors.push('Invalid or unregistered redirect_uri');
        }
        if (!code_challenge) {
            errors.push('code_challenge is required (PKCE)');
        }
        if (code_challenge_method !== 'S256') {
            errors.push('code_challenge_method must be "S256"');
        }
        if (!state) {
            errors.push('state is required for CSRF protection');
        }

        if (errors.length > 0) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: errors.join('; '),
            });
        }

        // Parse scopes
        const requestedScopes = (scope || 'openid').split(' ').filter(Boolean);
        const validScopes = ['openid', 'profile', 'email', 'offline_access'];
        const invalidScopes = requestedScopes.filter(s => !validScopes.includes(s));
        if (invalidScopes.length > 0) {
            return res.status(400).json({
                error: 'invalid_scope',
                error_description: `Invalid scopes: ${invalidScopes.join(', ')}`,
            });
        }

        // Return authorization parameters for the SPA login form
        // The SPA will POST credentials + these params to /oauth/authorize
        return res.json({
            authorization_request: {
                response_type,
                client_id,
                redirect_uri,
                code_challenge,
                code_challenge_method,
                scope: requestedScopes.join(' '),
                state,
                nonce: nonce || null,
            },
        });
    }

    /**
     * POST /oauth/authorize
     * 
     * Processes the login and generates an authorization code.
     * The SPA submits user credentials along with the authorization parameters.
     * On success, returns the authorization code and state.
     */
    async authorizePost(req, res) {
        const {
            email,
            password,
            client_id,
            redirect_uri,
            code_challenge,
            code_challenge_method,
            scope,
            state,
            nonce,
        } = req.body;

        // Validate client
        if (!client_id || client_id !== config.OIDC_CLIENT_ID) {
            return res.status(400).json({
                error: 'invalid_client',
                error_description: 'Invalid client_id',
            });
        }

        if (!redirect_uri || !config.ALLOWED_REDIRECT_URIS.includes(redirect_uri)) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Invalid redirect_uri',
            });
        }

        if (!code_challenge || code_challenge_method !== 'S256') {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'PKCE is required (code_challenge with S256)',
            });
        }

        // Authenticate the user
        const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');
        if (!user) {
            return res.status(401).json({
                error: 'access_denied',
                error_description: 'Invalid credentials',
                state,
            });
        }

        if (user.isLocked) {
            return res.status(423).json({
                error: 'access_denied',
                error_description: 'Account is temporarily locked',
                state,
            });
        }

        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            await user.incLoginAttempts();
            return res.status(401).json({
                error: 'access_denied',
                error_description: 'Invalid credentials',
                state,
            });
        }

        if (!user.isActive) {
            return res.status(403).json({
                error: 'access_denied',
                error_description: 'Account is not active',
                state,
            });
        }

        // Reset login attempts on success
        if (user.loginAttempts > 0) {
            user.loginAttempts = 0;
            user.lockUntil = undefined;
        }
        user.lastLoginAt = new Date();
        await user.save();

        // Parse scopes
        const requestedScopes = (scope || 'openid').split(' ').filter(Boolean);

        // Generate authorization code
        const code = crypto.randomBytes(32).toString('base64url');
        await AuthorizationCode.create({
            code,
            user: user._id,
            clientId: client_id,
            redirectUri: redirect_uri,
            scopes: requestedScopes,
            codeChallenge: code_challenge,
            codeChallengeMethod: code_challenge_method || 'S256',
            nonce: nonce || null,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        });

        logger.info(`Authorization code issued for user ${user._id}`, {
            clientId: client_id,
            scopes: requestedScopes,
        });

        // Return the code + state to the SPA
        return res.json({
            code,
            state,
        });
    }

    // ══════════════════════════════════════════════
    // TOKEN ENDPOINT
    // ══════════════════════════════════════════════

    /**
     * POST /oauth/token
     * 
     * Token endpoint — handles multiple grant types:
     *   - authorization_code: Exchange auth code for tokens (with PKCE verification)
     *   - refresh_token: Exchange refresh token for new token set
     */
    async token(req, res) {
        const { grant_type } = req.body;

        switch (grant_type) {
            case 'authorization_code':
                return this._handleAuthorizationCodeGrant(req, res);
            case 'refresh_token':
                return this._handleRefreshTokenGrant(req, res);
            default:
                return res.status(400).json({
                    error: 'unsupported_grant_type',
                    error_description: `Grant type "${grant_type}" is not supported. Use "authorization_code" or "refresh_token".`,
                });
        }
    }

    /**
     * Handle authorization_code grant type.
     * Verifies PKCE and exchanges code for tokens.
     */
    async _handleAuthorizationCodeGrant(req, res) {
        const { code, redirect_uri, client_id, code_verifier } = req.body;

        if (!code || !redirect_uri || !client_id || !code_verifier) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Missing required parameters: code, redirect_uri, client_id, code_verifier',
            });
        }

        // Find the authorization code
        const authCode = await AuthorizationCode.findValidCode(code);
        if (!authCode) {
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'Invalid, expired, or already used authorization code',
            });
        }

        // Validate client_id and redirect_uri match
        if (authCode.clientId !== client_id) {
            await authCode.markUsed(); // Prevent reuse
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'client_id does not match',
            });
        }

        if (authCode.redirectUri !== redirect_uri) {
            await authCode.markUsed();
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'redirect_uri does not match',
            });
        }

        // PKCE Verification: SHA-256(code_verifier) must equal stored code_challenge
        const computedChallenge = crypto
            .createHash('sha256')
            .update(code_verifier)
            .digest('base64url');

        if (computedChallenge !== authCode.codeChallenge) {
            await authCode.markUsed();
            logger.warn('PKCE verification failed', { clientId: client_id });
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'PKCE verification failed (code_verifier does not match code_challenge)',
            });
        }

        // Mark code as used (single-use)
        await authCode.markUsed();

        // Load user
        const user = await User.findById(authCode.user);
        if (!user || !user.isActive) {
            return res.status(400).json({
                error: 'invalid_grant',
                error_description: 'User not found or inactive',
            });
        }

        // Generate tokens
        const scopes = authCode.scopes;
        const meta = {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
        };

        const accessToken = tokenService.generateAccessToken(user, scopes);

        let idToken = null;
        if (scopes.includes('openid')) {
            idToken = tokenService.generateIdToken(user, scopes, authCode.nonce, accessToken);
        }

        let refreshToken = null;
        if (scopes.includes('offline_access')) {
            refreshToken = await tokenService.generateRefreshToken(user, scopes, meta);
            // Set refresh token as HttpOnly secure cookie
            this._setRefreshTokenCookie(res, refreshToken);
        }

        logger.info(`Tokens issued via authorization_code grant for user ${user._id}`, {
            scopes,
            hasRefreshToken: !!refreshToken,
        });

        // Standard OAuth 2.0 token response
        const response = {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: config.ACCESS_TOKEN_TTL,
            scope: scopes.join(' '),
        };

        if (idToken) {
            response.id_token = idToken;
        }

        // Refresh token is in HttpOnly cookie, but also included in body
        // for non-browser clients. SPA should rely on the cookie.
        if (refreshToken) {
            response.refresh_token = refreshToken;
        }

        return res.json(response);
    }

    /**
     * Handle refresh_token grant type.
     * Implements refresh token rotation.
     */
    async _handleRefreshTokenGrant(req, res) {
        // Accept refresh token from body or cookie
        const rawRefreshToken = req.body.refresh_token || req.cookies?.refresh_token;

        if (!rawRefreshToken) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Missing refresh_token',
            });
        }

        const meta = {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
        };

        const result = await tokenService.rotateRefreshToken(rawRefreshToken, meta);

        if (!result) {
            // Clear the cookie since the token is invalid
            this._clearRefreshTokenCookie(res);
            return res.status(401).json({
                error: 'invalid_grant',
                error_description: 'Refresh token is invalid, expired, or revoked',
            });
        }

        // Set new refresh token cookie
        this._setRefreshTokenCookie(res, result.refreshToken);

        logger.info(`Tokens rotated for user ${result.user._id}`);

        const response = {
            access_token: result.accessToken,
            token_type: 'Bearer',
            expires_in: config.ACCESS_TOKEN_TTL,
            scope: result.scopes.join(' '),
        };

        if (result.idToken) {
            response.id_token = result.idToken;
        }

        response.refresh_token = result.refreshToken;

        return res.json(response);
    }

    // ══════════════════════════════════════════════
    // TOKEN REVOCATION (RFC 7009)
    // ══════════════════════════════════════════════

    /**
     * POST /oauth/revoke
     * Revoke a refresh token.
     */
    async revoke(req, res) {
        const token = req.body.token || req.cookies?.refresh_token;
        const tokenTypeHint = req.body.token_type_hint || 'refresh_token';

        if (!token) {
            // Per RFC 7009, return 200 even if no token (idempotent)
            return res.status(200).json({ success: true });
        }

        if (tokenTypeHint === 'refresh_token') {
            await tokenService.revokeRefreshToken(token);
        }

        this._clearRefreshTokenCookie(res);

        // RFC 7009: always return 200
        return res.status(200).json({ success: true });
    }

    // ══════════════════════════════════════════════
    // TOKEN INTROSPECTION (RFC 7662)
    // ══════════════════════════════════════════════

    /**
     * POST /oauth/introspect
     * Returns information about a token.
     */
    async introspect(req, res) {
        const { token, token_type_hint } = req.body;

        if (!token) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'token parameter is required',
            });
        }

        const result = await tokenService.introspect(token, token_type_hint);
        return res.json(result);
    }

    // ══════════════════════════════════════════════
    // OIDC USERINFO
    // ══════════════════════════════════════════════

    /**
     * GET /oauth/userinfo
     * Returns claims about the authenticated user.
     * Requires valid access token with 'openid' scope.
     */
    async userinfo(req, res) {
        // req.user is populated by auth middleware
        const user = await User.findById(req.user.sub);
        if (!user) {
            return res.status(404).json({
                error: 'invalid_request',
                error_description: 'User not found',
            });
        }

        const scopes = (req.user.scope || '').split(' ');
        const claims = oidcService.getUserInfoClaims(user, scopes);

        return res.json(claims);
    }

    // ══════════════════════════════════════════════
    // FIRST-PARTY CONVENIENCE ENDPOINTS
    // (For your own SPA — wraps OAuth2 flows)
    // ══════════════════════════════════════════════

    /**
     * POST /oauth/register
     * Direct registration with token issuance.
     * Convenience endpoint for first-party SPA.
     */
    async register(req, res) {
        try {
            const { email } = req.body;

            // Check if user exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return errorResponse(res, 400, 'User with this email already exists');
            }

            // Map frontend field names
            const userData = {
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                email: req.body.email,
                password: req.body.password,
                role: req.body.role || 'owner',
                phone: req.body.phone || req.body.mobile,
                dateOfBirth: req.body.dateOfBirth || req.body.dob
                    ? new Date(req.body.dateOfBirth || req.body.dob) : undefined,
                gender: req.body.gender,
                address: req.body.address,
                bio: req.body.bio,
            };

            // Remove undefined fields
            Object.keys(userData).forEach(key => {
                if (userData[key] === undefined) delete userData[key];
            });

            const user = await User.create(userData);
            user.lastLoginAt = new Date();
            await user.save();

            // Default scopes for first-party
            const scopes = ['openid', 'profile', 'email', 'offline_access'];
            const meta = { ip: req.ip, userAgent: req.get('User-Agent') };

            // Generate all tokens
            const accessToken = tokenService.generateAccessToken(user, scopes);
            const idToken = tokenService.generateIdToken(user, scopes, null, accessToken);
            const refreshToken = await tokenService.generateRefreshToken(user, scopes, meta);

            // Set refresh token cookie
            this._setRefreshTokenCookie(res, refreshToken);

            logger.info(`User registered via OAuth2: ${user.email}`, { userId: user._id });

            return successResponse(res, 201, 'User registered successfully', {
                user: this._formatUserResponse(user),
                access_token: accessToken,
                id_token: idToken,
                refresh_token: refreshToken,
                token_type: 'Bearer',
                expires_in: config.ACCESS_TOKEN_TTL,
                scope: scopes.join(' '),
            });
        } catch (error) {
            logger.error('OAuth2 registration error:', error);
            return errorResponse(res, 500, 'Registration failed', error.message);
        }
    }

    /**
     * POST /oauth/login
     * Direct login with token issuance.
     * Convenience endpoint for first-party SPA.
     */
    async login(req, res) {
        try {
            const { email, password } = req.body;

            const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');
            if (!user) {
                return errorResponse(res, 401, 'Invalid email or password');
            }

            if (user.isLocked) {
                return errorResponse(res, 423, 'Account is temporarily locked due to too many failed login attempts');
            }

            const isValidPassword = await user.comparePassword(password);
            if (!isValidPassword) {
                await user.incLoginAttempts();
                return errorResponse(res, 401, 'Invalid email or password');
            }

            if (!user.isActive) {
                return errorResponse(res, 403, 'Account is not active');
            }

            // Reset login attempts
            if (user.loginAttempts > 0) {
                user.loginAttempts = 0;
                user.lockUntil = undefined;
            }
            user.lastLoginAt = new Date();
            await user.save();

            // Default scopes for first-party
            const scopes = ['openid', 'profile', 'email', 'offline_access'];
            const meta = { ip: req.ip, userAgent: req.get('User-Agent') };

            const accessToken = tokenService.generateAccessToken(user, scopes);
            const idToken = tokenService.generateIdToken(user, scopes, null, accessToken);
            const refreshToken = await tokenService.generateRefreshToken(user, scopes, meta);

            this._setRefreshTokenCookie(res, refreshToken);

            logger.info(`User logged in via OAuth2: ${user.email}`, { userId: user._id });

            return successResponse(res, 200, 'Login successful', {
                user: this._formatUserResponse(user),
                access_token: accessToken,
                id_token: idToken,
                refresh_token: refreshToken,
                token_type: 'Bearer',
                expires_in: config.ACCESS_TOKEN_TTL,
                scope: scopes.join(' '),
            });
        } catch (error) {
            logger.error('OAuth2 login error:', error);
            return errorResponse(res, 500, 'Login failed', error.message);
        }
    }

    /**
     * POST /oauth/logout
     * Revoke all tokens and clear cookies.
     */
    async logout(req, res) {
        try {
            // Revoke the refresh token from cookie
            const refreshToken = req.cookies?.refresh_token;
            if (refreshToken) {
                await tokenService.revokeRefreshToken(refreshToken);
            }

            this._clearRefreshTokenCookie(res);

            logger.info(`User logged out: ${req.user?.sub}`);

            return successResponse(res, 200, 'Logged out successfully');
        } catch (error) {
            logger.error('Logout error:', error);
            return errorResponse(res, 500, 'Logout failed');
        }
    }

    /**
     * POST /oauth/logout-all
     * Revoke all sessions for the user (logout from all devices).
     */
    async logoutAll(req, res) {
        try {
            await tokenService.revokeAllUserTokens(req.user.sub);
            this._clearRefreshTokenCookie(res);

            logger.info(`All sessions revoked for user: ${req.user.sub}`);

            return successResponse(res, 200, 'All sessions revoked successfully');
        } catch (error) {
            logger.error('Logout all error:', error);
            return errorResponse(res, 500, 'Failed to revoke all sessions');
        }
    }

    /**
     * GET /oauth/sessions
     * List active sessions for the authenticated user.
     */
    async sessions(req, res) {
        try {
            const sessions = await tokenService.getActiveSessions(req.user.sub);

            return successResponse(res, 200, 'Active sessions retrieved', {
                sessions: sessions.map(s => ({
                    id: s._id,
                    ip: s.createdByIp,
                    userAgent: s.userAgent,
                    createdAt: s.createdAt,
                    lastUsedAt: s.lastUsedAt,
                })),
            });
        } catch (error) {
            logger.error('Get sessions error:', error);
            return errorResponse(res, 500, 'Failed to retrieve sessions');
        }
    }

    // ══════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════

    /**
     * Set refresh token as HttpOnly secure cookie.
     * 
     * Security properties:
     * - HttpOnly: not accessible via JavaScript (prevents XSS theft)
     * - Secure: only sent over HTTPS (in production)
     * - SameSite=Lax: prevents CSRF (cookie not sent on cross-origin POST)
     * - Path=/oauth: only sent to token endpoints (minimizes exposure)
     */
    _setRefreshTokenCookie(res, refreshToken) {
        res.cookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/oauth',
            maxAge: config.REFRESH_TOKEN_TTL * 1000,
        });
    }

    _clearRefreshTokenCookie(res) {
        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/oauth',
        });
    }

    /**
     * Standard user response format with dual field names for frontend compat.
     */
    _formatUserResponse(user) {
        return {
            _id: user._id,
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            phone: user.phone,
            mobile: user.phone,
            avatar: user.avatar,
            dateOfBirth: user.dateOfBirth,
            dob: user.dateOfBirth,
            gender: user.gender,
            bio: user.bio,
            address: user.address,
            isActive: user.isActive,
            isEmailVerified: user.isEmailVerified,
            fullName: user.fullName,
            isLocked: user.isLocked,
            lastLoginAt: user.lastLoginAt,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }
}

module.exports = new OAuth2Controller();
