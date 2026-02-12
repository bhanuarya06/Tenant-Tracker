const express = require('express');
const { auth } = require('../middleware/auth');

// Import route modules
const authRoutes = require('./auth');
const propertyRoutes = require('./properties');
const tenantRoutes = require('./tenants');
const billRoutes = require('./bills');
const paymentRoutes = require('./payments');

// Import controllers for dashboard
const Property = require('../models/Property');
const Tenant = require('../models/Tenant');
const Bill = require('../models/Bill');
const Payment = require('../models/Payment');
const { successResponse, errorResponse } = require('../utils/response');
const logger = require('../utils/logger');

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'TenantTracker API',
        version: '2.0.0'
    });
});

// Authentication routes (public)
router.use('/auth', authRoutes);

// Protected routes
router.use('/properties', propertyRoutes);
router.use('/tenants', tenantRoutes);
router.use('/bills', billRoutes);
router.use('/payments', paymentRoutes);

// Dashboard endpoint
router.get('/dashboard', auth, async (req, res) => {
    try {
        const userId = req.user.userId;
        const userRole = req.user.role;

        if (userRole === 'owner') {
            // Owner dashboard
            const [
                totalProperties,
                totalTenants,
                activeTenants,
                totalRevenue,
                monthlyRevenue,
                outstandingAmount,
                overdueBills
            ] = await Promise.all([
                Property.countDocuments({ owner: userId }),
                Tenant.countDocuments({ 
                    property: { 
                        $in: await Property.find({ owner: userId }).distinct('_id') 
                    } 
                }),
                Tenant.countDocuments({ 
                    property: { 
                        $in: await Property.find({ owner: userId }).distinct('_id') 
                    },
                    status: 'active'
                }),
                // Total revenue calculation
                (async () => {
                    const propertyIds = await Property.find({ owner: userId }).distinct('_id');
                    const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');
                    const result = await Payment.aggregate([
                        {
                            $lookup: {
                                from: 'bills',
                                localField: 'bill',
                                foreignField: '_id',
                                as: 'billData'
                            }
                        },
                        {
                            $match: {
                                'billData.tenant': { $in: tenantIds },
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
                    return result[0]?.total || 0;
                })(),
                // Monthly revenue (current month)
                (async () => {
                    const currentDate = new Date();
                    const currentMonth = currentDate.getMonth() + 1;
                    const currentYear = currentDate.getFullYear();
                    const propertyIds = await Property.find({ owner: userId }).distinct('_id');
                    const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');
                    
                    const result = await Payment.aggregate([
                        {
                            $lookup: {
                                from: 'bills',
                                localField: 'bill',
                                foreignField: '_id',
                                as: 'billData'
                            }
                        },
                        {
                            $match: {
                                'billData.tenant': { $in: tenantIds },
                                'billData.billingPeriod.month': currentMonth,
                                'billData.billingPeriod.year': currentYear,
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
                    return result[0]?.total || 0;
                })(),
                // Outstanding amount
                (async () => {
                    const propertyIds = await Property.find({ owner: userId }).distinct('_id');
                    const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');
                    const result = await Bill.aggregate([
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
                    ]);
                    return result[0]?.total || 0;
                })(),
                // Overdue bills count
                (async () => {
                    const propertyIds = await Property.find({ owner: userId }).distinct('_id');
                    const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');
                    return await Bill.countDocuments({
                        tenant: { $in: tenantIds },
                        status: 'overdue'
                    });
                })()
            ]);

            // Recent activities
            const propertyIds = await Property.find({ owner: userId }).distinct('_id');
            const tenantIds = await Tenant.find({ property: { $in: propertyIds } }).distinct('_id');

            const [recentTenants, recentBills, recentPayments] = await Promise.all([
                Tenant.find({ property: { $in: propertyIds } })
                    .populate('user', 'firstName lastName')
                    .populate('property', 'name')
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean(),
                Bill.find({ tenant: { $in: tenantIds } })
                    .populate({
                        path: 'tenant',
                        select: 'unit',
                        populate: [
                            { path: 'user', select: 'firstName lastName' },
                            { path: 'property', select: 'name' }
                        ]
                    })
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean(),
                Payment.find()
                    .populate({
                        path: 'bill',
                        match: { tenant: { $in: tenantIds } },
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
                    .limit(5)
                    .lean()
            ]);

            const dashboard = {
                summary: {
                    totalProperties,
                    totalTenants,
                    activeTenants,
                    vacancyRate: totalTenants > 0 ? Math.round(((totalTenants - activeTenants) / totalTenants) * 100) : 0
                },
                financial: {
                    totalRevenue,
                    monthlyRevenue,
                    outstandingAmount,
                    collectionRate: totalRevenue > 0 ? Math.round((totalRevenue / (totalRevenue + outstandingAmount)) * 100) : 0
                },
                alerts: {
                    overdueBills,
                    expiringLeases: await Tenant.countDocuments({
                        property: { $in: propertyIds },
                        status: 'active',
                        'leaseDetails.endDate': {
                            $gte: new Date(),
                            $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
                        }
                    })
                },
                recentActivity: {
                    tenants: recentTenants,
                    bills: recentBills,
                    payments: recentPayments.filter(p => p.bill) // Filter out payments where bill population failed
                }
            };

            return successResponse(res, 200, 'Owner dashboard retrieved successfully', { dashboard });

        } else if (userRole === 'tenant') {
            // Tenant dashboard
            const tenant = await Tenant.findOne({ user: userId, status: 'active' })
                .populate('property', 'name address amenities')
                .lean();

            if (!tenant) {
                return errorResponse(res, 404, 'Active tenancy not found');
            }

            const [recentBills, upcomingBills, paymentHistory] = await Promise.all([
                Bill.find({ tenant: tenant._id })
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean(),
                Bill.find({ 
                    tenant: tenant._id,
                    status: { $in: ['sent', 'partial'] },
                    dueDate: { $gte: new Date() }
                })
                    .sort({ dueDate: 1 })
                    .limit(3)
                    .lean(),
                Payment.find()
                    .populate({
                        path: 'bill',
                        match: { tenant: tenant._id },
                        select: 'billingPeriod totalAmount'
                    })
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean()
            ]);

            // Calculate financial summary
            const outstandingAmount = recentBills
                .filter(bill => ['sent', 'partial', 'overdue'].includes(bill.status))
                .reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);

            const nextPaymentDue = upcomingBills.length > 0 ? upcomingBills[0].dueDate : null;

            const dashboard = {
                tenant,
                financial: {
                    monthlyRent: tenant.leaseDetails?.monthlyRent || 0,
                    outstandingAmount,
                    nextPaymentDue,
                    securityDeposit: tenant.leaseDetails?.securityDeposit || 0
                },
                lease: {
                    startDate: tenant.leaseDetails?.startDate,
                    endDate: tenant.leaseDetails?.endDate,
                    daysUntilExpiry: tenant.leaseDetails?.endDate 
                        ? Math.ceil((new Date(tenant.leaseDetails.endDate) - new Date()) / (1000 * 60 * 60 * 24))
                        : null,
                    leaseType: tenant.leaseDetails?.leaseType
                },
                recentActivity: {
                    bills: recentBills,
                    upcomingBills,
                    payments: paymentHistory.filter(p => p.bill) // Filter out payments where bill population failed
                }
            };

            return successResponse(res, 200, 'Tenant dashboard retrieved successfully', { dashboard });
        }

        return errorResponse(res, 403, 'Invalid user role');

    } catch (error) {
        logger.error('Dashboard error:', error);
        return errorResponse(res, 500, 'Failed to load dashboard', error.message);
    }
});

// 404 handler for API routes
router.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API route not found',
        path: req.originalUrl
    });
});

module.exports = router;