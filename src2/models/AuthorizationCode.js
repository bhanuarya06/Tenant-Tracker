/**
 * AuthorizationCode Model
 * 
 * Implements the Authorization Code used in OAuth 2.0 Authorization Code Flow with PKCE.
 * 
 * Flow:
 * 1. User authenticates on the login page
 * 2. Server generates a short-lived authorization code
 * 3. Code is exchanged for tokens at the /oauth/token endpoint
 * 4. PKCE (code_verifier/code_challenge) prevents authorization code interception
 * 
 * Security:
 * - Codes are single-use (marked as used after exchange)
 * - Very short TTL (10 minutes, per RFC 6749)
 * - PKCE challenge stored alongside code
 * - Bound to specific redirect_uri and client_id
 */
const mongoose = require('mongoose');
const { Schema } = mongoose;

const authorizationCodeSchema = new Schema({
    // The authorization code value (opaque string)
    code: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },

    // The user who authorized this code
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

    // Client that requested the code
    clientId: {
        type: String,
        required: true,
    },

    // The redirect_uri provided in the authorization request (must match on exchange)
    redirectUri: {
        type: String,
        required: true,
    },

    // Scopes authorized by the user
    scopes: [{
        type: String,
        enum: ['openid', 'profile', 'email', 'offline_access'],
    }],

    // PKCE: SHA-256 hash of the code_verifier
    codeChallenge: {
        type: String,
        required: true,
    },

    // PKCE: method used (always S256 in production)
    codeChallengeMethod: {
        type: String,
        enum: ['S256'],
        default: 'S256',
    },

    // Nonce for OIDC (included in ID token)
    nonce: {
        type: String,
    },

    // Whether this code has been exchanged
    isUsed: {
        type: Boolean,
        default: false,
    },

    // Expiration (10 minutes)
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 },
    },
}, {
    timestamps: true,
});

/**
 * Find and validate an authorization code.
 */
authorizationCodeSchema.statics.findValidCode = async function (code) {
    return this.findOne({
        code,
        isUsed: false,
        expiresAt: { $gt: new Date() },
    });
};

/**
 * Mark code as used (single-use enforcement).
 */
authorizationCodeSchema.methods.markUsed = async function () {
    this.isUsed = true;
    return this.save();
};

const AuthorizationCode = mongoose.model('AuthorizationCode', authorizationCodeSchema);

module.exports = AuthorizationCode;
