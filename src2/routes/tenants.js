const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { tenantCreate, tenantUpdate, pagination } = require('../validators');
const tenantController = require('../controllers/tenantController');

const router = express.Router();

// All tenant routes require authentication
router.use(auth);

/**
 * @route   POST /api/tenants
 * @desc    Create a new tenant
 * @access  Private (Owner only)
 */
router.post('/',
    requireRole('owner'),
    validate(tenantCreate),
    tenantController.createTenant
);

/**
 * @route   GET /api/tenants
 * @desc    Get all tenants for owner's properties
 * @access  Private (Owner only)
 */
router.get('/',
    requireRole('owner'),
    validate(pagination),
    tenantController.getTenants
);

/**
 * @route   GET /api/tenants/dashboard
 * @desc    Get tenant dashboard (for tenant users)
 * @access  Private (Tenant only)
 */
router.get('/dashboard',
    requireRole('tenant'),
    tenantController.getTenantDashboard
);

/**
 * @route   GET /api/tenants/expiring-leases
 * @desc    Get tenants with expiring leases
 * @access  Private (Owner only)
 */
router.get('/expiring-leases',
    requireRole('owner'),
    tenantController.getExpiringLeases
);

/**
 * @route   GET /api/tenants/:id
 * @desc    Get a single tenant by ID
 * @access  Private (Owner only)
 */
router.get('/:id',
    requireRole('owner'),
    tenantController.getTenantById
);

/**
 * @route   PUT /api/tenants/:id
 * @desc    Update a tenant
 * @access  Private (Owner only)
 */
router.put('/:id',
    requireRole('owner'),
    validate(tenantUpdate),
    tenantController.updateTenant
);

/**
 * @route   DELETE /api/tenants/:id
 * @desc    Delete a tenant
 * @access  Private (Owner only)
 */
router.delete('/:id',
    requireRole('owner'),
    tenantController.deleteTenant
);

/**
 * @route   POST /api/tenants/:id/notes
 * @desc    Add a note to tenant
 * @access  Private (Owner only)
 */
router.post('/:id/notes',
    requireRole('owner'),
    tenantController.addTenantNote
);

module.exports = router;