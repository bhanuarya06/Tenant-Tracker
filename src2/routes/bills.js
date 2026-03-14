const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { billCreate, billUpdate, pagination } = require('../validators');
const billController = require('../controllers/billController');

const router = express.Router();

// All bill routes require authentication
router.use(auth);

/**
 * @route   POST /api/bills
 * @desc    Create a new bill
 * @access  Private (Owner only)
 */
router.post('/',
    requireRole('owner'),
    validate(billCreate),
    billController.createBill
);

/**
 * @route   GET /api/bills
 * @desc    Get all bills (owner) or tenant bills (tenant)
 * @access  Private
 */
router.get('/',
    validate(pagination),
    (req, res) => {
        if (req.user.role === 'owner') {
            return billController.getBills(req, res);
        } else if (req.user.role === 'tenant') {
            return billController.getTenantBills(req, res);
        }
    }
);

/**
 * @route   GET /api/bills/summary
 * @desc    Get bills summary/statistics
 * @access  Private (Owner only)
 */
router.get('/summary',
    requireRole('owner'),
    billController.getBillsSummary
);

/**
 * @route   GET /api/bills/tenant/:tenantId
 * @desc    Get bills for a specific tenant
 * @access  Private (Owner only)
 */
router.get('/tenant/:tenantId',
    requireRole('owner'),
    validate(pagination),
    billController.getBillsByTenantId
);

/**
 * @route   POST /api/bills/generate-recurring
 * @desc    Generate recurring bills for a specific month
 * @access  Private (Owner only)
 */
router.post('/generate-recurring',
    requireRole('owner'),
    billController.generateRecurringBills
);

/**
 * @route   GET /api/bills/:id
 * @desc    Get a single bill by ID
 * @access  Private
 */
router.get('/:id',
    billController.getBillById
);

/**
 * @route   PUT /api/bills/:id
 * @desc    Update a bill
 * @access  Private (Owner only)
 */
router.put('/:id',
    requireRole('owner'),
    validate(billUpdate),
    billController.updateBill
);

/**
 * @route   DELETE /api/bills/:id
 * @desc    Delete a bill
 * @access  Private (Owner only)
 */
router.delete('/:id',
    requireRole('owner'),
    billController.deleteBill
);

/**
 * @route   POST /api/bills/:id/send
 * @desc    Send bill to tenant
 * @access  Private (Owner only)
 */
router.post('/:id/send',
    requireRole('owner'),
    billController.sendBill
);

module.exports = router;