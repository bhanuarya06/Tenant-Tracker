/**
 * OIDC Service
 * 
 * Implements OpenID Connect Discovery (RFC 8414) and UserInfo (OIDC Core 5.3).
 * 
 * Discovery document (/.well-known/openid-configuration):
 *   Any OIDC-compliant client (frontend, mobile app, third-party service) can
 *   auto-discover all endpoints, supported scopes, signing algorithms, etc.
 *   This is how Google, Microsoft, Okta, Auth0 all work — every OIDC provider
 *   serves this document.
 * 
 * JWKS (/.well-known/jwks.json):
 *   Public keys for verifying JWT signatures. Any service can fetch these
 *   to verify tokens without needing a shared secret.
 */
const config = require('../config/config');

class OidcService {

    /**
     * Generate the OIDC Discovery Document.
     * Per OpenID Connect Discovery 1.0 specification.
     * 
     * This document tells clients everything they need to know about
     * this authorization server.
     */
    getDiscoveryDocument() {
        const issuer = config.OIDC_ISSUER;

        return {
            // REQUIRED fields
            issuer,
            authorization_endpoint: `${issuer}/oauth/authorize`,
            token_endpoint: `${issuer}/oauth/token`,
            userinfo_endpoint: `${issuer}/oauth/userinfo`,
            jwks_uri: `${issuer}/.well-known/jwks.json`,

            // Revocation & Introspection (RFC 7009 / RFC 7662)
            revocation_endpoint: `${issuer}/oauth/revoke`,
            introspection_endpoint: `${issuer}/oauth/introspect`,

            // Registration endpoint (not implemented — would be for dynamic client registration)
            // registration_endpoint: `${issuer}/oauth/register`,

            // Supported scopes
            scopes_supported: [
                'openid',
                'profile',
                'email',
                'offline_access',
            ],

            // Response types supported
            response_types_supported: [
                'code',                 // Authorization Code Flow
            ],

            // Response modes
            response_modes_supported: [
                'query',
                'fragment',
            ],

            // Grant types supported
            grant_types_supported: [
                'authorization_code',
                'refresh_token',
            ],

            // Subject identifier types
            subject_types_supported: ['public'],

            // ID Token signing algorithms
            id_token_signing_alg_values_supported: ['RS256'],

            // Token endpoint auth methods
            token_endpoint_auth_methods_supported: [
                'none',                 // Public clients (SPAs) — use PKCE instead
            ],

            // PKCE support
            code_challenge_methods_supported: ['S256'],

            // Claims supported
            claims_supported: [
                'sub',
                'iss',
                'aud',
                'exp',
                'iat',
                'auth_time',
                'nonce',
                'at_hash',
                'name',
                'given_name',
                'family_name',
                'email',
                'email_verified',
                'picture',
                'gender',
                'birthdate',
                'updated_at',
            ],

            // Token types
            token_endpoint_auth_signing_alg_values_supported: ['RS256'],

            // Display values
            display_values_supported: ['page'],

            // Service documentation
            service_documentation: `${issuer}/docs`,

            // Claims parameter supported
            claims_parameter_supported: false,

            // Request parameter supported
            request_parameter_supported: false,

            // Request URI parameter supported
            request_uri_parameter_supported: false,

            // Require request URI registration
            require_request_uri_registration: false,
        };
    }

    /**
     * Build the UserInfo response per OIDC Core 5.3.
     * Returns claims based on the granted scopes.
     * 
     * @param {Object} user - User document
     * @param {string[]} scopes - Granted scopes from the access token
     */
    getUserInfoClaims(user, scopes = []) {
        // "sub" is always returned
        const claims = {
            sub: user._id.toString(),
        };

        if (scopes.includes('profile')) {
            claims.name = `${user.firstName} ${user.lastName || ''}`.trim();
            claims.given_name = user.firstName;
            if (user.lastName) claims.family_name = user.lastName;
            if (user.avatar) claims.picture = user.avatar;
            if (user.gender) claims.gender = user.gender;
            if (user.dateOfBirth) claims.birthdate = user.dateOfBirth.toISOString().split('T')[0];
            claims.updated_at = Math.floor(new Date(user.updatedAt).getTime() / 1000);
        }

        if (scopes.includes('email')) {
            claims.email = user.email;
            claims.email_verified = user.isEmailVerified || false;
        }

        return claims;
    }
}

module.exports = new OidcService();
