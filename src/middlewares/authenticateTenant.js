const jwt = require('jsonwebtoken')
const { tenantModel } = require('../schema/tenant');

const tenantAuth = async (req, res, next) => {
    try {
        const { token } = req.cookies
        if (!token) {
            return res.status(401).send("Login to access");
        }
        const decodedValue = jwt.verify(token, "Minote3#");
        const { _id } = decodedValue;
        const tenant = await tenantModel.findOne({ _id: _id })
        if (!tenant) {
            return res.status(401).send("tenant not found");
        }
        req.tenant = tenant
        next();
    } catch (err) {
        res.status(401).send("Error : ", err.message)
    }
}

module.exports = { tenantAuth }