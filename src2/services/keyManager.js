/**
 * RSA Key Manager
 * 
 * Production-grade asymmetric key management for JWT signing (RS256).
 * 
 * How it works:
 * - Generates RSA-2048 key pairs for signing JWTs
 * - In production, keys should be provided via environment variables or a secrets manager (AWS KMS, HashiCorp Vault)
 * - In development, keys are auto-generated on first startup and cached in memory
 * - Supports key rotation via key ID (kid) in JWKS
 * - Exposes public keys via JWKS endpoint for token verification by any service
 */
const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config/config');

class KeyManager {
    constructor() {
        this._keyPair = null;
        this._keyId = null;
        this._jwk = null;
        this._initialized = false;
    }

    /**
     * Initialize the key manager.
     * In production: load from env vars / secrets manager.
     * In development: generate ephemeral keys.
     */
    async initialize() {
        if (this._initialized) return;

        try {
            if (config.RSA_PRIVATE_KEY && config.RSA_PUBLIC_KEY) {
                // Production: load keys from environment
                this._keyPair = {
                    privateKey: config.RSA_PRIVATE_KEY,
                    publicKey: config.RSA_PUBLIC_KEY,
                };
                this._keyId = config.RSA_KEY_ID || this._generateKeyId(config.RSA_PUBLIC_KEY);
                logger.info('RSA keys loaded from environment variables');
            } else {
                // Development: generate ephemeral key pair
                const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
                    modulusLength: 2048,
                    publicKeyEncoding: { type: 'spki', format: 'pem' },
                    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
                });

                this._keyPair = { privateKey, publicKey };
                this._keyId = this._generateKeyId(publicKey);

                logger.warn('Generated ephemeral RSA key pair (development only). Set RSA_PRIVATE_KEY and RSA_PUBLIC_KEY env vars for production.');
            }

            // Pre-compute JWK representation
            this._jwk = this._publicKeyToJwk(this._keyPair.publicKey);
            this._initialized = true;

            logger.info(`Key manager initialized with kid: ${this._keyId}`);
        } catch (error) {
            logger.error('Failed to initialize key manager:', error);
            throw error;
        }
    }

    /** RSA private key in PEM format */
    get privateKey() {
        this._ensureInitialized();
        return this._keyPair.privateKey;
    }

    /** RSA public key in PEM format */
    get publicKey() {
        this._ensureInitialized();
        return this._keyPair.publicKey;
    }

    /** Key ID for JWKS / JWT headers */
    get keyId() {
        this._ensureInitialized();
        return this._keyId;
    }

    /**
     * Returns the JWKS (JSON Web Key Set) document.
     * Used by /.well-known/jwks.json endpoint.
     */
    getJwks() {
        this._ensureInitialized();
        return {
            keys: [this._jwk],
        };
    }

    /**
     * Convert PEM public key to JWK format (RSA).
     */
    _publicKeyToJwk(pem) {
        const keyObject = crypto.createPublicKey(pem);
        const exported = keyObject.export({ format: 'jwk' });

        return {
            kty: exported.kty,
            n: exported.n,
            e: exported.e,
            kid: this._keyId,
            alg: 'RS256',
            use: 'sig',
        };
    }

    /**
     * Derive a deterministic key ID from the public key (SHA-256 thumbprint).
     */
    _generateKeyId(publicKeyPem) {
        const hash = crypto.createHash('sha256').update(publicKeyPem).digest('base64url');
        return hash.substring(0, 16);
    }

    _ensureInitialized() {
        if (!this._initialized) {
            throw new Error('KeyManager not initialized. Call initialize() first.');
        }
    }
}

// Singleton
module.exports = new KeyManager();
