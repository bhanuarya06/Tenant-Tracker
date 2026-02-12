const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { paymentCreate, paymentUpdate, pagination } = require('../validators');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

// All payment routes require authentication
router.use(auth);

/**
 * @route   POST /api/payments
 * @desc    Record a new payment
 * @access  Private (Owner and Tenant)
 */
router.post('/',
    validate(paymentCreate),
    paymentController.createPayment
);

/**
 * @route   GET /api/payments
 * @desc    Get all payments (owner) or tenant payments (tenant)
 * @access  Private
 */
router.get('/',
    validate(pagination),
    (req, res) => {
        if (req.user.role === 'owner') {
            return paymentController.getPayments(req, res);
        } else if (req.user.role === 'tenant') {
            return paymentController.getTenantPayments(req, res);
        }
    }
);

/**
 * @route   GET /api/payments/stats
 * @desc    Get payment statistics
 * @access  Private (Owner only)
 */
router.get('/stats',
    requireRole('owner'),
    paymentController.getPaymentStats
);

/**
 * @route   GET /api/payments/:id
 * @desc    Get a single payment by ID
 * @access  Private
 */
router.get('/:id',
    paymentController.getPaymentById
);

/**
 * @route   PUT /api/payments/:id
 * @desc    Update a payment
 * @access  Private (Owner only)
 */
router.put('/:id',
    requireRole('owner'),
    validate(paymentUpdate),
    paymentController.updatePayment
);

/**
 * @route   DELETE /api/payments/:id
 * @desc    Delete a payment
 * @access  Private (Owner only)
 */
router.delete('/:id',
    requireRole('owner'),
    paymentController.deletePayment
);

/**
 * @route   POST /api/payments/:id/refund
 * @desc    Process a refund for a payment
 * @access  Private (Owner only)
 */
router.post('/:id/refund',
    requireRole('owner'),
    paymentController.processRefund
);

module.exports = router;