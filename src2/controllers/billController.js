const Bill = require('../models/Bill');
const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const Payment = require('../models/Payment');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/response');
const { buildQuery } = require('../utils/query');

class BillController {
    // Create a new bill
    async createBill(req, res) {
        try {
            const { tenant: tenantId } = req.body;

            // Verify tenant belongs to owner's property
            const tenant = await Tenant.findById(tenantId).populate('property');
            if (!tenant) {
                return errorResponse(res, 404, 'Tenant not found');
            }

            const property = await Property.findOne({
                _id: tenant.property._id,
                owner: req.user.userId
            });

            if (!property) {
                return errorResponse(res, 404, 'Property not found or access denied');
            }

            // Check if bill already exists for this period
            const { month, year } = req.body.billingPeriod;
            const existingBill = await Bill.findOne({
                tenant: tenantId,
                'billingPeriod.month': month,
                'billingPeriod.year': year
            });

            if (existingBill) {
                return errorResponse(res, 400, 'Bill already exists for this billing period');
            }

            const billData = {
                ...req.body,
                property: tenant.property._id,
                owner: req.user.userId,
                createdBy: req.user.userId
            };

            const bill = await Bill.create(billData);
            
            // Populate the created bill
            await bill.populate([
                { 
                    path: 'tenant', 
                    select: 'unit leaseDetails',
                    populate: {
                        path: 'user',
                        select: 'firstName lastName email'
                    }
                }
            ]);

            logger.info(`Bill created: ${bill._id}`, { 
                userId: req.user.userId, 
                billId: bill._id,
                tenantId 
            });

            return successResponse(res, 201, 'Bill created successfully', { bill });
        } catch (error) {
            logger.error('Create bill error:', error);
            return errorResponse(res, 500, 'Failed to create bill', error.message);
        }
    }

    // Get all bills for owner's properties
    async getBills(req, res) {
        try {
            const { query, options } = buildQuery(req.query, ['status', 'billingPeriod.month', 'billingPeriod.year']);
            
            // Get owner's property IDs
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');
            
            query.tenant = { $in: tenantIds };

            const bills = await Bill.find(query, null, options)
                .populate({
                    path: 'tenant',
                    select: 'unit',
                    populate: [
                        { path: 'user', select: 'firstName lastName email' },
                        { path: 'property', select: 'name address' }
                    ]
                })
                .lean();

            // Add payment information
            for (let bill of bills) {
                const payments = await Payment.find({ bill: bill._id }).lean();
                bill.payments = payments;
                bill.totalPaid = payments
                    .filter(p => p.status === 'completed')
                    .reduce((sum, p) => sum + p.amount, 0);
                bill.remainingAmount = bill.totalAmount - bill.totalPaid;
            }

            const total = await Bill.countDocuments(query);

            return successResponse(res, 200, 'Bills retrieved successfully', {
                bills,
                pagination: {
                    page: options.skip / options.limit + 1,
                    limit: options.limit,
                    total,
                    pages: Math.ceil(total / options.limit)
                }
            });
        } catch (error) {
            logger.error('Get bills error:', error);
            return errorResponse(res, 500, 'Failed to retrieve bills', error.message);
        }
    }

    // Get a single bill by ID
    async getBillById(req, res) {
        try {
            const { id } = req.params;

            // Get owner's property IDs for security
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');

            const bill = await Bill.findOne({
                _id: id,
                tenant: { $in: tenantIds }
            })
                .populate({
                    path: 'tenant',
                    select: 'unit leaseDetails emergencyContacts',
                    populate: [
                        { path: 'user', select: 'firstName lastName email phone address' },
                        { path: 'property', select: 'name address propertyType' }
                    ]
                })
                .lean();

            if (!bill) {
                return errorResponse(res, 404, 'Bill not found');
            }

            // Get all payments for this bill
            const payments = await Payment.find({ bill: id })
                .sort({ createdAt: -1 })
                .lean();

            bill.payments = payments;
            bill.totalPaid = payments
                .filter(p => p.status === 'completed')
                .reduce((sum, p) => sum + p.amount, 0);
            bill.remainingAmount = bill.totalAmount - bill.totalPaid;

            return successResponse(res, 200, 'Bill retrieved successfully', { bill });
        } catch (error) {
            logger.error('Get bill by ID error:', error);
            return errorResponse(res, 500, 'Failed to retrieve bill', error.message);
        }
    }

    // Update a bill
    async updateBill(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;

            // Get owner's property IDs for security
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');

            // Remove fields that shouldn't be updated
            delete updates.tenant;
            delete updates.createdBy;
            delete updates._id;

            const bill = await Bill.findOneAndUpdate(
                { _id: id, tenant: { $in: tenantIds } },
                { ...updates, updatedBy: req.user.userId },
                { new: true, runValidators: true }
            )
                .populate({
                    path: 'tenant',
                    select: 'unit',
                    populate: [
                        { path: 'user', select: 'firstName lastName email' },
                        { path: 'property', select: 'name address' }
                    ]
                });

            if (!bill) {
                return errorResponse(res, 404, 'Bill not found');
            }

            logger.info(`Bill updated: ${bill._id}`, { 
                userId: req.user.userId, 
                billId: bill._id 
            });

            return successResponse(res, 200, 'Bill updated successfully', { bill });
        } catch (error) {
            logger.error('Update bill error:', error);
            return errorResponse(res, 500, 'Failed to update bill', error.message);
        }
    }

    // Delete a bill
    async deleteBill(req, res) {
        try {
            const { id } = req.params;

            // Get owner's property IDs for security
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');

            // Check if bill has any payments
            const paymentCount = await Payment.countDocuments({ bill: id });
            if (paymentCount > 0) {
                return errorResponse(res, 400, 'Cannot delete bill with existing payments');
            }

            const bill = await Bill.findOneAndDelete({
                _id: id,
                tenant: { $in: tenantIds }
            });

            if (!bill) {
                return errorResponse(res, 404, 'Bill not found');
            }

            logger.info(`Bill deleted: ${bill._id}`, { 
                userId: req.user.userId, 
                billId: bill._id 
            });

            return successResponse(res, 200, 'Bill deleted successfully');
        } catch (error) {
            logger.error('Delete bill error:', error);
            return errorResponse(res, 500, 'Failed to delete bill', error.message);
        }
    }

    // Send bill to tenant (update status to 'sent')
    async sendBill(req, res) {
        try {
            const { id } = req.params;

            // Get owner's property IDs for security
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');

            const bill = await Bill.findOne({
                _id: id,
                tenant: { $in: tenantIds }
            }).populate({
                path: 'tenant',
                populate: { path: 'user', select: 'firstName lastName email' }
            });

            if (!bill) {
                return errorResponse(res, 404, 'Bill not found');
            }

            if (bill.status !== 'draft') {
                return errorResponse(res, 400, 'Only draft bills can be sent');
            }

            bill.status = 'sent';
            bill.sentDate = new Date();
            await bill.save();

            // Here you would typically send an email/SMS notification
            // For now, just log the action

            logger.info(`Bill sent to tenant: ${bill._id}`, { 
                userId: req.user.userId, 
                billId: bill._id,
                tenantEmail: bill.tenant.user.email
            });

            return successResponse(res, 200, 'Bill sent successfully', { bill });
        } catch (error) {
            logger.error('Send bill error:', error);
            return errorResponse(res, 500, 'Failed to send bill', error.message);
        }
    }

    // Get bills summary/statistics
    async getBillsSummary(req, res) {
        try {
            // Get owner's property IDs
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');

            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            // Aggregate statistics
            const [
                totalBills,
                draftBills,
                sentBills,
                paidBills,
                overdueBills,
                monthlyRevenue,
                outstandingAmount,
                averageBillAmount
            ] = await Promise.all([
                Bill.countDocuments({ tenant: { $in: tenantIds } }),
                Bill.countDocuments({ tenant: { $in: tenantIds }, status: 'draft' }),
                Bill.countDocuments({ tenant: { $in: tenantIds }, status: 'sent' }),
                Bill.countDocuments({ tenant: { $in: tenantIds }, status: 'paid' }),
                Bill.countDocuments({ tenant: { $in: tenantIds }, status: 'overdue' }),
                Bill.aggregate([
                    {
                        $match: {
                            tenant: { $in: tenantIds },
                            'billingPeriod.month': currentMonth,
                            'billingPeriod.year': currentYear,
                            status: 'paid'
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: '$totalAmount' }
                        }
                    }
                ]),
                Bill.aggregate([
                    {
                        $match: {
                            tenant: { $in: tenantIds },
                            status: { $in: ['sent', 'partial', 'overdue'] }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: '$totalAmount' }
                        }
                    }
                ]),
                Bill.aggregate([
                    {
                        $match: { tenant: { $in: tenantIds } }
                    },
                    {
                        $group: {
                            _id: null,
                            average: { $avg: '$totalAmount' }
                        }
                    }
                ])
            ]);

            // Get recent bills
            const recentBills = await Bill.find({ tenant: { $in: tenantIds } })
                .populate({
                    path: 'tenant',
                    select: 'unit',
                    populate: [
                        { path: 'user', select: 'firstName lastName' },
                        { path: 'property', select: 'name' }
                    ]
                })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            const summary = {
                counts: {
                    total: totalBills,
                    draft: draftBills,
                    sent: sentBills,
                    paid: paidBills,
                    overdue: overdueBills
                },
                financial: {
                    monthlyRevenue: monthlyRevenue[0]?.total || 0,
                    outstandingAmount: outstandingAmount[0]?.total || 0,
                    averageBillAmount: Math.round(averageBillAmount[0]?.average || 0)
                },
                recentBills
            };

            return successResponse(res, 200, 'Bills summary retrieved successfully', { summary });
        } catch (error) {
            logger.error('Get bills summary error:', error);
            return errorResponse(res, 500, 'Failed to retrieve bills summary', error.message);
        }
    }

    // Generate recurring bills (utility method)
    async generateRecurringBills(req, res) {
        try {
            const { month, year } = req.body;
            
            if (!month || !year) {
                return errorResponse(res, 400, 'Month and year are required');
            }

            // Get owner's active tenants
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            const activeTenants = await Tenant.find({ 
                property: { $in: propertyIds },
                status: 'active'
            }).populate('leaseDetails');

            const generatedBills = [];
            const errors = [];

            for (const tenant of activeTenants) {
                try {
                    // Check if bill already exists
                    const existingBill = await Bill.findOne({
                        tenant: tenant._id,
                        'billingPeriod.month': month,
                        'billingPeriod.year': year
                    });

                    if (existingBill) {
                        continue; // Skip if bill already exists
                    }

                    // Create bill with basic rent charge
                    const dueDate = new Date(year, month - 1, 5); // Due on 5th of the month
                    
                    const billData = {
                        tenant: tenant._id,
                        billingPeriod: { month, year },
                        charges: {
                            rent: tenant.leaseDetails?.monthlyRent || 0
                        },
                        dueDate,
                        createdBy: req.user.userId
                    };

                    const bill = await Bill.create(billData);
                    generatedBills.push(bill);

                } catch (error) {
                    errors.push({
                        tenantId: tenant._id,
                        error: error.message
                    });
                }
            }

            logger.info(`Generated ${generatedBills.length} recurring bills`, { 
                userId: req.user.userId,
                month,
                year,
                count: generatedBills.length
            });

            return successResponse(res, 200, 'Recurring bills generated successfully', {
                generated: generatedBills.length,
                errors: errors.length,
                bills: generatedBills,
                errorDetails: errors
            });
        } catch (error) {
            logger.error('Generate recurring bills error:', error);
            return errorResponse(res, 500, 'Failed to generate recurring bills', error.message);
        }
    }

    // Get tenant bills (for tenant users)
    async getTenantBills(req, res) {
        try {
            const { query, options } = buildQuery(req.query, ['status']);

            // Find tenant record for the current user
            const tenant = await Tenant.findOne({ 
                user: req.user.userId,
                status: 'active' 
            });

            if (!tenant) {
                return errorResponse(res, 404, 'Active tenancy not found');
            }

            query.tenant = tenant._id;

            const bills = await Bill.find(query, null, options)
                .populate('tenant', 'unit property')
                .lean();

            // Add payment information for each bill
            for (let bill of bills) {
                const payments = await Payment.find({ bill: bill._id }).lean();
                bill.payments = payments;
                bill.totalPaid = payments
                    .filter(p => p.status === 'completed')
                    .reduce((sum, p) => sum + p.amount, 0);
                bill.remainingAmount = bill.totalAmount - bill.totalPaid;
            }

            const total = await Bill.countDocuments(query);

            return successResponse(res, 200, 'Bills retrieved successfully', {
                bills,
                pagination: {
                    page: options.skip / options.limit + 1,
                    limit: options.limit,
                    total,
                    pages: Math.ceil(total / options.limit)
                }
            });
        } catch (error) {
            logger.error('Get tenant bills error:', error);
            return errorResponse(res, 500, 'Failed to retrieve bills', error.message);
        }
    }
}

module.exports = new BillController();