const mongoose = require('mongoose');
const { Schema } = mongoose;

const paymentSchema = new Schema({
    bill: {
        type: Schema.Types.ObjectId,
        ref: 'Bill',
        required: [true, 'Bill reference is required']
    },
    tenant: {
        type: Schema.Types.ObjectId,
        ref: 'Tenant',
        required: [true, 'Tenant reference is required']
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Owner reference is required']
    },
    amount: {
        type: Number,
        required: [true, 'Payment amount is required'],
        min: [0.01, 'Payment amount must be greater than 0']
    },
    paymentDate: {
        type: Date,
        required: [true, 'Payment date is required'],
        default: Date.now
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'check', 'bank_transfer', 'credit_card', 'debit_card', 'online', 'other'],
        required: [true, 'Payment method is required']
    },
    transactionId: {
        type: String,
    },
    checkNumber: {
        type: String,
        sparse: true
    },
    bankDetails: {
        bankName: String,
        accountNumber: String, // Store only last 4 digits for security
        routingNumber: String
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
        default: 'completed'
    },
    notes: {
        type: String,
        maxlength: [500, 'Notes cannot exceed 500 characters']
    },
    receipt: {
        url: String,
        uploadedAt: Date
    },
    refund: {
        amount: {
            type: Number,
            default: 0,
            min: [0, 'Refund amount must be positive']
        },
        reason: String,
        refundedAt: Date,
        refundedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        }
    },
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
paymentSchema.index({ bill: 1 });
paymentSchema.index({ tenant: 1 });
paymentSchema.index({ owner: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ createdAt: -1 });

// Compound indexes
paymentSchema.index({ owner: 1, paymentDate: -1 });
paymentSchema.index({ tenant: 1, paymentDate: -1 });

// Virtual for net payment amount (amount - refund)
paymentSchema.virtual('netAmount').get(function() {
    return this.amount - (this.refund?.amount || 0);
});

// Virtual for payment type based on method
paymentSchema.virtual('paymentType').get(function() {
    const electronicMethods = ['bank_transfer', 'credit_card', 'debit_card', 'online'];
    return electronicMethods.includes(this.paymentMethod) ? 'electronic' : 'manual';
});

// Pre-save middleware
paymentSchema.pre('save', function(next) {
    // Validate refund amount doesn't exceed payment amount
    if (this.refund?.amount > this.amount) {
        return next(new Error('Refund amount cannot exceed payment amount'));
    }
    
    // Auto-generate transaction ID for electronic payments if not provided
    if (this.paymentType === 'electronic' && !this.transactionId && this.isNew) {
        this.transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    next();
});

// Static method to find payments by owner
paymentSchema.statics.findByOwner = function(ownerId, filters = {}) {
    return this.find({ owner: ownerId, ...filters })
        .populate('tenant', 'user unit')
        .populate({
            path: 'tenant',
            populate: {
                path: 'user',
                select: 'firstName lastName email'
            }
        })
        .populate('bill', 'billingPeriod netAmount')
        .sort('-paymentDate');
};

// Static method to find payments by tenant
paymentSchema.statics.findByTenant = function(tenantId, filters = {}) {
    return this.find({ tenant: tenantId, ...filters })
        .populate('bill', 'billingPeriod netAmount dueDate')
        .sort('-paymentDate');
};

// Static method to get payment summary
paymentSchema.statics.getPaymentSummary = function(ownerId, startDate, endDate) {
    return this.aggregate([
        {
            $match: {
                owner: mongoose.Types.ObjectId(ownerId),
                paymentDate: {
                    $gte: startDate,
                    $lte: endDate
                },
                status: 'completed'
            }
        },
        {
            $group: {
                _id: '$paymentMethod',
                count: { $sum: 1 },
                totalAmount: { $sum: '$amount' },
                totalRefunded: { $sum: '$refund.amount' }
            }
        },
        {
            $addFields: {
                netAmount: { $subtract: ['$totalAmount', '$totalRefunded'] }
            }
        }
    ]);
};

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;