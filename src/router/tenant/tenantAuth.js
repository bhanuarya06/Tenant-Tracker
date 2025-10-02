const express = require('express');
const tenantAuthRouter = express.Router();
const bcrypt = require('bcrypt');
const { tenantModel } = require('../../schema/tenant')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser'); // Add cookie-parser middleware
const {validateTenant, validateTenantLoginDetails} = require('../../utils/validate');

tenantAuthRouter.use(cookieParser());

tenantAuthRouter.post('/signUp', async (req, res) => {
    try {
        const tenantUser = req.body;
        validateTenant(tenantUser);
        const { firstName, lastName, email, dob, password, gender, bio, mobile, occupation, roomNum } = tenantUser
        const passwordHash = await bcrypt.hash(password, 10);

        const tenant = new tenantModel({
            firstName: firstName,
            lastName: lastName,
            dob: dob,
            password: passwordHash,
            email: email,
            gender: gender,
            bio : bio,
            mobile: mobile,
            occupation : occupation,
            roomNum: roomNum
        })
        const loginTenant = await tenant.save();
        if (!loginTenant) {
            return res.status(400).send("Something went wrong");
        }
        res.status(200).send(`Tenant ${tenant.firstName} SignedUp Succesfully`);
    } catch (err) {
        res.send("ERROR : " + err);
    }
});

tenantAuthRouter.post('/login', async (req, res) => {
    try {
        const tenant = req.body;
        validateTenantLoginDetails(tenant);
        const { email, password } = tenant;
        const loginTenant = await tenantModel.findOne({ email: email });
        if (!loginTenant) {
            return res.status(400).send("invalid credentials");
        }
        // Debugging logs
        console.log("Password from request:", password);
        console.log("Hashed password from database:", loginTenant.password);

        const validTenant = await bcrypt.compare(password, loginTenant.password);
        if (!validTenant) {
            return res.status(400).send("invalid credentials");
        }
        const token = await jwt.sign({_id:loginTenant._id}, "Minote3#");
        res.cookie('token', token)
        res.status(200).send(loginTenant);

    } catch (err) {
        res.send("ERROR : " + err);
    }
});

module.exports = { tenantAuthRouter }