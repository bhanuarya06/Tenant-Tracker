const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const validator = require('validator');
const config = require('../config/config');

const { Schema } = mongoose;

const userSchema = new Schema({
    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true,
        minlength: [2, 'First name must be at least 2 characters'],
        maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
        type: String,
        trim: true,
        maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        validate: [validator.isEmail, 'Please provide a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters'],
        select: false // Don't include password in queries by default
    },
    role: {
        type: String,
        enum: ['owner', 'tenant', 'admin'],
        default: 'owner',
        required: true
    },
    phone: {
        type: String,
        validate: {
            validator: function(v) {
                return !v || validator.isMobilePhone(v);
            },
            message: 'Please provide a valid phone number'
        }
    },
    avatar: {
        type: String,
        default: null
    },
    dateOfBirth: {
        type: Date,
        validate: {
            validator: function(v) {
                return !v || v < new Date();
            },
            message: 'Date of birth cannot be in the future'
        }
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other'],
    },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },
    bio: {
        type: String,
        maxlength: [500, 'Bio cannot exceed 500 characters']
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: {
        type: String,
        select: false
    },
    passwordResetToken: {
        type: String,
        select: false
    },
    passwordResetExpires: {
        type: Date,
        select: false
    },
    lastLoginAt: {
        type: Date
    },
    loginAttempts: {
        type: Number,
        default: 0,
        select: false
    },
    lockUntil: {
        type: Date,
        select: false
    }
}, {
    timestamps: true,
    toJSON: { 
        virtuals: true,
        transform: function(doc, ret) {
            delete ret.password;
            delete ret.passwordResetToken;
            delete ret.passwordResetExpires;
            delete ret.emailVerificationToken;
            delete ret.loginAttempts;
            delete ret.lockUntil;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

// Indexes
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName || ''}`.trim();
});

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware for password hashing
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        this.password = await bcrypt.hash(this.password, config.BCRYPT_ROUNDS);
        next();
    } catch (error) {
        next(error);
    }
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to increment login attempts
userSchema.methods.incLoginAttempts = async function() {
    // If we have a previous lock that has expired, restart at 1
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $unset: { lockUntil: 1 },
            $set: { loginAttempts: 1 }
        });
    }
    
    const updates = { $inc: { loginAttempts: 1 } };
    
    // Lock account after 5 failed attempts for 2 hours
    if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
        updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
    }
    
    return this.updateOne(updates);
};

// Instance method to reset login attempts
userSchema.methods.resetLoginAttempts = async function() {
    return this.updateOne({
        $unset: { loginAttempts: 1, lockUntil: 1 }
    });
};

// Static method to find by email (including inactive users)
userSchema.statics.findByEmail = function(email) {
    return this.findOne({ email: email.toLowerCase() }).select('+password');
};

// Static method to find active users only
userSchema.statics.findActive = function(filter = {}) {
    return this.find({ ...filter, isActive: true });
};

const User = mongoose.model('User', userSchema);

module.exports = User;