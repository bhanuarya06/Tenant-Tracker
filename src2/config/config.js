const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
    // Server Configuration
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    
    // Database Configuration
    MONGODB_URI: process.env.MONGODB_URI || process.env.mongoDB_URL,
    
    // JWT Configuration
    JWT_SECRET: process.env.JWT_SECRET || 'no-one-can-hack-my-key',
    JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
    JWT_COOKIE_EXPIRE: process.env.JWT_COOKIE_EXPIRE || 7,
    
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