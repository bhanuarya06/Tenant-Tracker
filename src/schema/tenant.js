const mongoose = require('mongoose');
const { ownerModel } = require('./owner');
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
    },
    gender: {
        type: String
    },
    email: {
        type: String,
        unique : true,
        required: true
    },
    mobile: {
        type: String
    },
    ocupation: {
        type: String
    },
    bio: {
        type: String
    },
    password: {
        type: String
    },
    roomNum:{
        type: String,
        required: true
    },
    rent: {
        type: String,
        required: true
    },
    balance: {
        type: String
    },
    memberCount: {
        type: String,
        required: true
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: ownerModel
    },
    active:{
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
})
const tenantModel = mongoose.model('tenant', tenant);

module.exports = { tenantModel }