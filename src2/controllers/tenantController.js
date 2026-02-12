const Tenant = require('../models/Tenant');
const Property = require('../models/Property');
const User = require('../models/User');
const Bill = require('../models/Bill');
const logger = require('../utils/logger');
const { successResponse, errorResponse } = require('../utils/response');
const { buildQuery } = require('../utils/query');

class TenantController {
    // Create a new tenant
    async createTenant(req, res) {
        try {
            const {
                user: userData,
                property: propertyId,
                unit,
                leaseDetails,
                occupants,
                emergencyContacts,
                preferences,
                status
            } = req.body;

            // Handle user data - can be ObjectId or user details object
            let userId;
            let userDetails = {};

            if (typeof userData === 'string') {
                // User ID provided - verify user exists
                const existingUser = await User.findById(userData);
                if (!existingUser) {
                    return errorResponse(res, 404, 'User not found');
                }
                if (existingUser.role === 'owner') {
                    return errorResponse(res, 400, 'Cannot assign owner user as tenant');
                }
                userId = userData;
            } else if (typeof userData === 'object') {
                // User details provided - extract them
                userDetails = userData;
            } else {
                return errorResponse(res, 400, 'Invalid user data format');
            }

            // Verify property belongs to the owner
            const property = await Property.findOne({
                _id: propertyId,
                owner: req.user.userId
            });

            if (!property) {
                return errorResponse(res, 404, 'Property not found or access denied');
            }

            // Check if unit is already occupied
            const existingTenant = await Tenant.findOne({
                property: propertyId,
                unit,
                status: { $in: ['active', 'pending'] }
            });

            if (existingTenant) {
                return errorResponse(res, 400, 'Unit is already occupied');
            }

            // Create or verify user if user details provided
            let user;
            if (!userId) {
                const { email, firstName, lastName, password, phone, dateOfBirth, gender, bio } = userDetails;
                
                // Check if user already exists
                user = await User.findOne({ email });
                
                if (!user) {
                    // Create new user with tenant role
                    // Convert empty strings to undefined for optional fields
                    user = await User.create({
                        firstName,
                        lastName: lastName || undefined,
                        email,
                        password,
                        phone: phone || undefined,
                        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
                        gender: gender || undefined,
                        bio: bio || undefined,
                        role: 'tenant',
                        isActive: true
                    });

                    logger.info(`New user created for tenant: ${user._id}`, {
                        email,
                        userId: req.user.userId
                    });
                } else {
                    // User exists - verify they're not already a tenant or owner
                    if (user.role === 'owner') {
                        return errorResponse(res, 400, 'This email is registered as an owner account');
                    }
                }
                userId = user._id;
            } else {
                // userId was provided directly
                user = await User.findById(userId);
            }

            // Create tenant record
            const tenantData = {
                user: userId,
                property: propertyId,
                unit,
                owner: req.user.userId,
                leaseDetails,
                occupants: occupants || [],
                emergencyContacts: emergencyContacts || [],
                preferences: preferences || {},
                status: status || 'active',
                balance: 0,
                createdBy: req.user.userId
            };

            const tenant = await Tenant.create(tenantData);
            
            // Populate the created tenant with user and property details
            await tenant.populate([
                { path: 'user', select: 'firstName lastName email phone dateOfBirth gender bio' },
                { path: 'property', select: 'name address' },
                { path: 'owner', select: 'firstName lastName' }
            ]);

            logger.info(`Tenant created: ${tenant._id}`, { 
                userId: req.user.userId, 
                tenantId: tenant._id,
                propertyId 
            });

            return successResponse(res, 201, 'Tenant created successfully', { tenant });
        } catch (error) {
            logger.error('Create tenant error:', error);
            return errorResponse(res, 500, 'Failed to create tenant', error.message);
        }
    }

    // Get all tenants for the owner's properties
    async getTenants(req, res) {
        try {
            const { query, options } = buildQuery(req.query, ['unit', 'status']);
            
            // Get owner's property IDs
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');
            query.property = { $in: propertyIds };

            const tenants = await Tenant.find(query, null, options)
                .populate('user', 'firstName lastName email phone dateOfBirth gender bio')
                .populate('property', 'name address propertyType')
                .populate('owner', 'firstName lastName')
                .lean();

            // Add additional calculated fields
            for (let tenant of tenants) {
                // Check if lease is expiring soon (within 30 days)
                const daysUntilExpiry = tenant.leaseDetails?.endDate 
                    ? Math.ceil((new Date(tenant.leaseDetails.endDate) - new Date()) / (1000 * 60 * 60 * 24))
                    : null;
                
                tenant.isLeaseExpiringSoon = daysUntilExpiry && daysUntilExpiry <= 30 && daysUntilExpiry > 0;
                tenant.daysUntilLeaseExpiry = daysUntilExpiry;

                // Get outstanding bills count
                tenant.outstandingBillsCount = await Bill.countDocuments({
                    tenant: tenant._id,
                    status: { $in: ['sent', 'partial', 'overdue'] }
                });
            }

            const total = await Tenant.countDocuments(query);

            return successResponse(res, 200, 'Tenants retrieved successfully', {
                tenants,
                pagination: {
                    page: options.skip / options.limit + 1,
                    limit: options.limit,
                    total,
                    pages: Math.ceil(total / options.limit)
                }
            });
        } catch (error) {
            logger.error('Get tenants error:', error);
            return errorResponse(res, 500, 'Failed to retrieve tenants', error.message);
        }
    }

    // Get a single tenant by ID
    async getTenantById(req, res) {
        try {
            const { id } = req.params;

            // Get owner's property IDs for security
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');

            const tenant = await Tenant.findOne({
                _id: id,
                property: { $in: propertyIds }
            })
                .populate('user', 'firstName lastName email phone dateOfBirth gender address')
                .populate('property', 'name address propertyType amenities')
                .lean();

            if (!tenant) {
                return errorResponse(res, 404, 'Tenant not found');
            }

            // Get tenant's billing history
            const bills = await Bill.find({ tenant: id })
                .sort({ createdAt: -1 })
                .lean();

            // Calculate financial summary
            const financialSummary = {
                totalBilled: bills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0),
                totalPaid: bills
                    .filter(bill => bill.status === 'paid')
                    .reduce((sum, bill) => sum + (bill.totalAmount || 0), 0),
                outstandingAmount: bills
                    .filter(bill => ['sent', 'partial', 'overdue'].includes(bill.status))
                    .reduce((sum, bill) => sum + (bill.totalAmount || 0), 0),
                overdueAmount: bills
                    .filter(bill => bill.status === 'overdue')
                    .reduce((sum, bill) => sum + (bill.totalAmount || 0), 0)
            };

            tenant.bills = bills;
            tenant.financialSummary = financialSummary;

            return successResponse(res, 200, 'Tenant retrieved successfully', { tenant });
        } catch (error) {
            logger.error('Get tenant by ID error:', error);
            return errorResponse(res, 500, 'Failed to retrieve tenant', error.message);
        }
    }

    // Update a tenant
    async updateTenant(req, res) {
        try {
            const { id } = req.params;
            const {
                firstName,
                lastName,
                password,
                phone,
                dateOfBirth,
                gender,
                bio,
                ...tenantUpdates
            } = req.body;

            // Get owner's property IDs for security
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');

            // Remove fields that shouldn't be updated directly on Tenant
            delete tenantUpdates._id;
            delete tenantUpdates.email; // Email is in User model

            // If updating unit, check availability
            if (tenantUpdates.unit) {
                const existingTenant = await Tenant.findOne({
                    _id: { $ne: id },
                    property: tenantUpdates.property || { $in: propertyIds },
                    unit: tenantUpdates.unit,
                    status: { $in: ['active', 'pending'] }
                });

                if (existingTenant) {
                    return errorResponse(res, 400, 'Unit is already occupied');
                }
            }

            // Get tenant to access user ID
            const tenant = await Tenant.findOne({ _id: id, property: { $in: propertyIds } });
            if (!tenant) {
                return errorResponse(res, 404, 'Tenant not found');
            }

            // Update User fields if provided
            if (firstName || lastName || password || phone || dateOfBirth || gender || bio) {
                const userUpdates = {};
                if (firstName) userUpdates.firstName = firstName;
                if (lastName) userUpdates.lastName = lastName;
                if (password) userUpdates.password = password; // Will be hashed by pre-save hook
                if (phone) userUpdates.phone = phone;
                if (dateOfBirth) userUpdates.dateOfBirth = new Date(dateOfBirth);
                if (gender) userUpdates.gender = gender;
                if (bio) userUpdates.bio = bio;

                await User.findByIdAndUpdate(tenant.user, userUpdates, { runValidators: true });
            }

            // Update Tenant fields
            // Add updatedBy field for audit trail
            tenantUpdates.updatedBy = req.user.userId;

            const updatedTenant = await Tenant.findOneAndUpdate(
                { _id: id, property: { $in: propertyIds } },
                tenantUpdates,
                { new: true, runValidators: true }
            )
                .populate('user', 'firstName lastName email phone dateOfBirth gender bio')
                .populate('property', 'name address')
                .populate('owner', 'firstName lastName');

            logger.info(`Tenant updated: ${updatedTenant._id}`, { 
                userId: req.user.userId, 
                tenantId: updatedTenant._id 
            });

            return successResponse(res, 200, 'Tenant updated successfully', { tenant: updatedTenant });
        } catch (error) {
            logger.error('Update tenant error:', error);
            return errorResponse(res, 500, 'Failed to update tenant', error.message);
        }
    }

    // Delete a tenant
    async deleteTenant(req, res) {
        try {
            const { id } = req.params;

            // Get owner's property IDs for security
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');

            // Check if tenant has outstanding bills
            const outstandingBills = await Bill.countDocuments({
                tenant: id,
                status: { $in: ['sent', 'partial', 'overdue'] }
            });

            if (outstandingBills > 0) {
                return errorResponse(res, 400, 'Cannot delete tenant with outstanding bills');
            }

            const tenant = await Tenant.findOneAndDelete({
                _id: id,
                property: { $in: propertyIds }
            });

            if (!tenant) {
                return errorResponse(res, 404, 'Tenant not found');
            }

            logger.info(`Tenant deleted: ${tenant._id}`, { 
                userId: req.user.userId, 
                tenantId: tenant._id 
            });

            return successResponse(res, 200, 'Tenant deleted successfully');
        } catch (error) {
            logger.error('Delete tenant error:', error);
            return errorResponse(res, 500, 'Failed to delete tenant', error.message);
        }
    }

    // Get tenants with expiring leases
    async getExpiringLeases(req, res) {
        try {
            const { days = 30 } = req.query;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() + parseInt(days));

            // Get owner's property IDs
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');

            const tenants = await Tenant.find({
                property: { $in: propertyIds },
                status: 'active',
                'leaseDetails.endDate': {
                    $gte: new Date(),
                    $lte: cutoffDate
                }
            })
                .populate('user', 'firstName lastName email phone')
                .populate('property', 'name address')
                .sort({ 'leaseDetails.endDate': 1 })
                .lean();

            // Add days until expiry
            tenants.forEach(tenant => {
                tenant.daysUntilExpiry = Math.ceil(
                    (new Date(tenant.leaseDetails.endDate) - new Date()) / (1000 * 60 * 60 * 24)
                );
            });

            return successResponse(res, 200, 'Expiring leases retrieved successfully', { 
                tenants,
                count: tenants.length 
            });
        } catch (error) {
            logger.error('Get expiring leases error:', error);
            return errorResponse(res, 500, 'Failed to retrieve expiring leases', error.message);
        }
    }

    // Add a note to tenant
    async addTenantNote(req, res) {
        try {
            const { id } = req.params;
            const { content, isPrivate = false } = req.body;

            if (!content || content.trim().length === 0) {
                return errorResponse(res, 400, 'Note content is required');
            }

            // Get owner's property IDs for security
            const propertyIds = await Property.find({ owner: req.user.userId }).distinct('_id');

            const tenant = await Tenant.findOne({
                _id: id,
                property: { $in: propertyIds }
            });

            if (!tenant) {
                return errorResponse(res, 404, 'Tenant not found');
            }

            const note = {
                content: content.trim(),
                isPrivate,
                createdBy: req.user.userId,
                createdAt: new Date()
            };

            tenant.notes.push(note);
            await tenant.save();

            logger.info(`Note added to tenant: ${tenant._id}`, { 
                userId: req.user.userId, 
                tenantId: tenant._id 
            });

            return successResponse(res, 200, 'Note added successfully', { 
                note: tenant.notes[tenant.notes.length - 1] 
            });
        } catch (error) {
            logger.error('Add tenant note error:', error);
            return errorResponse(res, 500, 'Failed to add note', error.message);
        }
    }

    // Get tenant dashboard (for tenant users)
    async getTenantDashboard(req, res) {
        try {
            const tenant = await Tenant.findOne({ 
                user: req.user.userId,
                status: 'active' 
            })
                .populate('property', 'name address propertyType amenities')
                .lean();

            if (!tenant) {
                return errorResponse(res, 404, 'Active tenancy not found');
            }

            // Get recent bills
            const recentBills = await Bill.find({ tenant: tenant._id })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            // Get financial summary
            const financialSummary = {
                outstandingAmount: recentBills
                    .filter(bill => ['sent', 'partial', 'overdue'].includes(bill.status))
                    .reduce((sum, bill) => sum + (bill.totalAmount || 0), 0),
                nextPaymentDue: recentBills
                    .filter(bill => ['sent', 'partial'].includes(bill.status))
                    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0]?.dueDate,
                monthlyRent: tenant.leaseDetails?.monthlyRent || 0
            };

            // Check lease status
            const leaseStatus = {
                endDate: tenant.leaseDetails?.endDate,
                daysUntilExpiry: tenant.leaseDetails?.endDate 
                    ? Math.ceil((new Date(tenant.leaseDetails.endDate) - new Date()) / (1000 * 60 * 60 * 24))
                    : null
            };

            return successResponse(res, 200, 'Tenant dashboard retrieved successfully', {
                tenant,
                recentBills,
                financialSummary,
                leaseStatus
            });
        } catch (error) {
            logger.error('Get tenant dashboard error:', error);
            return errorResponse(res, 500, 'Failed to retrieve dashboard', error.message);
        }
    }
}

module.exports = new TenantController();