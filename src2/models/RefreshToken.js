/**
 * RefreshToken Model
 * 
 * Stores refresh tokens in the database for:
 * - Token rotation (each use generates a new token, old one is invalidated)
 * - Token family tracking (detects token replay attacks)
 * - Revocation (logout invalidates all tokens for a user)
 * - Audit trail (tracks when/where tokens were used)
 * 
 * Security design (same as Google, Auth0, Okta):
 * - Tokens are hashed before storage (SHA-256) — never stored in plain text
 * - Token families: all tokens from a single login share a familyId
 * - If a rotated-out token is reused, the entire family is revoked (replay detection)
 * - Absolute expiry + idle timeout
 */
const mongoose = require('mongoose');
const crypto = require('crypto');
const { Schema } = mongoose;

const refreshTokenSchema = new Schema({
    // SHA-256 hash of the opaque token value
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },

    // The user this token belongs to
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },

    // Token family ID — all tokens from one login session share this
    // Used for replay detection: if a rotated token is reused, revoke the whole family
    familyId: {
        type: String,
        required: true,
        index: true,
    },

    // Scopes granted to this token
    scopes: [{
        type: String,
        enum: ['openid', 'profile', 'email', 'offline_access'],
    }],

    // Client fingerprint (User-Agent hash + IP prefix) for binding
    fingerprint: {
        type: String,
    },

    // Whether this token has been used (rotated out)
    isUsed: {
        type: Boolean,
        default: false,
    },

    // Whether this token has been explicitly revoked
    isRevoked: {
        type: Boolean,
        default: false,
    },

    // Absolute expiration time
    expiresAt: {
        type: Date,
        required: true,
        index: { expireAfterSeconds: 0 }, // MongoDB TTL index — auto-cleanup
    },

    // Last time this token was used for activity tracking
    lastUsedAt: {
        type: Date,
    },

    // IP address of the client that created this token
    createdByIp: {
        type: String,
    },

    // User agent of the client
    userAgent: {
        type: String,
    },
}, {
    timestamps: true,
});

// Compound indexes for common queries
refreshTokenSchema.index({ user: 1, isRevoked: 1 });
refreshTokenSchema.index({ familyId: 1, isRevoked: 1 });

/**
 * Hash a raw token value for storage.
 */
refreshTokenSchema.statics.hashToken = function (rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
};

/**
 * Find a valid (non-revoked, non-expired) token by its raw value.
 */
refreshTokenSchema.statics.findByToken = async function (rawToken) {
    const tokenHash = this.hashToken(rawToken);
    return this.findOne({
        tokenHash,
        isRevoked: false,
        expiresAt: { $gt: new Date() },
    });
};

/**
 * Revoke all tokens in a family (replay detection).
 */
refreshTokenSchema.statics.revokeFamilyByFamilyId = async function (familyId) {
    return this.updateMany(
        { familyId },
        { $set: { isRevoked: true } }
    );
};

/**
 * Revoke all tokens for a user (full logout).
 */
refreshTokenSchema.statics.revokeAllForUser = async function (userId) {
    return this.updateMany(
        { user: userId },
        { $set: { isRevoked: true } }
    );
};

/**
 * Get active sessions for a user (for "manage sessions" UI).
 */
refreshTokenSchema.statics.getActiveSessions = async function (userId) {
    return this.find({
        user: userId,
        isRevoked: false,
        isUsed: false,
        expiresAt: { $gt: new Date() },
    }).select('createdByIp userAgent createdAt lastUsedAt').sort('-createdAt');
};

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

module.exports = RefreshToken;
