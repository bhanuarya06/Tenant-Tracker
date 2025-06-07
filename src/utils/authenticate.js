const jwt = require('jsonwebtoken')
const { ownerModel } = require('../schema/owner');

const authenticate = async (req, res, next) => {
    try {
        const { token } = req.cookies
        if (!token) {
            return res.status(401).send("Login to access");
        }
        const decodedValue = jwt.verify(token, "Minote3#");
        const { _id } = decodedValue;
        const owner = await ownerModel.findOne({ _id: _id })
        if (!owner) {
            return res.status(401).send("Owner not found");
        }
        req.owner = owner
        next();
    } catch (err) {
        res.status(401).send("Error : ", err.message)
    }
}

module.exports = { authenticate }