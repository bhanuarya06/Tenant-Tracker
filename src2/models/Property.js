const mongoose = require('mongoose');
const { Schema } = mongoose;

const propertySchema = new Schema({
    name: {
        type: String,
        required: [true, 'Property name is required'],
        trim: true,
        maxlength: [100, 'Property name cannot exceed 100 characters']
    },
    description: {
        type: String,
        maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    address: {
        street: {
            type: String,
            required: [true, 'Street address is required']
        },
        city: {
            type: String,
            required: [true, 'City is required']
        },
        state: {
            type: String,
            required: [true, 'State is required']
        },
        zipCode: {
            type: String,
            required: [true, 'Zip code is required']
        },
        country: {
            type: String,
            required: [true, 'Country is required']
        }
    },
    owner: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Property owner is required']
    },
    propertyType: {
        type: String,
        enum: ['apartment', 'house', 'condo', 'studio', 'room', 'commercial'],
        required: [true, 'Property type is required']
    },
    totalUnits: {
        type: Number,
        required: [true, 'Total units is required'],
        min: [1, 'Total units must be at least 1']
    },
    availableUnits: {
        type: Number,
        default: function() {
            return this.totalUnits;
        },
        min: [0, 'Available units cannot be negative']
    },
    amenities: [{
        type: String,
        trim: true
    }],
    images: [{
        url: String,
        caption: String,
        isPrimary: {
            type: Boolean,
            default: false
        }
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
propertySchema.index({ owner: 1 });
propertySchema.index({ 'address.city': 1 });
propertySchema.index({ 'address.state': 1 });
propertySchema.index({ propertyType: 1 });
propertySchema.index({ isActive: 1 });
propertySchema.index({ createdAt: -1 });

// Virtual for full address
propertySchema.virtual('fullAddress').get(function() {
    const { street, city, state, zipCode, country } = this.address;
    return `${street}, ${city}, ${state} ${zipCode}, ${country}`;
});

// Virtual for occupancy rate
propertySchema.virtual('occupancyRate').get(function() {
    if (this.totalUnits === 0) return 0;
    return ((this.totalUnits - this.availableUnits) / this.totalUnits * 100).toFixed(2);
});

// Validate that availableUnits doesn't exceed totalUnits
propertySchema.pre('save', function(next) {
    if (this.availableUnits > this.totalUnits) {
        next(new Error('Available units cannot exceed total units'));
    }
    next();
});

// Ensure only one primary image
propertySchema.pre('save', function(next) {
    if (this.images && this.images.length > 0) {
        const primaryImages = this.images.filter(img => img.isPrimary);
        if (primaryImages.length > 1) {
            // Keep only the first primary image
            let foundPrimary = false;
            this.images.forEach(img => {
                if (img.isPrimary && foundPrimary) {
                    img.isPrimary = false;
                }
                if (img.isPrimary && !foundPrimary) {
                    foundPrimary = true;
                }
            });
        }
    }
    next();
});

// Static method to find properties by owner
propertySchema.statics.findByOwner = function(ownerId, includeInactive = false) {
    const filter = { owner: ownerId };
    if (!includeInactive) {
        filter.isActive = true;
    }
    return this.find(filter).populate('owner', 'firstName lastName email');
};

// Static method to search properties
propertySchema.statics.searchProperties = function(searchTerm, filters = {}) {
    const query = {
        isActive: true,
        ...filters
    };
    
    if (searchTerm) {
        query.$or = [
            { name: { $regex: searchTerm, $options: 'i' } },
            { description: { $regex: searchTerm, $options: 'i' } },
            { 'address.city': { $regex: searchTerm, $options: 'i' } },
            { 'address.state': { $regex: searchTerm, $options: 'i' } }
        ];
    }
    
    return this.find(query).populate('owner', 'firstName lastName email');
};

const Property = mongoose.model('Property', propertySchema);

module.exports = Property;