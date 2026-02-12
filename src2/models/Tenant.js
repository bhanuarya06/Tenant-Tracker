const mongoose = require('mongoose');
const { Schema } = mongoose;

const tenantSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User reference is required']
    },
    property: {
        type: Schema.Types.ObjectId,
        ref: 'Property',
        required: [true, 'Property reference is required']
    },
    unit: {
        type: String,
        required: [true, 'Unit number is required'],
        trim: true
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Owner reference is required']
    },
    leaseDetails: {
        startDate: {
            type: Date,
            required: [true, 'Lease start date is required']
        },
        endDate: {
            type: Date,
            required: [true, 'Lease end date is required']
        },
        monthlyRent: {
            type: Number,
            required: [true, 'Monthly rent is required'],
            min: [0, 'Monthly rent must be positive']
        },
        securityDeposit: {
            type: Number,
            default: 0,
            min: [0, 'Security deposit must be positive']
        },
        leaseType: {
            type: String,
            enum: ['fixed', 'month-to-month', 'yearly'],
            default: 'fixed'
        }
    },
    occupants: [{
        name: {
            type: String,
            required: true,
            trim: true
        },
        relationship: {
            type: String,
            enum: ['spouse', 'child', 'parent', 'sibling', 'friend', 'other'],
            default: 'other'
        },
        dateOfBirth: Date,
        phone: String
    }],
    emergencyContacts: [{
        name: {
            type: String,
            required: true,
            trim: true
        },
        relationship: {
            type: String,
            required: true
        },
        phone: {
            type: String,
            required: true
        },
        email: String,
        isPrimary: {
            type: Boolean,
            default: false
        }
    }],
    balance: {
        type: Number,
        default: 0
    },
    preferences: {
        notifications: {
            email: {
                type: Boolean,
                default: true
            },
            sms: {
                type: Boolean,
                default: false
            },
            push: {
                type: Boolean,
                default: true
            }
        },
        paymentMethod: {
            type: String,
            enum: ['cash', 'check', 'bank_transfer', 'online', 'other'],
            default: 'online'
        }
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'terminated', 'pending'],
        default: 'active'
    },
    notes: [{
        content: {
            type: String,
            required: true
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        isPrivate: {
            type: Boolean,
            default: false
        }
    }],
    documents: [{
        name: {
            type: String,
            required: true
        },
        url: {
            type: String,
            required: true
        },
        type: {
            type: String,
            enum: ['lease', 'id', 'employment', 'income', 'reference', 'other'],
            default: 'other'
        },
        uploadedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
tenantSchema.index({ user: 1 });
tenantSchema.index({ property: 1 });
tenantSchema.index({ owner: 1 });
tenantSchema.index({ unit: 1 });
tenantSchema.index({ status: 1 });
tenantSchema.index({ 'leaseDetails.startDate': 1 });
tenantSchema.index({ 'leaseDetails.endDate': 1 });
tenantSchema.index({ createdAt: -1 });

// Compound indexes
tenantSchema.index({ property: 1, unit: 1 }, { unique: true });
tenantSchema.index({ owner: 1, status: 1 });

// Virtual for lease duration in months
tenantSchema.virtual('leaseDuration').get(function() {
    if (!this.leaseDetails.startDate || !this.leaseDetails.endDate) return 0;
    
    const start = new Date(this.leaseDetails.startDate);
    const end = new Date(this.leaseDetails.endDate);
    const monthDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    
    return monthDiff;
});

// Virtual for remaining lease days
tenantSchema.virtual('remainingLeaseDays').get(function() {
    if (!this.leaseDetails.endDate) return 0;
    
    const today = new Date();
    const endDate = new Date(this.leaseDetails.endDate);
    const diffTime = endDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays : 0;
});

// Virtual for lease status
tenantSchema.virtual('leaseStatus').get(function() {
    const today = new Date();
    const startDate = new Date(this.leaseDetails.startDate);
    const endDate = new Date(this.leaseDetails.endDate);
    
    if (today < startDate) return 'upcoming';
    if (today > endDate) return 'expired';
    
    // Check if lease is expiring within 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    if (endDate <= thirtyDaysFromNow) return 'expiring';
    
    return 'active';
});

// Virtual for total occupants
tenantSchema.virtual('totalOccupants').get(function() {
    return (this.occupants?.length || 0) + 1; // +1 for the tenant
});

// Pre-save validation
tenantSchema.pre('save', function(next) {
    // Validate lease dates
    if (this.leaseDetails.endDate <= this.leaseDetails.startDate) {
        return next(new Error('Lease end date must be after start date'));
    }
    
    // Ensure only one primary emergency contact
    if (this.emergencyContacts && this.emergencyContacts.length > 0) {
        const primaryContacts = this.emergencyContacts.filter(contact => contact.isPrimary);
        if (primaryContacts.length > 1) {
            let foundPrimary = false;
            this.emergencyContacts.forEach(contact => {
                if (contact.isPrimary && foundPrimary) {
                    contact.isPrimary = false;
                }
                if (contact.isPrimary && !foundPrimary) {
                    foundPrimary = true;
                }
            });
        }
    }
    
    next();
});

// Static method to find tenants by owner
tenantSchema.statics.findByOwner = function(ownerId, status = null) {
    const filter = { owner: ownerId };
    if (status) {
        filter.status = status;
    }
    return this.find(filter)
        .populate('user', 'firstName lastName email phone')
        .populate('property', 'name address')
        .sort('-createdAt');
};

// Static method to find tenants by property
tenantSchema.statics.findByProperty = function(propertyId, status = null) {
    const filter = { property: propertyId };
    if (status) {
        filter.status = status;
    }
    return this.find(filter)
        .populate('user', 'firstName lastName email phone')
        .sort('unit');
};

// Static method to find expiring leases
tenantSchema.statics.findExpiringLeases = function(days = 30) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    return this.find({
        status: 'active',
        'leaseDetails.endDate': {
            $gte: new Date(),
            $lte: futureDate
        }
    })
    .populate('user', 'firstName lastName email')
    .populate('property', 'name')
    .sort('leaseDetails.endDate');
};

const Tenant = mongoose.model('Tenant', tenantSchema);

module.exports = Tenant;