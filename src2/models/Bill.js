const mongoose = require('mongoose');
const { Schema } = mongoose;

const billSchema = new Schema({
    tenant: {
        type: Schema.Types.ObjectId,
        ref: 'Tenant',
        required: [true, 'Tenant reference is required']
    },
    property: {
        type: Schema.Types.ObjectId,
        ref: 'Property',
        required: [true, 'Property reference is required']
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Owner reference is required']
    },
    billingPeriod: {
        month: {
            type: Number,
            required: [true, 'Billing month is required'],
            min: [1, 'Month must be between 1-12'],
            max: [12, 'Month must be between 1-12']
        },
        year: {
            type: Number,
            required: [true, 'Billing year is required'],
            min: [2000, 'Year must be 2000 or later']
        }
    },
    charges: {
        rent: {
            type: Number,
            required: [true, 'Rent amount is required'],
            min: [0, 'Rent must be positive']
        },
        utilities: {
            water: {
                type: Number,
                default: 0,
                min: [0, 'Water bill must be positive']
            },
            electricity: {
                type: Number,
                default: 0,
                min: [0, 'Electricity bill must be positive']
            },
            gas: {
                type: Number,
                default: 0,
                min: [0, 'Gas bill must be positive']
            },
            internet: {
                type: Number,
                default: 0,
                min: [0, 'Internet bill must be positive']
            },
            trash: {
                type: Number,
                default: 0,
                min: [0, 'Trash bill must be positive']
            },
            other: {
                amount: {
                    type: Number,
                    default: 0,
                    min: [0, 'Other utility amount must be positive']
                },
                description: {
                    type: String,
                    trim: true
                }
            }
        },
        maintenance: {
            type: Number,
            default: 0,
            min: [0, 'Maintenance charge must be positive']
        },
        parking: {
            type: Number,
            default: 0,
            min: [0, 'Parking charge must be positive']
        },
        petFee: {
            type: Number,
            default: 0,
            min: [0, 'Pet fee must be positive']
        },
        lateFee: {
            type: Number,
            default: 0,
            min: [0, 'Late fee must be positive']
        },
        additionalCharges: [{
            description: {
                type: String,
                required: true,
                trim: true
            },
            amount: {
                type: Number,
                required: true,
                min: [0, 'Additional charge amount must be positive']
            }
        }]
    },
    credits: {
        securityDepositRefund: {
            type: Number,
            default: 0,
            min: [0, 'Security deposit refund must be positive']
        },
        prorationCredit: {
            type: Number,
            default: 0,
            min: [0, 'Proration credit must be positive']
        },
        otherCredits: [{
            description: {
                type: String,
                required: true,
                trim: true
            },
            amount: {
                type: Number,
                required: true,
                min: [0, 'Credit amount must be positive']
            }
        }]
    },
    previousBalance: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled'],
        default: 'draft'
    },
    dueDate: {
        type: Date,
        required: [true, 'Due date is required']
    },
    paidDate: {
        type: Date
    },
    paidAmount: {
        type: Number,
        default: 0,
        min: [0, 'Paid amount must be positive']
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'check', 'bank_transfer', 'online', 'other'],
        default: 'online'
    },
    notes: {
        type: String,
        maxlength: [500, 'Notes cannot exceed 500 characters']
    },
    attachments: [{
        name: String,
        url: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    reminders: [{
        sentAt: {
            type: Date,
            default: Date.now
        },
        type: {
            type: String,
            enum: ['initial', 'reminder', 'final_notice'],
            required: true
        },
        method: {
            type: String,
            enum: ['email', 'sms', 'phone', 'letter'],
            required: true
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
billSchema.index({ tenant: 1 });
billSchema.index({ property: 1 });
billSchema.index({ owner: 1 });
billSchema.index({ status: 1 });
billSchema.index({ dueDate: 1 });
billSchema.index({ 'billingPeriod.year': 1, 'billingPeriod.month': 1 });
billSchema.index({ createdAt: -1 });

// Compound indexes
billSchema.index({ tenant: 1, 'billingPeriod.year': 1, 'billingPeriod.month': 1 }, { unique: true });
billSchema.index({ owner: 1, status: 1, dueDate: 1 });

// Virtual for total charges
billSchema.virtual('totalCharges').get(function() {
    let total = this.charges.rent + this.charges.maintenance + this.charges.parking + this.charges.petFee + this.charges.lateFee;
    
    // Add utilities
    const utilities = this.charges.utilities;
    total += utilities.water + utilities.electricity + utilities.gas + utilities.internet + utilities.trash + utilities.other.amount;
    
    // Add additional charges
    if (this.charges.additionalCharges && this.charges.additionalCharges.length > 0) {
        total += this.charges.additionalCharges.reduce((sum, charge) => sum + charge.amount, 0);
    }
    
    return total;
});

// Virtual for total credits
billSchema.virtual('totalCredits').get(function() {
    let total = this.credits.securityDepositRefund + this.credits.prorationCredit;
    
    // Add other credits
    if (this.credits.otherCredits && this.credits.otherCredits.length > 0) {
        total += this.credits.otherCredits.reduce((sum, credit) => sum + credit.amount, 0);
    }
    
    return total;
});

// Virtual for net amount (total charges - total credits + previous balance)
billSchema.virtual('netAmount').get(function() {
    return this.totalCharges - this.totalCredits + this.previousBalance;
});

// Virtual for remaining balance
billSchema.virtual('remainingBalance').get(function() {
    return Math.max(0, this.netAmount - this.paidAmount);
});

// Virtual for overdue status
billSchema.virtual('isOverdue').get(function() {
    return this.status !== 'paid' && this.status !== 'cancelled' && new Date() > this.dueDate;
});

// Virtual for days overdue
billSchema.virtual('daysOverdue').get(function() {
    if (!this.isOverdue) return 0;
    
    const today = new Date();
    const diffTime = today - this.dueDate;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for billing period string
billSchema.virtual('billingPeriodString').get(function() {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${months[this.billingPeriod.month - 1]} ${this.billingPeriod.year}`;
});

// Pre-save middleware
billSchema.pre('save', function(next) {
    // Update status based on payment
    if (this.paidAmount >= this.netAmount && this.netAmount > 0) {
        this.status = 'paid';
        if (!this.paidDate) {
            this.paidDate = new Date();
        }
    } else if (this.paidAmount > 0 && this.paidAmount < this.netAmount) {
        this.status = 'partial';
    } else if (this.isOverdue && this.status !== 'paid' && this.status !== 'cancelled') {
        this.status = 'overdue';
    }
    
    // Validate due date is not in the past for new bills
    if (this.isNew && this.dueDate < new Date()) {
        return next(new Error('Due date cannot be in the past'));
    }
    
    next();
});

// Static method to find bills by owner
billSchema.statics.findByOwner = function(ownerId, filters = {}) {
    return this.find({ owner: ownerId, ...filters })
        .populate('tenant', 'user unit')
        .populate({
            path: 'tenant',
            populate: {
                path: 'user',
                select: 'firstName lastName email'
            }
        })
        .populate('property', 'name address')
        .sort('-createdAt');
};

// Static method to find overdue bills
billSchema.statics.findOverdue = function(ownerId = null) {
    const filter = {
        status: { $in: ['sent', 'partial'] },
        dueDate: { $lt: new Date() }
    };
    
    if (ownerId) {
        filter.owner = ownerId;
    }
    
    return this.find(filter)
        .populate('tenant', 'user unit')
        .populate({
            path: 'tenant',
            populate: {
                path: 'user',
                select: 'firstName lastName email phone'
            }
        })
        .populate('property', 'name')
        .sort('dueDate');
};

// Static method to get revenue summary
billSchema.statics.getRevenueSummary = function(ownerId, startDate, endDate) {
    return this.aggregate([
        {
            $match: {
                owner: mongoose.Types.ObjectId(ownerId),
                createdAt: {
                    $gte: startDate,
                    $lte: endDate
                }
            }
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalAmount: { $sum: '$netAmount' },
                totalPaid: { $sum: '$paidAmount' }
            }
        }
    ]);
};

const Bill = mongoose.model('Bill', billSchema);

module.exports = Bill;