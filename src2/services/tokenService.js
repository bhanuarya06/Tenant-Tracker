/**
 * Token Service
 * 
 * Central service for all token operations in the OAuth 2.0 / OIDC system.
 * This is the core of the authentication infrastructure.
 * 
 * Token Types:
 * 1. Access Token  — Short-lived JWT (15 min), RS256-signed, used to access APIs
 * 2. Refresh Token — Long-lived opaque string (7 days), stored hashed in DB, used to get new access tokens
 * 3. ID Token      — OIDC-standard JWT with user identity claims, RS256-signed
 * 
 * Production Practices Implemented:
 * - RS256 asymmetric signing (public key verification, private key stays on server)
 * - Refresh token rotation (each use generates new token pair, old token invalidated)
 * - Token family tracking (detects replay attacks — if a stolen rotated token is reused, entire family is revoked)
 * - Client fingerprinting (binds refresh tokens to User-Agent + IP prefix)
 * - Standard JWT claims (iss, sub, aud, exp, iat, jti, etc.)
 * - OIDC-compliant ID tokens with standard claims
 */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const keyManager = require('./keyManager');
const RefreshToken = require('../models/RefreshToken');
const config = require('../config/config');
const logger = require('../utils/logger');

class TokenService {

    // ──────────────────────────────────────────────
    // ACCESS TOKEN
    // ──────────────────────────────────────────────

    /**
     * Generate an access token (JWT, RS256).
     * 
     * @param {Object} user - User document from MongoDB
     * @param {string[]} scopes - Granted scopes
     * @returns {string} Signed JWT access token
     */
    generateAccessToken(user, scopes = []) {
        const now = Math.floor(Date.now() / 1000);

        const payload = {
            // Standard JWT claims (RFC 7519)
            iss: config.OIDC_ISSUER,                   // Issuer
            sub: user._id.toString(),                    // Subject (user ID)
            aud: config.OIDC_AUDIENCE,                   // Audience
            exp: now + config.ACCESS_TOKEN_TTL,          // Expiration (15 min)
            iat: now,                                    // Issued at
            jti: crypto.randomUUID(),                     // Unique token ID

            // Application-specific claims (namespaced to avoid collisions)
            'https://tenanttracker.app/claims/role': user.role,
            'https://tenanttracker.app/claims/email': user.email,

            // Scopes
            scope: scopes.join(' '),

            // Token type indicator
            token_type: 'access',
        };

        return jwt.sign(payload, keyManager.privateKey, {
            algorithm: 'RS256',
            keyid: keyManager.keyId,
        });
    }

    // ──────────────────────────────────────────────
    // ID TOKEN (OIDC)
    // ──────────────────────────────────────────────

    /**
     * Generate an OIDC ID Token.
     * Contains identity claims per OpenID Connect Core 1.0 specification.
     * 
     * @param {Object} user - User document
     * @param {string[]} scopes - Granted scopes
     * @param {string} nonce - Nonce from authorization request (replay protection)
     * @param {string} accessTokenHash - at_hash claim (left half of SHA-256 of access token)
     * @returns {string} Signed JWT ID token
     */
    generateIdToken(user, scopes = [], nonce = null, accessToken = null) {
        const now = Math.floor(Date.now() / 1000);

        const payload = {
            // Required OIDC claims
            iss: config.OIDC_ISSUER,
            sub: user._id.toString(),
            aud: config.OIDC_CLIENT_ID,
            exp: now + config.ID_TOKEN_TTL,
            iat: now,
            jti: crypto.randomUUID(),
        };

        // Nonce (required when provided in auth request — prevents replay)
        if (nonce) {
            payload.nonce = nonce;
        }

        // at_hash: Access Token hash (per OIDC Core 3.3.2.11)
        // Left half of SHA-256 hash of the access token, base64url-encoded
        if (accessToken) {
            payload.at_hash = this._computeAtHash(accessToken);
        }

        // auth_time: when the user last authenticated
        if (user.lastLoginAt) {
            payload.auth_time = Math.floor(new Date(user.lastLoginAt).getTime() / 1000);
        }

        // Profile scope claims (OIDC Core 5.1)
        if (scopes.includes('profile')) {
            payload.name = `${user.firstName} ${user.lastName || ''}`.trim();
            payload.given_name = user.firstName;
            if (user.lastName) payload.family_name = user.lastName;
            if (user.avatar) payload.picture = user.avatar;
            if (user.gender) payload.gender = user.gender;
            if (user.dateOfBirth) payload.birthdate = user.dateOfBirth.toISOString().split('T')[0];
            payload.updated_at = Math.floor(new Date(user.updatedAt).getTime() / 1000);
        }

        // Email scope claims (OIDC Core 5.1)
        if (scopes.includes('email')) {
            payload.email = user.email;
            payload.email_verified = user.isEmailVerified || false;
        }

        return jwt.sign(payload, keyManager.privateKey, {
            algorithm: 'RS256',
            keyid: keyManager.keyId,
        });
    }

    // ──────────────────────────────────────────────
    // REFRESH TOKEN
    // ──────────────────────────────────────────────

    /**
     * Generate and persist a refresh token.
     * 
     * @param {Object} user - User document
     * @param {string[]} scopes - Granted scopes
     * @param {Object} meta - { ip, userAgent } client metadata
     * @param {string} [familyId] - Existing family ID (for rotation), or null for new login
     * @returns {string} Raw opaque refresh token (to be sent to client)
     */
    async generateRefreshToken(user, scopes = [], meta = {}, familyId = null) {
        // Generate a cryptographically random opaque token
        const rawToken = crypto.randomBytes(48).toString('base64url');
        const tokenHash = RefreshToken.hashToken(rawToken);
        const fingerprint = this._computeFingerprint(meta.userAgent, meta.ip);

        const tokenDoc = await RefreshToken.create({
            tokenHash,
            user: user._id,
            familyId: familyId || crypto.randomUUID(),
            scopes,
            fingerprint,
            expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL * 1000),
            createdByIp: meta.ip,
            userAgent: meta.userAgent,
        });

        logger.info(`Refresh token created for user ${user._id}`, {
            familyId: tokenDoc.familyId,
            expiresAt: tokenDoc.expiresAt,
        });

        return rawToken;
    }

    /**
     * Rotate a refresh token (use old one, generate new one).
     * Implements refresh token rotation with replay detection.
     * 
     * @param {string} rawToken - The current refresh token
     * @param {Object} meta - { ip, userAgent } client metadata
     * @returns {{ accessToken, refreshToken, idToken, user }} New token set
     */
    async rotateRefreshToken(rawToken, meta = {}) {
        const existingToken = await RefreshToken.findByToken(rawToken);

        if (!existingToken) {
            // Token not found — could be expired, revoked, or never existed
            logger.warn('Refresh token not found or expired');
            return null;
        }

        // REPLAY DETECTION: If this token was already used (rotated out),
        // someone is reusing a stolen token. Revoke the entire family.
        if (existingToken.isUsed) {
            logger.warn(`Refresh token replay detected! Revoking family: ${existingToken.familyId}`, {
                userId: existingToken.user,
                ip: meta.ip,
            });
            await RefreshToken.revokeFamilyByFamilyId(existingToken.familyId);
            return null;
        }

        // Fingerprint validation (optional — warn but don't block in case of legitimate IP change)
        const currentFingerprint = this._computeFingerprint(meta.userAgent, meta.ip);
        if (existingToken.fingerprint && existingToken.fingerprint !== currentFingerprint) {
            logger.warn('Refresh token fingerprint mismatch — possible token migration', {
                userId: existingToken.user,
                expected: existingToken.fingerprint,
                actual: currentFingerprint,
            });
        }

        // Mark the current token as used (rotated out)
        existingToken.isUsed = true;
        existingToken.lastUsedAt = new Date();
        await existingToken.save();

        // Load the user
        const User = require('../models/User');
        const user = await User.findById(existingToken.user);
        if (!user || !user.isActive) {
            logger.warn('User not found or inactive during token rotation');
            await RefreshToken.revokeFamilyByFamilyId(existingToken.familyId);
            return null;
        }

        // Generate new token set (same family)
        const scopes = existingToken.scopes;
        const accessToken = this.generateAccessToken(user, scopes);
        const newRefreshToken = await this.generateRefreshToken(
            user, scopes, meta, existingToken.familyId
        );

        let idToken = null;
        if (scopes.includes('openid')) {
            idToken = this.generateIdToken(user, scopes, null, accessToken);
        }

        return {
            accessToken,
            refreshToken: newRefreshToken,
            idToken,
            user,
            scopes,
        };
    }

    /**
     * Revoke a specific refresh token.
     */
    async revokeRefreshToken(rawToken) {
        const tokenHash = RefreshToken.hashToken(rawToken);
        const token = await RefreshToken.findOne({ tokenHash });
        if (token) {
            token.isRevoked = true;
            await token.save();
            logger.info(`Refresh token revoked for user ${token.user}`);
        }
    }

    /**
     * Revoke all refresh tokens for a user (full logout from all devices).
     */
    async revokeAllUserTokens(userId) {
        await RefreshToken.revokeAllForUser(userId);
        logger.info(`All refresh tokens revoked for user ${userId}`);
    }

    /**
     * Get active sessions for a user.
     */
    async getActiveSessions(userId) {
        return RefreshToken.getActiveSessions(userId);
    }

    // ──────────────────────────────────────────────
    // TOKEN VERIFICATION
    // ──────────────────────────────────────────────

    /**
     * Verify and decode an access token.
     */
    verifyAccessToken(token) {
        return jwt.verify(token, keyManager.publicKey, {
            algorithms: ['RS256'],
            issuer: config.OIDC_ISSUER,
            audience: config.OIDC_AUDIENCE,
        });
    }

    /**
     * Verify and decode an ID token.
     */
    verifyIdToken(token) {
        return jwt.verify(token, keyManager.publicKey, {
            algorithms: ['RS256'],
            issuer: config.OIDC_ISSUER,
        });
    }

    // ──────────────────────────────────────────────
    // TOKEN INTROSPECTION (RFC 7662)
    // ──────────────────────────────────────────────

    /**
     * Introspect a token — returns token metadata if active.
     */
    async introspect(token, tokenTypeHint = 'access_token') {
        if (tokenTypeHint === 'refresh_token') {
            const refreshToken = await RefreshToken.findByToken(token);
            if (!refreshToken || refreshToken.isUsed || refreshToken.isRevoked) {
                return { active: false };
            }
            return {
                active: true,
                scope: refreshToken.scopes.join(' '),
                client_id: config.OIDC_CLIENT_ID,
                token_type: 'refresh_token',
                exp: Math.floor(refreshToken.expiresAt.getTime() / 1000),
                iat: Math.floor(refreshToken.createdAt.getTime() / 1000),
                sub: refreshToken.user.toString(),
            };
        }

        // Access token or ID token
        try {
            const decoded = this.verifyAccessToken(token);
            return {
                active: true,
                scope: decoded.scope,
                client_id: config.OIDC_CLIENT_ID,
                token_type: decoded.token_type || 'access_token',
                exp: decoded.exp,
                iat: decoded.iat,
                sub: decoded.sub,
                iss: decoded.iss,
                aud: decoded.aud,
                jti: decoded.jti,
            };
        } catch {
            return { active: false };
        }
    }

    // ──────────────────────────────────────────────
    // HELPERS
    // ──────────────────────────────────────────────

    /**
     * Compute at_hash for OIDC ID Token.
     * Per spec: left half of SHA-256 hash of access token, base64url-encoded.
     */
    _computeAtHash(accessToken) {
        const hash = crypto.createHash('sha256').update(accessToken).digest();
        const leftHalf = hash.subarray(0, hash.length / 2);
        return leftHalf.toString('base64url');
    }

    /**
     * Compute a fingerprint from client metadata.
     * Used to weakly bind refresh tokens to a specific client.
     */
    _computeFingerprint(userAgent, ip) {
        const normalized = `${(userAgent || 'unknown').substring(0, 100)}|${this._ipPrefix(ip)}`;
        return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 32);
    }

    /**
     * Extract IP prefix (first 3 octets for IPv4, first 4 groups for IPv6).
     * Provides some binding without being too strict about IP changes.
     */
    _ipPrefix(ip) {
        if (!ip) return 'unknown';
        if (ip.includes('.')) {
            // IPv4: keep first 3 octets
            return ip.split('.').slice(0, 3).join('.');
        }
        // IPv6: keep first 4 groups
        return ip.split(':').slice(0, 4).join(':');
    }
}

module.exports = new TokenService();
