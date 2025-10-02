const mongoose = require('mongoose');
const { Schema } = mongoose

const connection = new Schema({
    fromUserId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    toUserId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    status: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

const ConnectionRequestModel = mongoose.model('ConnectionRequest', connection);

module.exports = { ConnectionRequestModel }