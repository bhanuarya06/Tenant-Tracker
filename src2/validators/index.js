const Joi = require('joi');

// Common validation schemas
const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/).message('Invalid ID format');

const pagination = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().default('-createdAt'),
    search: Joi.string().trim(),
    searchFields: Joi.string()
});

// User validation schemas
const userRegister = Joi.object({
    firstName: Joi.string().trim().min(2).max(50).required(),
    lastName: Joi.string().trim().max(50),
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(8).max(128).required(),
    role: Joi.string().valid('owner', 'tenant').default('owner'),
    // Accept both 'phone' and 'mobile' field names
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/),
    mobile: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/),
    // Accept both 'dateOfBirth' and 'dob' field names
    dateOfBirth: Joi.date().max('now'),
    dob: Joi.date().max('now'),
    gender: Joi.string().valid('male', 'female', 'other'),
    address: Joi.object({
        street: Joi.string().trim(),
        city: Joi.string().trim(),
        state: Joi.string().trim(),
        zipCode: Joi.string().trim(),
        country: Joi.string().trim()
    }),
    bio: Joi.string().max(500)
});

const userLogin = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

const userUpdate = Joi.object({
    firstName: Joi.string().trim().min(2).max(50),
    lastName: Joi.string().trim().max(50),
    // Accept both 'phone' and 'mobile' field names
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/),
    mobile: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/),
    // Accept both 'dateOfBirth' and 'dob' field names
    dateOfBirth: Joi.date().max('now'),
    dob: Joi.date().max('now'),
    gender: Joi.string().valid('male', 'female', 'other'),
    bio: Joi.string().max(500),
    address: Joi.object({
        street: Joi.string().trim(),
        city: Joi.string().trim(),
        state: Joi.string().trim(),
        zipCode: Joi.string().trim(),
        country: Joi.string().trim()
    }),
    bio: Joi.string().max(500)
});

const changePassword = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).max(128).required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
});

// Property validation schemas
const propertyCreate = Joi.object({
    name: Joi.string().trim().max(100).required(),
    description: Joi.string().max(1000),
    address: Joi.object({
        street: Joi.string().trim().required(),
        city: Joi.string().trim().required(),
        state: Joi.string().trim().required(),
        zipCode: Joi.string().trim().required(),
        country: Joi.string().trim().required()
    }).required(),
    propertyType: Joi.string().valid('apartment', 'house', 'condo', 'studio', 'room', 'commercial').required(),
    totalUnits: Joi.number().integer().min(1).required(),
    amenities: Joi.array().items(Joi.string().trim()),
    images: Joi.array().items(Joi.object({
        url: Joi.string().uri().required(),
        caption: Joi.string().trim(),
        isPrimary: Joi.boolean().default(false)
    }))
});

const propertyUpdate = Joi.object({
    name: Joi.string().trim().max(100),
    description: Joi.string().max(1000),
    address: Joi.object({
        street: Joi.string().trim(),
        city: Joi.string().trim(),
        state: Joi.string().trim(),
        zipCode: Joi.string().trim(),
        country: Joi.string().trim()
    }),
    propertyType: Joi.string().valid('apartment', 'house', 'condo', 'studio', 'room', 'commercial'),
    totalUnits: Joi.number().integer().min(1),
    amenities: Joi.array().items(Joi.string().trim()),
    images: Joi.array().items(Joi.object({
        url: Joi.string().uri().required(),
        caption: Joi.string().trim(),
        isPrimary: Joi.boolean().default(false)
    }))
});

// Tenant validation schemas
const tenantCreate = Joi.object({
    user: Joi.alternatives().try(
        objectId,
        Joi.object({
            firstName: Joi.string().trim().min(2).max(50).required(),
            lastName: Joi.string().trim().max(50).allow(''),
            email: Joi.string().email().lowercase().required(),
            password: Joi.string().min(8).max(128).required(),
            phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).allow(''),
            dateOfBirth: Joi.date().max('now').allow('').allow(null).optional(),
            gender: Joi.string().valid('male', 'female', 'other').allow(''),
            bio: Joi.string().max(500).allow('')
        })
    ).required(),
    property: objectId.required(),
    unit: Joi.string().trim().required(),
    leaseDetails: Joi.object({
        startDate: Joi.date().required(),
        endDate: Joi.date().greater(Joi.ref('startDate')).required(),
        monthlyRent: Joi.number().min(0).required(),
        securityDeposit: Joi.number().min(0).default(0),
        leaseType: Joi.string().valid('fixed', 'month-to-month', 'yearly').default('fixed')
    }).required(),
    occupants: Joi.array().items(Joi.object({
        name: Joi.string().trim().required(),
        relationship: Joi.string().valid('spouse', 'child', 'parent', 'sibling', 'friend', 'other').default('other'),
        dateOfBirth: Joi.date().max('now'),
        phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/)
    })),
    emergencyContacts: Joi.array().items(Joi.object({
        name: Joi.string().trim().required(),
        relationship: Joi.string().required(),
        phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).required(),
        email: Joi.string().email(),
        isPrimary: Joi.boolean().default(false)
    })),
    preferences: Joi.object({
        notifications: Joi.object({
            email: Joi.boolean().default(true),
            sms: Joi.boolean().default(false),
            push: Joi.boolean().default(true)
        }),
        paymentMethod: Joi.string().valid('cash', 'check', 'bank_transfer', 'online', 'other').default('online')
    }),
    status: Joi.string().valid('active', 'inactive', 'terminated', 'pending')
});

const tenantUpdate = Joi.object({
    unit: Joi.string().trim(),
    leaseDetails: Joi.object({
        startDate: Joi.date(),
        endDate: Joi.date(),
        monthlyRent: Joi.number().min(0),
        securityDeposit: Joi.number().min(0),
        leaseType: Joi.string().valid('fixed', 'month-to-month', 'yearly')
    }),
    occupants: Joi.array().items(Joi.object({
        name: Joi.string().trim().required(),
        relationship: Joi.string().valid('spouse', 'child', 'parent', 'sibling', 'friend', 'other').default('other'),
        dateOfBirth: Joi.date().max('now'),
        phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/)
    })),
    emergencyContacts: Joi.array().items(Joi.object({
        name: Joi.string().trim().required(),
        relationship: Joi.string().required(),
        phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/).required(),
        email: Joi.string().email(),
        isPrimary: Joi.boolean().default(false)
    })),
    preferences: Joi.object({
        notifications: Joi.object({
            email: Joi.boolean(),
            sms: Joi.boolean(),
            push: Joi.boolean()
        }),
        paymentMethod: Joi.string().valid('cash', 'check', 'bank_transfer', 'online', 'other')
    }),
    status: Joi.string().valid('active', 'inactive', 'terminated', 'pending'),
    notes: Joi.array().items(Joi.object({
        content: Joi.string().required(),
        isPrivate: Joi.boolean().default(false)
    }))
});

// Bill validation schemas
const billCreate = Joi.object({
    tenant: objectId.required(),
    billingPeriod: Joi.object({
        month: Joi.number().integer().min(1).max(12).required(),
        year: Joi.number().integer().min(2000).required()
    }).required(),
    charges: Joi.object({
        rent: Joi.number().min(0).required(),
        utilities: Joi.object({
            water: Joi.number().min(0).default(0),
            electricity: Joi.number().min(0).default(0),
            gas: Joi.number().min(0).default(0),
            internet: Joi.number().min(0).default(0),
            trash: Joi.number().min(0).default(0),
            other: Joi.object({
                amount: Joi.number().min(0).default(0),
                description: Joi.string().trim().allow('')
            })
        }),
        maintenance: Joi.number().min(0).default(0),
        parking: Joi.number().min(0).default(0),
        petFee: Joi.number().min(0).default(0),
        lateFee: Joi.number().min(0).default(0),
        additionalCharges: Joi.array().items(Joi.object({
            description: Joi.string().trim().required(),
            amount: Joi.number().min(0).required()
        }))
    }).required(),
    credits: Joi.object({
        securityDepositRefund: Joi.number().min(0).default(0),
        prorationCredit: Joi.number().min(0).default(0),
        otherCredits: Joi.array().items(Joi.object({
            description: Joi.string().trim().required(),
            amount: Joi.number().min(0).required()
        }))
    }),
    dueDate: Joi.date().required(),
    notes: Joi.string().max(500).allow('').optional()
});

const billUpdate = Joi.object({
    charges: Joi.object({
        rent: Joi.number().min(0),
        utilities: Joi.object({
            water: Joi.number().min(0),
            electricity: Joi.number().min(0),
            gas: Joi.number().min(0),
            internet: Joi.number().min(0),
            trash: Joi.number().min(0),
            other: Joi.object({
                amount: Joi.number().min(0),
                description: Joi.string().trim()
            })
        }),
        maintenance: Joi.number().min(0),
        parking: Joi.number().min(0),
        petFee: Joi.number().min(0),
        lateFee: Joi.number().min(0),
        additionalCharges: Joi.array().items(Joi.object({
            description: Joi.string().trim().required(),
            amount: Joi.number().min(0).required()
        }))
    }),
    credits: Joi.object({
        securityDepositRefund: Joi.number().min(0),
        prorationCredit: Joi.number().min(0),
        otherCredits: Joi.array().items(Joi.object({
            description: Joi.string().trim().required(),
            amount: Joi.number().min(0).required()
        }))
    }),
    dueDate: Joi.date(),
    status: Joi.string().valid('draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled'),
    notes: Joi.string().max(500).allow('')
});

// Payment validation schemas
const paymentCreate = Joi.object({
    bill: objectId.required(),
    amount: Joi.number().min(0.01).required(),
    paymentDate: Joi.date().default(() => new Date()),
    paymentMethod: Joi.string().valid('cash', 'check', 'bank_transfer', 'credit_card', 'debit_card', 'online', 'other').required(),
    transactionId: Joi.string().trim(),
    checkNumber: Joi.string().trim(),
    bankDetails: Joi.object({
        bankName: Joi.string().trim(),
        accountNumber: Joi.string().trim(),
        routingNumber: Joi.string().trim()
    }),
    notes: Joi.string().max(500).allow('').optional()
});

const paymentUpdate = Joi.object({
    status: Joi.string().valid('pending', 'completed', 'failed', 'refunded', 'cancelled'),
    notes: Joi.string().max(500).allow(''),
    refund: Joi.object({
        amount: Joi.number().min(0).required(),
        reason: Joi.string().trim().required()
    })
});

// ═══════════════════════════════════════════
// OAuth 2.0 / OIDC Validation Schemas
// ═══════════════════════════════════════════

const oauthLogin = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
});

const oauthRegister = Joi.object({
    firstName: Joi.string().trim().min(2).max(50).required(),
    lastName: Joi.string().trim().max(50),
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(8).max(128).required(),
    role: Joi.string().valid('owner', 'tenant').default('owner'),
    phone: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/),
    mobile: Joi.string().pattern(/^[\+]?[1-9][\d]{0,15}$/),
    dateOfBirth: Joi.date().max('now'),
    dob: Joi.date().max('now'),
    gender: Joi.string().valid('male', 'female', 'other'),
    address: Joi.object({
        street: Joi.string().trim(),
        city: Joi.string().trim(),
        state: Joi.string().trim(),
        zipCode: Joi.string().trim(),
        country: Joi.string().trim(),
    }),
    bio: Joi.string().max(500),
});

const oauthToken = Joi.object({
    grant_type: Joi.string().valid('authorization_code', 'refresh_token').required(),
    code: Joi.string().when('grant_type', {
        is: 'authorization_code',
        then: Joi.required(),
    }),
    redirect_uri: Joi.string().uri().when('grant_type', {
        is: 'authorization_code',
        then: Joi.required(),
    }),
    client_id: Joi.string().when('grant_type', {
        is: 'authorization_code',
        then: Joi.required(),
    }),
    code_verifier: Joi.string().min(43).max(128).when('grant_type', {
        is: 'authorization_code',
        then: Joi.required(),
    }),
    refresh_token: Joi.string().when('grant_type', {
        is: 'refresh_token',
        then: Joi.optional(), // Can come from cookie
    }),
});

const oauthAuthorizePost = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    client_id: Joi.string().required(),
    redirect_uri: Joi.string().uri().required(),
    code_challenge: Joi.string().required(),
    code_challenge_method: Joi.string().valid('S256').required(),
    scope: Joi.string(),
    state: Joi.string().required(),
    nonce: Joi.string(),
});

module.exports = {
    // Common
    objectId,
    pagination,
    
    // User validations
    userRegister,
    userLogin,
    userUpdate,
    changePassword,
    
    // Property validations
    propertyCreate,
    propertyUpdate,
    
    // Tenant validations
    tenantCreate,
    tenantUpdate,
    
    // Bill validations
    billCreate,
    billUpdate,
    
    // Payment validations
    paymentCreate,
    paymentUpdate,

    // OAuth 2.0 / OIDC validations
    oauthLogin,
    oauthRegister,
    oauthToken,
    oauthAuthorizePost
};