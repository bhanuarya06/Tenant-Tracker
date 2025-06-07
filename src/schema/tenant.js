const mongoose = require('mongoose');
const { Schema } = mongoose

const tenant = new Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
    },
    dob: {
        type: Date,
        required: true
    },
    gender:{
        type:String
    },
    email: {
        type: String,
        required: true
    },
    mobile: {
        type: String
    },
    ocupation: {
        type: String
    }
}, {
    timestamps: true
})
const tenantModel = mongoose.model('tenant', tenant);

module.exports = { tenantModel }