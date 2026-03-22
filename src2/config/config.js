const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
    // Server Configuration
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    
    // Database Configuration
    MONGODB_URI: process.env.MONGODB_URI || process.env.mongoDB_URL,
    
    // Legacy JWT Configuration (kept for backward compatibility)
    JWT_SECRET: process.env.JWT_SECRET || 'no-one-can-hack-my-key',
    JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
    JWT_COOKIE_EXPIRE: process.env.JWT_COOKIE_EXPIRE || 7,

    // ═══════════════════════════════════════════
    // OAuth 2.0 / OIDC Configuration
    // ═══════════════════════════════════════════

    // Issuer URL — the base URL of this authorization server
    // MUST match the 'iss' claim in all issued tokens
    OIDC_ISSUER: process.env.OIDC_ISSUER || `http://localhost:${process.env.PORT || 3000}`,

    // Audience — who the access tokens are intended for
    OIDC_AUDIENCE: process.env.OIDC_AUDIENCE || 'tenanttracker-api',

    // Client ID — identifier for the first-party SPA client
    OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID || 'tenanttracker-web',

    // Allowed redirect URIs (registered per OAuth2 spec)
    ALLOWED_REDIRECT_URIS: (process.env.ALLOWED_REDIRECT_URIS || 
        'http://localhost:5173/callback,http://localhost:5173/auth/callback')
        .split(',')
        .map(uri => uri.trim()),

    // Token TTLs (in seconds)
    ACCESS_TOKEN_TTL: parseInt(process.env.ACCESS_TOKEN_TTL) || 900,          // 15 minutes
    REFRESH_TOKEN_TTL: parseInt(process.env.REFRESH_TOKEN_TTL) || 604800,     // 7 days
    ID_TOKEN_TTL: parseInt(process.env.ID_TOKEN_TTL) || 3600,                 // 1 hour

    // RSA Keys (for RS256 signing) — provide in production via env vars or secrets manager
    // In development, keys are auto-generated if not provided
    RSA_PRIVATE_KEY: process.env.RSA_PRIVATE_KEY 
        ? process.env.RSA_PRIVATE_KEY.replace(/\\n/g, '\n') : null,
    RSA_PUBLIC_KEY: process.env.RSA_PUBLIC_KEY 
        ? process.env.RSA_PUBLIC_KEY.replace(/\\n/g, '\n') : null,
    RSA_KEY_ID: process.env.RSA_KEY_ID || null,

    // ═══════════════════════════════════════════
    // External OAuth Provider Configuration
    // ═══════════════════════════════════════════

    // Google OAuth
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || null,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || null,

    // GitHub OAuth
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || null,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || null,

    // ═══════════════════════════════════════════
    
    // CORS Configuration
    CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
    
    // Email Configuration (for future use)
    EMAIL_FROM: process.env.EMAIL_FROM,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_EMAIL: process.env.SMTP_EMAIL,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    
    // File Upload Configuration
    MAX_FILE_SIZE: process.env.MAX_FILE_SIZE || 5000000, // 5MB
    
    // Rate Limiting
    RATE_LIMIT_WINDOW: process.env.RATE_LIMIT_WINDOW || 15, // 15 minutes
    RATE_LIMIT_MAX: process.env.RATE_LIMIT_MAX || 100, // 100 requests per window
    
    // Bcrypt Configuration
    BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    
    // Pagination
    DEFAULT_PAGE_SIZE: parseInt(process.env.DEFAULT_PAGE_SIZE) || 10,
    MAX_PAGE_SIZE: parseInt(process.env.MAX_PAGE_SIZE) || 100,
};

module.exports = config;