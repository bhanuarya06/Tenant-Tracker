const Payment = require('../models/Payment');
const Bill = require('../models/Bill');
const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/response');
const { buildQuery } = require('../utils/query');

class PaymentController {
    // Record a new payment
    async createPayment(req, res) {
        try {
            const { bill: billId, amount } = req.body;

            // Verify bill exists and belongs to owner's property
            const bill = await Bill.findById(billId)
                .populate({
                    path: 'tenant',
                    populate: { path: 'property' }
                });

            if (!bill) {
                return errorResponse(res, 404, 'Bill not found');
            }

            // Check if requester is owner or the tenant
            let hasAccess = false;
            if (req.user.role === 'owner') {
                const property = await Property.findOne({
                    _id: bill.tenant.property._id,
                    owner: req.user.userId
                });
                hasAccess = !!property;
            } else if (req.user.role === 'tenant') {
                const tenant = await Tenant.findOne({
                    _id: bill.tenant._id,
                    user: req.user.userId
                });
                hasAccess = !!tenant;
            }

            if (!hasAccess) {
                return errorResponse(res, 403, 'Access denied');
            }

            // Check if payment amount is valid
            const totalPaid = await Payment.aggregate([
                {
                    $match: {
                        bill: bill._id,
                        status: 'completed'
                    }
                },
                {
                    $group: {
                        _id: null,
                        total: { $sum: '$amount' }
                    }
                }
            ]);

            const alreadyPaid = totalPaid[0]?.total || 0;
            const remainingAmount = bill.totalAmount - alreadyPaid;

            if (amount > remainingAmount) {
                return errorResponse(res, 400, `Payment amount exceeds remaining balance of $${remainingAmount}`);
            }

            const paymentData = {
                ...req.body,
                tenant: bill.tenant._id,
                owner: bill.tenant.property.owner,
                createdBy: req.user.userId
            };

            const payment = await Payment.create(paymentData);

            // Update bill status based on payment
            const newTotalPaid = alreadyPaid + amount;
            if (newTotalPaid >= bill.totalAmount) {
                bill.status = 'paid';
                bill.paidDate = new Date();
            } else if (newTotalPaid > 0) {
                bill.status = 'partial';
            }
            await bill.save();

            // Populate the created payment
            await payment.populate([
                {
                    path: 'bill',
                    populate: {
                        path: 'tenant',
                        select: 'unit',
                        populate: {
                            path: 'user',
                            select: 'firstName lastName email'
                        }
                    }
                }
            ]);

            logger.info(`Payment recorded: ${payment._id}`, {
                userId: req.user.userId,
                paymentId: payment._id,
                billId,
                amount
            });

            return successResponse(res, 201, 'Payment recorded successfully', { payment });
        } catch (error) {
            logger.error('Create payment error:', error);
            return errorResponse(res, 500, 'Failed to record payment', error.message);
        }
    }

    // Get all payments for owner's properties
    async getPayments(req, res) {
        try {
            const { query, options } = buildQuery(req.query, ['status', 'paymentMethod']);

            // Get owner's property IDs
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');
            const billIds = await Bill.find({ tenant: { $in: tenantIds } }).distinct('_id');

            query.bill = { $in: billIds };

            const payments = await Payment.find(query, null, options)
                .populate({
                    path: 'bill',
                    select: 'billingPeriod totalAmount status',
                    populate: {
                        path: 'tenant',
                        select: 'unit',
                        populate: [
                            { path: 'user', select: 'firstName lastName email' },
                            { path: 'property', select: 'name address' }
                        ]
                    }
                })
                .lean();

            const total = await Payment.countDocuments(query);

            return successResponse(res, 200, 'Payments retrieved successfully', {
                payments,
                pagination: {
                    page: options.skip / options.limit + 1,
                    limit: options.limit,
                    total,
                    pages: Math.ceil(total / options.limit)
                }
            });
        } catch (error) {
            logger.error('Get payments error:', error);
            return errorResponse(res, 500, 'Failed to retrieve payments', error.message);
        }
    }

    // Get a single payment by ID
    async getPaymentById(req, res) {
        try {
            const { id } = req.params;

            // Security check based on user role
            let accessQuery = {};
            if (req.user.role === 'owner') {
                const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
                const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');
                const billIds = await Bill.find({ tenant: { $in: tenantIds } }).distinct('_id');
                accessQuery = { _id: id, bill: { $in: billIds } };
            } else if (req.user.role === 'tenant') {
                const tenant = await Tenant.findOne({ user: req.user.userId });
                if (!tenant) {
                    return errorResponse(res, 404, 'Tenant profile not found');
                }
                const billIds = await Bill.find({ tenant: tenant._id }).distinct('_id');
                accessQuery = { _id: id, bill: { $in: billIds } };
            }

            const payment = await Payment.findOne(accessQuery)
                .populate({
                    path: 'bill',
                    populate: {
                        path: 'tenant',
                        select: 'unit leaseDetails',
                        populate: [
                            { path: 'user', select: 'firstName lastName email phone' },
                            { path: 'property', select: 'name address' }
                        ]
                    }
                })
                .lean();

            if (!payment) {
                return errorResponse(res, 404, 'Payment not found');
            }

            return successResponse(res, 200, 'Payment retrieved successfully', { payment });
        } catch (error) {
            logger.error('Get payment by ID error:', error);
            return errorResponse(res, 500, 'Failed to retrieve payment', error.message);
        }
    }

    // Update a payment
    async updatePayment(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;

            // Only owners can update payments
            if (req.user.role !== 'owner') {
                return errorResponse(res, 403, 'Only property owners can update payments');
            }

            // Get owner's accessible payment IDs
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');
            const billIds = await Bill.find({ tenant: { $in: tenantIds } }).distinct('_id');

            // Remove fields that shouldn't be updated
            delete updates.bill;
            delete updates.tenant;
            delete updates.owner;
            delete updates.createdBy;
            delete updates._id;

            // Add updatedBy field for audit trail
            updates.updatedBy = req.user.userId;

            const payment = await Payment.findOneAndUpdate(
                { _id: id, bill: { $in: billIds } },
                updates,
                { new: true, runValidators: true }
            )
                .populate({
                    path: 'bill',
                    populate: {
                        path: 'tenant',
                        select: 'unit',
                        populate: {
                            path: 'user',
                            select: 'firstName lastName email'
                        }
                    }
                });

            if (!payment) {
                return errorResponse(res, 404, 'Payment not found');
            }

            // If payment status changed, update bill status accordingly
            if (updates.status && payment.bill) {
                const allPayments = await Payment.find({ 
                    bill: payment.bill._id,
                    status: 'completed'
                });

                const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
                const bill = await Bill.findById(payment.bill._id);

                if (totalPaid >= bill.totalAmount) {
                    bill.status = 'paid';
                    bill.paidDate = new Date();
                } else if (totalPaid > 0) {
                    bill.status = 'partial';
                } else {
                    bill.status = 'sent';
                    bill.paidDate = undefined;
                }
                await bill.save();
            }

            logger.info(`Payment updated: ${payment._id}`, {
                userId: req.user.userId,
                paymentId: payment._id
            });

            return successResponse(res, 200, 'Payment updated successfully', { payment });
        } catch (error) {
            logger.error('Update payment error:', error);
            return errorResponse(res, 500, 'Failed to update payment', error.message);
        }
    }

    // Delete a payment
    async deletePayment(req, res) {
        try {
            const { id } = req.params;

            // Only owners can delete payments
            if (req.user.role !== 'owner') {
                return errorResponse(res, 403, 'Only property owners can delete payments');
            }

            // Get owner's accessible payment IDs
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');
            const billIds = await Bill.find({ tenant: { $in: tenantIds } }).distinct('_id');

            const payment = await Payment.findOne({ _id: id, bill: { $in: billIds } })
                .populate('bill');

            if (!payment) {
                return errorResponse(res, 404, 'Payment not found');
            }

            // Only allow deletion of pending or failed payments
            if (payment.status === 'completed') {
                return errorResponse(res, 400, 'Cannot delete completed payments');
            }

            await Payment.findByIdAndDelete(id);

            logger.info(`Payment deleted: ${id}`, {
                userId: req.user.userId,
                paymentId: id
            });

            return successResponse(res, 200, 'Payment deleted successfully');
        } catch (error) {
            logger.error('Delete payment error:', error);
            return errorResponse(res, 500, 'Failed to delete payment', error.message);
        }
    }

    // Process refund
    async processRefund(req, res) {
        try {
            const { id } = req.params;
            const { amount, reason } = req.body;

            // Only owners can process refunds
            if (req.user.role !== 'owner') {
                return errorResponse(res, 403, 'Only property owners can process refunds');
            }

            // Get owner's accessible payment IDs
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');
            const billIds = await Bill.find({ tenant: { $in: tenantIds } }).distinct('_id');

            const payment = await Payment.findOne({ _id: id, bill: { $in: billIds } });

            if (!payment) {
                return errorResponse(res, 404, 'Payment not found');
            }

            if (payment.status !== 'completed') {
                return errorResponse(res, 400, 'Can only refund completed payments');
            }

            if (amount > payment.amount) {
                return errorResponse(res, 400, 'Refund amount cannot exceed payment amount');
            }

            // Check if already refunded
            if (payment.refund && payment.refund.amount > 0) {
                return errorResponse(res, 400, 'Payment has already been refunded');
            }

            // Process refund
            payment.refund = {
                amount,
                reason: reason || 'Refund processed by owner',
                processedDate: new Date(),
                processedBy: req.user.userId
            };

            if (amount === payment.amount) {
                payment.status = 'refunded';
            }

            await payment.save();

            // Update bill status if necessary
            const bill = await Bill.findById(payment.bill);
            const allPayments = await Payment.find({ 
                bill: payment.bill,
                status: 'completed'
            });

            const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);

            if (totalPaid >= bill.totalAmount) {
                bill.status = 'paid';
            } else if (totalPaid > 0) {
                bill.status = 'partial';
            } else {
                bill.status = 'sent';
                bill.paidDate = undefined;
            }
            await bill.save();

            logger.info(`Refund processed: ${payment._id}`, {
                userId: req.user.userId,
                paymentId: payment._id,
                refundAmount: amount
            });

            return successResponse(res, 200, 'Refund processed successfully', { payment });
        } catch (error) {
            logger.error('Process refund error:', error);
            return errorResponse(res, 500, 'Failed to process refund', error.message);
        }
    }

    // Get payment statistics
    async getPaymentStats(req, res) {
        try {
            // Get owner's property IDs
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');
            const billIds = await Bill.find({ tenant: { $in: tenantIds } }).distinct('_id');

            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            // Aggregate statistics
            const [
                totalPayments,
                completedPayments,
                pendingPayments,
                failedPayments,
                totalAmount,
                monthlyCollection,
                averagePayment
            ] = await Promise.all([
                Payment.countDocuments({ bill: { $in: billIds } }),
                Payment.countDocuments({ bill: { $in: billIds }, status: 'completed' }),
                Payment.countDocuments({ bill: { $in: billIds }, status: 'pending' }),
                Payment.countDocuments({ bill: { $in: billIds }, status: 'failed' }),
                Payment.aggregate([
                    {
                        $match: {
                            bill: { $in: billIds },
                            status: 'completed'
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: '$amount' }
                        }
                    }
                ]),
                Payment.aggregate([
                    {
                        $match: {
                            bill: { $in: billIds },
                            status: 'completed',
                            paymentDate: {
                                $gte: new Date(currentYear, currentMonth - 1, 1),
                                $lt: new Date(currentYear, currentMonth, 1)
                            }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: '$amount' }
                        }
                    }
                ]),
                Payment.aggregate([
                    {
                        $match: {
                            bill: { $in: billIds },
                            status: 'completed'
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            average: { $avg: '$amount' }
                        }
                    }
                ])
            ]);

            // Payment methods breakdown
            const paymentMethods = await Payment.aggregate([
                {
                    $match: {
                        bill: { $in: billIds },
                        status: 'completed'
                    }
                },
                {
                    $group: {
                        _id: '$paymentMethod',
                        count: { $sum: 1 },
                        total: { $sum: '$amount' }
                    }
                }
            ]);

            // Recent payments
            const recentPayments = await Payment.find({ bill: { $in: billIds } })
                .populate({
                    path: 'bill',
                    select: 'billingPeriod',
                    populate: {
                        path: 'tenant',
                        select: 'unit',
                        populate: [
                            { path: 'user', select: 'firstName lastName' },
                            { path: 'property', select: 'name' }
                        ]
                    }
                })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            const stats = {
                counts: {
                    total: totalPayments,
                    completed: completedPayments,
                    pending: pendingPayments,
                    failed: failedPayments
                },
                financial: {
                    totalAmount: totalAmount[0]?.total || 0,
                    monthlyCollection: monthlyCollection[0]?.total || 0,
                    averagePayment: Math.round(averagePayment[0]?.average || 0)
                },
                paymentMethods,
                recentPayments
            };

            return successResponse(res, 200, 'Payment statistics retrieved successfully', { stats });
        } catch (error) {
            logger.error('Get payment stats error:', error);
            return errorResponse(res, 500, 'Failed to retrieve payment statistics', error.message);
        }
    }

    // Get tenant payments (for tenant users)
    async getTenantPayments(req, res) {
        try {
            const { query, options } = buildQuery(req.query, ['status', 'paymentMethod']);

            // Find tenant record for the current user
            const tenant = await Tenant.findOne({
                user: req.user.userId,
                status: 'active'
            });

            if (!tenant) {
                return errorResponse(res, 404, 'Active tenancy not found');
            }

            const billIds = await Bill.find({ tenant: tenant._id }).distinct('_id');
            query.bill = { $in: billIds };

            const payments = await Payment.find(query, null, options)
                .populate({
                    path: 'bill',
                    select: 'billingPeriod totalAmount status dueDate'
                })
                .lean();

            const total = await Payment.countDocuments(query);

            return successResponse(res, 200, 'Payments retrieved successfully', {
                payments,
                pagination: {
                    page: options.skip / options.limit + 1,
                    limit: options.limit,
                    total,
                    pages: Math.ceil(total / options.limit)
                }
            });
        } catch (error) {
            logger.error('Get tenant payments error:', error);
            return errorResponse(res, 500, 'Failed to retrieve payments', error.message);
        }
    }
}

module.exports = new PaymentController();