// Central export for all models
const User = require('./User');
const Property = require('./Property');
const Tenant = require('./Tenant');
const Bill = require('./Bill');
const Payment = require('./Payment');
const RefreshToken = require('./RefreshToken');
const AuthorizationCode = require('./AuthorizationCode');

module.exports = {
    User,
    Property,
    Tenant,
    Bill,
    Payment,
    RefreshToken,
    AuthorizationCode,
};