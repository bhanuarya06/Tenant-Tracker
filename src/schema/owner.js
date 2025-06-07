const mongoose = require('mongoose');
const { Schema } = mongoose

const owner = new Schema({
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
    },
    dob: {
        type: Date
    },
    gender: {
        type: String
    },
    email: {
        type: String,
        required: true
    },
    mobile: {
        type: String
    },
    address: {
        type: String
    },
    bio: {
        type: String
    },
    password: {
        type: String
    }
}, {
    timestamps: true
});

const ownerModel = mongoose.model('owner', owner);

module.exports = { ownerModel }