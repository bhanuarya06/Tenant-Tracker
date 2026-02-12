const express = require('express');
const { auth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { propertyCreate, propertyUpdate, pagination } = require('../validators');
const propertyController = require('../controllers/propertyController');

const router = express.Router();

// All property routes require authentication
router.use(auth);

/**
 * @route   POST /api/properties
 * @desc    Create a new property
 * @access  Private (Owner only)
 */
router.post('/', 
    requireRole('owner'),
    validate(propertyCreate),
    propertyController.createProperty
);

/**
 * @route   GET /api/properties
 * @desc    Get all properties for the owner
 * @access  Private (Owner only)
 */
router.get('/',
    requireRole('owner'),
    validate(pagination),
    propertyController.getProperties
);

/**
 * @route   GET /api/properties/:id
 * @desc    Get a single property by ID
 * @access  Private (Owner only)
 */
router.get('/:id',
    requireRole('owner'),
    propertyController.getPropertyById
);

/**
 * @route   PUT /api/properties/:id
 * @desc    Update a property
 * @access  Private (Owner only)
 */
router.put('/:id',
    requireRole('owner'),
    validate(propertyUpdate),
    propertyController.updateProperty
);

/**
 * @route   DELETE /api/properties/:id
 * @desc    Delete a property
 * @access  Private (Owner only)
 */
router.delete('/:id',
    requireRole('owner'),
    propertyController.deleteProperty
);

/**
 * @route   GET /api/properties/:id/stats
 * @desc    Get property statistics
 * @access  Private (Owner only)
 */
router.get('/:id/stats',
    requireRole('owner'),
    propertyController.getPropertyStats
);

/**
 * @route   GET /api/properties/:id/units
 * @desc    Get available units in a property
 * @access  Private (Owner only)
 */
router.get('/:id/units',
    requireRole('owner'),
    propertyController.getAvailableUnits
);

module.exports = router;