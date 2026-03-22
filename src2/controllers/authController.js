const User = require('../models/User');
const tokenService = require('../services/tokenService');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/response');
const config = require('../config/config');

// Standard scopes for first-party token issuance
const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'offline_access'];

class AuthController {
    // Register a new user
    async register(req, res) {
        try {
            const { email } = req.body;

            // Check if user already exists
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return errorResponse(res, 400, 'User with this email already exists');
            }

            // Prepare user data with explicit field mapping (handle frontend field names)
            const userData = {
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                email: req.body.email,
                password: req.body.password,
                role: req.body.role || 'owner',
                phone: req.body.phone || req.body.mobile, // Handle both 'phone' and 'mobile'
                dateOfBirth: req.body.dateOfBirth || req.body.dob ? 
                    new Date(req.body.dateOfBirth || req.body.dob) : undefined, // Handle both 'dateOfBirth' and 'dob'
                gender: req.body.gender,
                address: req.body.address,
                bio: req.body.bio
            };

            // Remove undefined fields
            Object.keys(userData).forEach(key => {
                if (userData[key] === undefined) {
                    delete userData[key];
                }
            });

            // Create new user
            const user = await User.create(userData);

            // Issue RS256 access token + httpOnly refresh token cookie
            const meta = { ip: req.ip, userAgent: req.get('User-Agent') };
            const token = tokenService.generateAccessToken(user, DEFAULT_SCOPES);
            const refreshToken = await tokenService.generateRefreshToken(user, DEFAULT_SCOPES, meta);
            this._setRefreshTokenCookie(res, refreshToken);

            // Create clean user response with both field name formats for frontend compatibility
            const userResponse = {
                _id: user._id,
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                phone: user.phone,
                mobile: user.phone, // Provide both field names for frontend compatibility
                avatar: user.avatar,
                dateOfBirth: user.dateOfBirth,
                dob: user.dateOfBirth, // Provide both field names for frontend compatibility
                gender: user.gender,
                bio: user.bio,
                address: user.address,
                isActive: user.isActive,
                isEmailVerified: user.isEmailVerified,
                fullName: user.fullName,
                isLocked: user.isLocked,
                lastLoginAt: user.lastLoginAt,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            };

            logger.info(`User registered successfully: ${user.email}`, { userId: user._id });

            return successResponse(res, 201, 'User registered successfully', {
                user: userResponse,
                token,
                expiresIn: config.ACCESS_TOKEN_TTL
            });
        } catch (error) {
            logger.error('Registration error:', error);
            return errorResponse(res, 500, 'Registration failed', error.message);
        }
    }

    // Login user
    async login(req, res) {
        try {
            const { email, password } = req.body;

            // Find user and include password for comparison
            const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');
            
            if (!user) {
                return errorResponse(res, 401, 'Invalid email or password');
            }

            // Check if account is locked
            if (user.isLocked) {
                return errorResponse(res, 423, 'Account is temporarily locked due to too many failed login attempts. Please try again later.');
            }

            // Check password
            const isValidPassword = await user.comparePassword(password);
            if (!isValidPassword) {
                // Increment login attempts
                await user.incLoginAttempts();
                return errorResponse(res, 401, 'Invalid email or password');
            }

            // Check if account is active
            if (!user.isActive) {
                return errorResponse(res, 401, 'Account is not active. Please contact support.');
            }

            // Reset login attempts on successful login
            if (user.loginAttempts > 0) {
                user.loginAttempts = 0;
                user.lockUntil = undefined;
                await user.save();
            }

            // Update last login
            user.lastLogin = new Date();
            await user.save();

            // Issue RS256 access token + httpOnly refresh token cookie
            const meta = { ip: req.ip, userAgent: req.get('User-Agent') };
            const token = tokenService.generateAccessToken(user, DEFAULT_SCOPES);
            const refreshToken = await tokenService.generateRefreshToken(user, DEFAULT_SCOPES, meta);
            this._setRefreshTokenCookie(res, refreshToken);

            // Create clean user response with all necessary fields
            const userResponse = {
                _id: user._id,
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                phone: user.phone,
                mobile: user.phone, // Provide both field names for frontend compatibility
                avatar: user.avatar,
                dateOfBirth: user.dateOfBirth,
                dob: user.dateOfBirth, // Provide both field names for frontend compatibility
                gender: user.gender,
                bio: user.bio,
                address: user.address,
                isActive: user.isActive,
                isEmailVerified: user.isEmailVerified,
                fullName: user.fullName,
                isLocked: user.isLocked,
                lastLoginAt: user.lastLoginAt,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            };

            logger.info(`User logged in successfully: ${user.email}`, { userId: user._id });

            return successResponse(res, 200, 'Login successful', {
                user: userResponse,
                token,
                expiresIn: config.ACCESS_TOKEN_TTL
            });
        } catch (error) {
            logger.error('Login error:', error);
            return errorResponse(res, 500, 'Login failed', error.message);
        }
    }

    // Get current user profile
    async getProfile(req, res) {
        try {
            const user = await User.findById(req.user.userId);
            
            if (!user) {
                return errorResponse(res, 404, 'User not found');
            }

            // Create consistent user response with both field name formats
            const userResponse = {
                _id: user._id,
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                phone: user.phone,
                mobile: user.phone, // Provide both field names for frontend compatibility
                avatar: user.avatar,
                dateOfBirth: user.dateOfBirth,
                dob: user.dateOfBirth, // Provide both field names for frontend compatibility
                gender: user.gender,
                bio: user.bio,
                address: user.address,
                isActive: user.isActive,
                isEmailVerified: user.isEmailVerified,
                fullName: user.fullName,
                isLocked: user.isLocked,
                lastLoginAt: user.lastLoginAt,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            };

            return successResponse(res, 200, 'Profile retrieved successfully', { user: userResponse });
        } catch (error) {
            logger.error('Get profile error:', error);
            return errorResponse(res, 500, 'Failed to retrieve profile', error.message);
        }
    }

    // Update user profile
    async updateProfile(req, res) {
        try {
            const userId = req.user.userId;
            const updates = { ...req.body };

            // Handle field name mapping for updates
            if (updates.mobile && !updates.phone) {
                updates.phone = updates.mobile;
                delete updates.mobile;
            }
            if (updates.dob && !updates.dateOfBirth) {
                updates.dateOfBirth = new Date(updates.dob);
                delete updates.dob;
            }

            // Remove fields that shouldn't be updated via this endpoint
            delete updates.email;
            delete updates.password;
            delete updates.role;
            delete updates.status;

            const user = await User.findByIdAndUpdate(
                userId,
                updates,
                { new: true, runValidators: true }
            );

            if (!user) {
                return errorResponse(res, 404, 'User not found');
            }

            // Create consistent user response with both field name formats
            const userResponse = {
                _id: user._id,
                id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                phone: user.phone,
                mobile: user.phone, // Provide both field names for frontend compatibility
                avatar: user.avatar,
                dateOfBirth: user.dateOfBirth,
                dob: user.dateOfBirth, // Provide both field names for frontend compatibility
                gender: user.gender,
                bio: user.bio,
                address: user.address,
                isActive: user.isActive,
                isEmailVerified: user.isEmailVerified,
                fullName: user.fullName,
                isLocked: user.isLocked,
                lastLoginAt: user.lastLoginAt,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            };

            logger.info(`User profile updated: ${user.email}`, { userId });

            return successResponse(res, 200, 'Profile updated successfully', { user: userResponse });
        } catch (error) {
            logger.error('Update profile error:', error);
            return errorResponse(res, 500, 'Failed to update profile', error.message);
        }
    }

    // Change password
    async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;
            const userId = req.user.userId;

            // Get user with password
            const user = await User.findById(userId).select('+password');
            
            if (!user) {
                return errorResponse(res, 404, 'User not found');
            }

            // Verify current password
            const isCurrentPasswordValid = await user.comparePassword(currentPassword);
            if (!isCurrentPasswordValid) {
                return errorResponse(res, 400, 'Current password is incorrect');
            }

            // Update password
            user.password = newPassword;
            await user.save();

            logger.info(`Password changed for user: ${user.email}`, { userId });

            return successResponse(res, 200, 'Password changed successfully');
        } catch (error) {
            logger.error('Change password error:', error);
            return errorResponse(res, 500, 'Failed to change password', error.message);
        }
    }

    // Logout (revoke refresh token + clear cookie)
    async logout(req, res) {
        try {
            const userId = req.user.userId || req.user.sub;

            // Revoke refresh token from cookie if present
            const rawRefreshToken = req.cookies?.refresh_token;
            if (rawRefreshToken) {
                await tokenService.revokeRefreshToken(rawRefreshToken);
            }
            this._clearRefreshTokenCookie(res);

            logger.info(`User logged out: ${userId}`);

            return successResponse(res, 200, 'Logged out successfully');
        } catch (error) {
            logger.error('Logout error:', error);
            this._clearRefreshTokenCookie(res);
            return successResponse(res, 200, 'Logged out successfully');
        }
    }

    // Forgot password (placeholder for future implementation)
    async forgotPassword(req, res) {
        try {
            // This would typically send a password reset email
            // For now, just return a message
            return successResponse(res, 200, 'Password reset instructions sent to your email (feature coming soon)');
        } catch (error) {
            logger.error('Forgot password error:', error);
            return errorResponse(res, 500, 'Failed to process forgot password request', error.message);
        }
    }

    // Reset password (placeholder for future implementation)
    async resetPassword(req, res) {
        try {
            // This would typically validate reset token and update password
            // For now, just return a message
            return successResponse(res, 200, 'Password reset successful (feature coming soon)');
        } catch (error) {
            logger.error('Reset password error:', error);
            return errorResponse(res, 500, 'Failed to reset password', error.message);
        }
    }

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
}

module.exports = new AuthController();