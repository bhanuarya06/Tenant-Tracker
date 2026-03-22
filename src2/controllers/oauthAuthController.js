/**
 * OAuth Authentication Controller
 * 
 * Handles external OAuth provider authentication (Google, GitHub)
 * and token management endpoints that match the frontend's expected API:
 * 
 *   POST   /auth/oauth/:provider/callback  — Exchange provider code for app tokens
 *   POST   /auth/token/refresh              — Refresh access token via httpOnly cookie
 *   POST   /auth/token/revoke               — Revoke refresh token
 *   GET    /auth/me                         — Get current user from access token
 *   DELETE /auth/oauth/:provider/unlink     — Unlink OAuth provider from account
 */
const User = require('../models/User');
const tokenService = require('../services/tokenService');
const oauthProviderService = require('../services/oauthProviderService');
const config = require('../config/config');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/response');

// Standard scopes for all first-party token issuance
const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'offline_access'];

class OAuthAuthController {

    // ══════════════════════════════════════════════
    // POST /auth/oauth/:provider/callback
    // ══════════════════════════════════════════════

    /**
     * Exchange an OAuth provider's authorization code for app tokens.
     * 
     * Flow:
     * 1. Frontend redirects user to Google/GitHub, gets an auth code
     * 2. Frontend sends { code, code_verifier, nonce, redirect_uri } here
     * 3. We exchange the code at the provider's token endpoint
     * 4. Validate the ID token / profile
     * 5. Find or create the user in our DB
     * 6. Issue our own RS256 access token + httpOnly refresh cookie
     */
    async providerCallback(req, res) {
        try {
            const { provider } = req.params;
            const { code, code_verifier, nonce, redirect_uri } = req.body;

            // Validate provider is supported and configured
            if (!['google', 'github'].includes(provider)) {
                return errorResponse(res, 400, `Unsupported OAuth provider: ${provider}`);
            }

            if (!oauthProviderService.isProviderConfigured(provider)) {
                return errorResponse(res, 400, `OAuth provider "${provider}" is not configured on the server`);
            }

            if (!code) {
                return errorResponse(res, 400, 'Authorization code is required');
            }

            // Exchange code with the provider
            const profile = await oauthProviderService.exchangeCodeForProfile(
                provider, { code, code_verifier, nonce, redirect_uri }
            );

            // Find or create user
            const { user, isNewUser } = await this._findOrCreateUser(profile);

            // Update last login
            user.lastLoginAt = new Date();
            await user.save();

            // Issue tokens
            const meta = { ip: req.ip, userAgent: req.get('User-Agent') };
            const accessToken = tokenService.generateAccessToken(user, DEFAULT_SCOPES);
            const idToken = tokenService.generateIdToken(user, DEFAULT_SCOPES, nonce, accessToken);
            const refreshToken = await tokenService.generateRefreshToken(user, DEFAULT_SCOPES, meta);

            // Set refresh token as httpOnly cookie
            this._setRefreshTokenCookie(res, refreshToken);

            logger.info(`User authenticated via ${provider}: ${user.email}`, {
                userId: user._id,
                isNewUser,
                provider,
            });

            return successResponse(res, 200, isNewUser ? 'Account created successfully' : 'Login successful', {
                user: this._formatUserResponse(user),
                token: accessToken,
                expiresIn: config.ACCESS_TOKEN_TTL,
            });
        } catch (error) {
            logger.error(`OAuth ${req.params.provider} callback error:`, error);

            // Don't leak internal error details to client
            const message = error.message?.includes('exchange')
                ? 'Failed to authenticate with provider. Please try again.'
                : error.message || 'OAuth authentication failed';

            return errorResponse(res, 401, message);
        }
    }

    // ══════════════════════════════════════════════
    // POST /auth/token/refresh
    // ══════════════════════════════════════════════

    /**
     * Refresh the access token using the httpOnly refresh cookie.
     * Implements refresh token rotation.
     */
    async refreshToken(req, res) {
        try {
            const rawRefreshToken = req.cookies?.refresh_token;

            if (!rawRefreshToken) {
                return errorResponse(res, 401, 'No refresh token provided');
            }

            const meta = { ip: req.ip, userAgent: req.get('User-Agent') };
            const result = await tokenService.rotateRefreshToken(rawRefreshToken, meta);

            if (!result) {
                this._clearRefreshTokenCookie(res);
                return errorResponse(res, 401, 'Refresh token is invalid, expired, or revoked');
            }

            // Set new refresh token cookie (rotation)
            this._setRefreshTokenCookie(res, result.refreshToken);

            logger.info(`Token refreshed for user ${result.user._id}`);

            return successResponse(res, 200, 'Token refreshed successfully', {
                token: result.accessToken,
                expiresIn: config.ACCESS_TOKEN_TTL,
            });
        } catch (error) {
            logger.error('Token refresh error:', error);
            this._clearRefreshTokenCookie(res);
            return errorResponse(res, 401, 'Token refresh failed');
        }
    }

    // ══════════════════════════════════════════════
    // POST /auth/token/revoke
    // ══════════════════════════════════════════════

    /**
     * Revoke the current refresh token (logout).
     * Clears the httpOnly cookie and blacklists the token.
     */
    async revokeToken(req, res) {
        try {
            const rawRefreshToken = req.cookies?.refresh_token;

            if (rawRefreshToken) {
                await tokenService.revokeRefreshToken(rawRefreshToken);
            }

            this._clearRefreshTokenCookie(res);

            return successResponse(res, 200, 'Token revoked successfully');
        } catch (error) {
            logger.error('Token revocation error:', error);
            // Always clear cookie even on error
            this._clearRefreshTokenCookie(res);
            return successResponse(res, 200, 'Token revoked');
        }
    }

    // ══════════════════════════════════════════════
    // GET /auth/me
    // ══════════════════════════════════════════════

    /**
     * Get the current authenticated user from the access token.
     */
    async getMe(req, res) {
        try {
            const user = await User.findById(req.user.userId || req.user.sub);

            if (!user) {
                return errorResponse(res, 404, 'User not found');
            }

            return successResponse(res, 200, 'User retrieved successfully', {
                user: this._formatUserResponse(user),
            });
        } catch (error) {
            logger.error('Get me error:', error);
            return errorResponse(res, 500, 'Failed to retrieve user');
        }
    }

    // ══════════════════════════════════════════════
    // DELETE /auth/oauth/:provider/unlink
    // ══════════════════════════════════════════════

    /**
     * Unlink an OAuth provider from the user's account.
     * 
     * Guards:
     * - Can't unlink if it's the only auth method (no password and only this provider)
     */
    async unlinkProvider(req, res) {
        try {
            const { provider } = req.params;
            const userId = req.user.userId || req.user.sub;

            if (!['google', 'github'].includes(provider)) {
                return errorResponse(res, 400, `Unsupported provider: ${provider}`);
            }

            const user = await User.findById(userId).select('+password');
            if (!user) {
                return errorResponse(res, 404, 'User not found');
            }

            // Check if provider is linked
            const providerIndex = user.oauthProviders.findIndex(p => p.provider === provider);
            if (providerIndex === -1) {
                return errorResponse(res, 400, `${provider} is not linked to your account`);
            }

            // Safety check: don't allow unlinking if it leaves the user with no auth method
            const hasPassword = !!user.password;
            const otherProviders = user.oauthProviders.filter(p => p.provider !== provider);

            if (!hasPassword && otherProviders.length === 0) {
                return errorResponse(res, 400, 
                    'Cannot unlink — this is your only login method. Set a password first.'
                );
            }

            // Remove the provider
            user.oauthProviders.splice(providerIndex, 1);
            await user.save();

            logger.info(`Provider ${provider} unlinked from user ${userId}`);

            return successResponse(res, 200, `${provider} account unlinked successfully`, {
                user: this._formatUserResponse(user),
            });
        } catch (error) {
            logger.error('Unlink provider error:', error);
            return errorResponse(res, 500, 'Failed to unlink provider');
        }
    }

    // ══════════════════════════════════════════════
    // INTERNAL HELPERS
    // ══════════════════════════════════════════════

    /**
     * Find existing user by OAuth provider ID or email, or create a new one.
     * 
     * Linking logic (same as Auth0 / Firebase):
     * 1. Look up by provider + providerId → exact match, return user
     * 2. Look up by email → if found, link this provider to existing account
     * 3. Not found → create a new user with provider data
     */
    async _findOrCreateUser(profile) {
        const { provider, providerId, email, emailVerified, firstName, lastName, avatar } = profile;

        // 1. Check if this exact provider account is already linked
        let user = await User.findOne({
            'oauthProviders.provider': provider,
            'oauthProviders.providerId': providerId,
        });

        if (user) {
            return { user, isNewUser: false };
        }

        // 2. Check if a user with this email already exists → link the provider
        user = await User.findOne({ email: email.toLowerCase() });

        if (user) {
            // Link the new provider to the existing account
            user.oauthProviders.push({
                provider,
                providerId,
                email,
                displayName: `${firstName} ${lastName}`.trim(),
                avatar,
                linkedAt: new Date(),
            });

            // Update avatar if user doesn't have one
            if (!user.avatar && avatar) {
                user.avatar = avatar;
            }

            // Mark email as verified if the provider says so
            if (emailVerified && !user.isEmailVerified) {
                user.isEmailVerified = true;
            }

            await user.save();

            logger.info(`Linked ${provider} to existing user: ${email}`, { userId: user._id });
            return { user, isNewUser: false };
        }

        // 3. Create a new user
        user = await User.create({
            firstName,
            lastName,
            email: email.toLowerCase(),
            // No password — OAuth-only user
            role: 'owner', // Default role
            avatar,
            isActive: true,
            isEmailVerified: emailVerified || false,
            oauthProviders: [{
                provider,
                providerId,
                email,
                displayName: `${firstName} ${lastName}`.trim(),
                avatar,
                linkedAt: new Date(),
            }],
        });

        logger.info(`New user created via ${provider}: ${email}`, { userId: user._id });
        return { user, isNewUser: true };
    }

    /**
     * Set refresh token as httpOnly secure cookie.
     */
    _setRefreshTokenCookie(res, refreshToken) {
        res.cookie('refresh_token', refreshToken, {
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: config.REFRESH_TOKEN_TTL * 1000,
        });
    }

    _clearRefreshTokenCookie(res) {
        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: config.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });
    }

    /**
     * Format user response with both field name formats for frontend compatibility.
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
            oauthProviders: (user.oauthProviders || []).map(p => ({
                provider: p.provider,
                email: p.email,
                displayName: p.displayName,
                linkedAt: p.linkedAt,
            })),
        };
    }
}

module.exports = new OAuthAuthController();
