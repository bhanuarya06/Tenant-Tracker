const Property = require('../models/Property');
const Tenant = require('../models/Tenant');
const Bill = require('../models/Bill');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/response');
const { buildQuery } = require('../utils/query');

class PropertyController {
    // Create a new property
    async createProperty(req, res) {
        try {
            const propertyData = {
                ...req.body,
                owner: req.user.userId,
                createdBy: req.user.userId
            };

            const property = await Property.create(propertyData);
            
            logger.info(`Property created: ${property._id}`, { 
                userId: req.user.userId, 
                propertyId: property._id 
            });

            return successResponse(res, 201, 'Property created successfully', { property });
        } catch (error) {
            logger.error('Create property error:', error);
            return errorResponse(res, 500, 'Failed to create property', error.message);
        }
    }

    // Get all properties for the owner
    async getProperties(req, res) {
        try {
            const { query, options } = buildQuery(req.query, ['name', 'address.city', 'address.state', 'propertyType']);
            
            // Add owner filter
            query.owner = req.user.userId;

            const properties = await Property.find(query, null, options)
                .populate('owner', 'firstName lastName email')
                .lean();

            // Get tenant counts for each property
            for (let property of properties) {
                const activeTenants = await Tenant.countDocuments({
                    property: property._id,
                    status: 'active'
                });
                property.activeTenantCount = activeTenants;
                property.occupancyRate = property.totalUnits > 0 
                    ? Math.round((activeTenants / property.totalUnits) * 100) 
                    : 0;
            }

            const total = await Property.countDocuments(query);

            return successResponse(res, 200, 'Properties retrieved successfully', {
                properties,
                pagination: {
                    page: options.skip / options.limit + 1,
                    limit: options.limit,
                    total,
                    pages: Math.ceil(total / options.limit)
                }
            });
        } catch (error) {
            logger.error('Get properties error:', error);
            return errorResponse(res, 500, 'Failed to retrieve properties', error.message);
        }
    }

    // Get a single property by ID
    async getPropertyById(req, res) {
        try {
            const { id } = req.params;

            const property = await Property.findOne({
                _id: id,
                owner: req.user.userId
            }).populate('owner', 'firstName lastName email phone').lean();

            if (!property) {
                return errorResponse(res, 404, 'Property not found');
            }

            // Get detailed tenant information
            const tenants = await Tenant.find({ property: id })
                .populate('user', 'firstName lastName email phone')
                .lean();

            // Get recent bills for this property
            const recentBills = await Bill.find({
                tenant: { $in: tenants.map(t => t._id) }
            })
                .populate('tenant', 'unit')
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            property.tenants = tenants;
            property.recentBills = recentBills;
            property.activeTenantCount = tenants.filter(t => t.status === 'active').length;

            return successResponse(res, 200, 'Property retrieved successfully', { property });
        } catch (error) {
            logger.error('Get property by ID error:', error);
            return errorResponse(res, 500, 'Failed to retrieve property', error.message);
        }
    }

    // Update a property
    async updateProperty(req, res) {
        try {
            const { id } = req.params;
            const updates = req.body;

            // Remove fields that shouldn't be updated
            delete updates.owner;
            delete updates.createdBy;
            delete updates._id;

            // Add updatedBy field for audit trail
            updates.updatedBy = req.user.userId;

            const property = await Property.findOneAndUpdate(
                { _id: id, owner: req.user.userId },
                updates,
                { new: true, runValidators: true }
            ).populate('owner', 'firstName lastName email');

            if (!property) {
                return errorResponse(res, 404, 'Property not found');
            }

            logger.info(`Property updated: ${property._id}`, { 
                userId: req.user.userId, 
                propertyId: property._id 
            });

            return successResponse(res, 200, 'Property updated successfully', { property });
        } catch (error) {
            logger.error('Update property error:', error);
            return errorResponse(res, 500, 'Failed to update property', error.message);
        }
    }

    // Delete a property
    async deleteProperty(req, res) {
        try {
            const { id } = req.params;

            // Check if property has active tenants
            const activeTenants = await Tenant.countDocuments({
                property: id,
                status: 'active'
            });

            if (activeTenants > 0) {
                return errorResponse(res, 400, 'Cannot delete property with active tenants');
            }

            const property = await Property.findOneAndDelete({
                _id: id,
                owner: req.user.userId
            });

            if (!property) {
                return errorResponse(res, 404, 'Property not found');
            }

            logger.info(`Property deleted: ${property._id}`, { 
                userId: req.user.userId, 
                propertyId: property._id 
            });

            return successResponse(res, 200, 'Property deleted successfully');
        } catch (error) {
            logger.error('Delete property error:', error);
            return errorResponse(res, 500, 'Failed to delete property', error.message);
        }
    }

    // Get property statistics
    async getPropertyStats(req, res) {
        try {
            const { id } = req.params;

            const property = await Property.findOne({
                _id: id,
                owner: req.user.userId
            });

            if (!property) {
                return errorResponse(res, 404, 'Property not found');
            }

            // Get tenant statistics
            const [
                totalTenants,
                activeTenants,
                inactiveTenants,
                pendingTenants
            ] = await Promise.all([
                Tenant.countDocuments({ property: id }),
                Tenant.countDocuments({ property: id, status: 'active' }),
                Tenant.countDocuments({ property: id, status: 'inactive' }),
                Tenant.countDocuments({ property: id, status: 'pending' })
            ]);

            // Get financial statistics
            const currentDate = new Date();
            const currentMonth = currentDate.getMonth() + 1;
            const currentYear = currentDate.getFullYear();

            const tenantIds = await Tenant.find({ property: id }).distinct('_id');

            const [
                monthlyRevenue,
                totalOutstandingBills,
                paidBillsThisMonth,
                overdueBills
            ] = await Promise.all([
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
                Bill.countDocuments({
                    tenant: { $in: tenantIds },
                    'billingPeriod.month': currentMonth,
                    'billingPeriod.year': currentYear,
                    status: 'paid'
                }),
                Bill.countDocuments({
                    tenant: { $in: tenantIds },
                    status: 'overdue'
                })
            ]);

            const stats = {
                property: {
                    totalUnits: property.totalUnits,
                    occupiedUnits: activeTenants,
                    vacantUnits: property.totalUnits - activeTenants,
                    occupancyRate: property.totalUnits > 0 
                        ? Math.round((activeTenants / property.totalUnits) * 100) 
                        : 0
                },
                tenants: {
                    total: totalTenants,
                    active: activeTenants,
                    inactive: inactiveTenants,
                    pending: pendingTenants
                },
                financial: {
                    monthlyRevenue: monthlyRevenue[0]?.total || 0,
                    outstandingAmount: totalOutstandingBills[0]?.total || 0,
                    paidBillsThisMonth,
                    overdueBills
                }
            };

            return successResponse(res, 200, 'Property statistics retrieved successfully', { stats });
        } catch (error) {
            logger.error('Get property stats error:', error);
            return errorResponse(res, 500, 'Failed to retrieve property statistics', error.message);
        }
    }

    // Get available units in a property
    async getAvailableUnits(req, res) {
        try {
            const { id } = req.params;

            const property = await Property.findOne({
                _id: id,
                owner: req.user.userId
            });

            if (!property) {
                return errorResponse(res, 404, 'Property not found');
            }

            // Get occupied units
            const occupiedUnits = await Tenant.find({
                property: id,
                status: { $in: ['active', 'pending'] }
            }).select('unit').lean();

            const occupiedUnitNumbers = occupiedUnits.map(t => t.unit);

            // For now, generate unit numbers based on total units
            // In a real application, this might be stored differently
            const allUnits = [];
            for (let i = 1; i <= property.totalUnits; i++) {
                const unitNumber = property.propertyType === 'apartment' ? `${Math.ceil(i/10)}${(i % 10) || 10}` : `${i}`;
                allUnits.push({
                    unit: unitNumber,
                    isAvailable: !occupiedUnitNumbers.includes(unitNumber)
                });
            }

            return successResponse(res, 200, 'Available units retrieved successfully', { 
                units: allUnits,
                availableCount: allUnits.filter(u => u.isAvailable).length
            });
        } catch (error) {
            logger.error('Get available units error:', error);
            return errorResponse(res, 500, 'Failed to retrieve available units', error.message);
        }
    }
}

module.exports = new PropertyController();