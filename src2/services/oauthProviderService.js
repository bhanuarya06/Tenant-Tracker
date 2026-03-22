/**
 * OAuth Provider Service
 * 
 * Handles authorization code exchange and ID token / profile validation
 * for external OAuth providers (Google, GitHub).
 * 
 * Flow per provider:
 * 1. Frontend obtains an authorization code via redirect (PKCE)
 * 2. Frontend sends { code, code_verifier, nonce, redirect_uri } to backend
 * 3. This service exchanges the code at the provider's token endpoint
 * 4. Validates the ID token (Google) or fetches the user profile (GitHub)
 * 5. Returns normalized user profile data
 * 
 * Google: Uses OIDC — returns an ID token with verified claims.
 * GitHub: Not OIDC — we exchange code for access token, then call /user API.
 */
const crypto = require('crypto');
const config = require('../config/config');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────
// Provider Configuration
// ─────────────────────────────────────────────────

const PROVIDERS = {
    google: {
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        userinfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
        jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
        issuer: 'https://accounts.google.com',
    },
    github: {
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        userEndpoint: 'https://api.github.com/user',
        emailsEndpoint: 'https://api.github.com/user/emails',
    },
};

class OAuthProviderService {

    /**
     * Exchange authorization code for user profile, based on provider.
     * 
     * @param {string} provider - 'google' or 'github'
     * @param {Object} params - { code, code_verifier, nonce, redirect_uri }
     * @returns {Object} Normalized profile: { providerId, email, firstName, lastName, avatar, emailVerified, rawProfile }
     */
    async exchangeCodeForProfile(provider, { code, code_verifier, nonce, redirect_uri }) {
        switch (provider) {
            case 'google':
                return this._handleGoogle(code, code_verifier, nonce, redirect_uri);
            case 'github':
                return this._handleGitHub(code, code_verifier, redirect_uri);
            default:
                throw new Error(`Unsupported OAuth provider: ${provider}`);
        }
    }

    // ─────────────────────────────────────────────────
    // GOOGLE (Full OIDC)
    // ─────────────────────────────────────────────────

    async _handleGoogle(code, codeVerifier, nonce, redirectUri) {
        // 1. Exchange code for tokens at Google's token endpoint
        const tokenResponse = await fetch(PROVIDERS.google.tokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                client_id: config.GOOGLE_CLIENT_ID,
                client_secret: config.GOOGLE_CLIENT_SECRET,
                code_verifier: codeVerifier,
            }),
        });

        if (!tokenResponse.ok) {
            const errorBody = await tokenResponse.text();
            logger.error('Google token exchange failed:', { status: tokenResponse.status, body: errorBody });
            throw new Error('Failed to exchange authorization code with Google');
        }

        const tokens = await tokenResponse.json();

        // 2. Decode and validate the ID token
        //    Google's ID token is a JWT signed by Google's keys.
        //    We validate: iss, aud, exp, nonce.
        const idTokenPayload = this._decodeJwtPayload(tokens.id_token);

        // Validate issuer
        if (idTokenPayload.iss !== 'https://accounts.google.com' && 
            idTokenPayload.iss !== 'accounts.google.com') {
            throw new Error('Invalid Google ID token issuer');
        }

        // Validate audience
        if (idTokenPayload.aud !== config.GOOGLE_CLIENT_ID) {
            throw new Error('Invalid Google ID token audience');
        }

        // Validate expiration
        if (idTokenPayload.exp < Math.floor(Date.now() / 1000)) {
            throw new Error('Google ID token has expired');
        }

        // Validate nonce (if provided — prevents replay attacks)
        if (nonce && idTokenPayload.nonce !== nonce) {
            throw new Error('Google ID token nonce mismatch');
        }

        logger.info('Google ID token validated successfully', { sub: idTokenPayload.sub });

        // 3. Return normalized profile
        return {
            provider: 'google',
            providerId: idTokenPayload.sub,
            email: idTokenPayload.email,
            emailVerified: idTokenPayload.email_verified || false,
            firstName: idTokenPayload.given_name || idTokenPayload.name?.split(' ')[0] || '',
            lastName: idTokenPayload.family_name || '',
            avatar: idTokenPayload.picture || null,
            rawProfile: idTokenPayload,
        };
    }

    // ─────────────────────────────────────────────────
    // GITHUB (Not OIDC — use access token + API)
    // ─────────────────────────────────────────────────

    async _handleGitHub(code, codeVerifier, redirectUri) {
        // 1. Exchange code for access token
        const tokenResponse = await fetch(PROVIDERS.github.tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                client_id: config.GITHUB_CLIENT_ID,
                client_secret: config.GITHUB_CLIENT_SECRET,
                code,
                redirect_uri: redirectUri,
            }),
        });

        if (!tokenResponse.ok) {
            const errorBody = await tokenResponse.text();
            logger.error('GitHub token exchange failed:', { status: tokenResponse.status, body: errorBody });
            throw new Error('Failed to exchange authorization code with GitHub');
        }

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            logger.error('GitHub token error:', tokenData);
            throw new Error(`GitHub OAuth error: ${tokenData.error_description || tokenData.error}`);
        }

        const accessToken = tokenData.access_token;

        // 2. Fetch user profile
        const userResponse = await fetch(PROVIDERS.github.userEndpoint, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
        });

        if (!userResponse.ok) {
            throw new Error('Failed to fetch GitHub user profile');
        }

        const profile = await userResponse.json();

        // 3. Fetch verified email (GitHub doesn't always include email in profile)
        let email = profile.email;
        let emailVerified = false;

        if (!email) {
            const emailsResponse = await fetch(PROVIDERS.github.emailsEndpoint, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            });

            if (emailsResponse.ok) {
                const emails = await emailsResponse.json();
                // Pick the primary verified email
                const primaryEmail = emails.find(e => e.primary && e.verified)
                    || emails.find(e => e.verified)
                    || emails[0];
                if (primaryEmail) {
                    email = primaryEmail.email;
                    emailVerified = primaryEmail.verified || false;
                }
            }
        } else {
            emailVerified = true; // If GitHub returns it in profile, it's verified
        }

        if (!email) {
            throw new Error('Could not retrieve email from GitHub. Please ensure your email is public or grant email scope.');
        }

        logger.info('GitHub profile fetched successfully', { id: profile.id, login: profile.login });

        // 4. Parse name
        const nameParts = (profile.name || profile.login || '').split(' ');

        return {
            provider: 'github',
            providerId: profile.id.toString(),
            email,
            emailVerified,
            firstName: nameParts[0] || profile.login || '',
            lastName: nameParts.slice(1).join(' ') || '',
            avatar: profile.avatar_url || null,
            rawProfile: profile,
        };
    }

    // ─────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────

    /**
     * Decode JWT payload without verification (for reading claims).
     * Verification is handled by checking iss/aud/exp/nonce manually.
     */
    _decodeJwtPayload(token) {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT format');
        }
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    }

    /**
     * Check if a provider is supported and configured.
     */
    isProviderConfigured(provider) {
        switch (provider) {
            case 'google':
                return !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
            case 'github':
                return !!(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET);
            default:
                return false;
        }
    }

    /**
     * Get list of configured providers.
     */
    getConfiguredProviders() {
        return ['google', 'github'].filter(p => this.isProviderConfigured(p));
    }
}

module.exports = new OAuthProviderService();
