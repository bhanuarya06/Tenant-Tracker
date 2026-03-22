const express = require('express');
const rateLimit = require('express-rate-limit');
const { validate } = require('../middleware/validation');
const { auth } = require('../middleware/auth');
const { userRegister, userLogin, userUpdate, changePassword } = require('../validators');
const authController = require('../controllers/authController');
const oauthAuthController = require('../controllers/oauthAuthController');

const router = express.Router();

// ─────────────────────────────────────────
// Rate limiters for auth endpoints
// ─────────────────────────────────────────

const oauthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15,                   // 15 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many authentication attempts. Please try again later.',
    },
});

// ─────────────────────────────────────────
// OAuth Provider Endpoints (for frontend)
// ─────────────────────────────────────────

/**
 * @route   POST /auth/oauth/:provider/callback
 * @desc    Exchange OAuth provider code for app tokens
 * @access  Public
 * @params  provider: 'google' | 'github'
 * @body    { code, code_verifier, nonce, redirect_uri }
 */
router.post('/oauth/:provider/callback', oauthLimiter,
    (req, res) => oauthAuthController.providerCallback(req, res));

/**
 * @route   DELETE /auth/oauth/:provider/unlink
 * @desc    Unlink an OAuth provider from the user's account
 * @access  Private
 */
router.delete('/oauth/:provider/unlink', auth,
    (req, res) => oauthAuthController.unlinkProvider(req, res));

// ─────────────────────────────────────────
// Token Management Endpoints (for frontend)
// ─────────────────────────────────────────

/**
 * @route   POST /auth/token/refresh
 * @desc    Refresh access token using httpOnly refresh cookie
 * @access  Public (cookie-based)
 */
router.post('/token/refresh',
    (req, res) => oauthAuthController.refreshToken(req, res));

/**
 * @route   POST /auth/token/revoke
 * @desc    Revoke refresh token (logout)
 * @access  Public (cookie-based)
 */
router.post('/token/revoke',
    (req, res) => oauthAuthController.revokeToken(req, res));

// ─────────────────────────────────────────
// Current User Endpoint
// ─────────────────────────────────────────

/**
 * @route   GET /auth/me
 * @desc    Get current user from access token
 * @access  Private
 */
router.get('/me', auth,
    (req, res) => oauthAuthController.getMe(req, res));

// ─────────────────────────────────────────
// Email/Password Auth (existing endpoints)
// ─────────────────────────────────────────

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', validate(userRegister), (req, res) => authController.register(req, res));

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', validate(userLogin), (req, res) => authController.login(req, res));

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', auth, authController.getProfile);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', auth, validate(userUpdate), authController.updateProfile);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password', auth, validate(changePassword), authController.changePassword);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (revoke refresh token + clear cookie)
 * @access  Private
 */
router.post('/logout', auth, (req, res) => authController.logout(req, res));

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Send password reset email
 * @access  Public
 */
router.post('/forgot-password', authController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password', authController.resetPassword);

module.exports = router;