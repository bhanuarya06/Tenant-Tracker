const express = require('express');
const tenantProfileRouter = express.Router();
const { tenantModel } = require('../../schema/tenant');
const { tenantAuth } = require('../../middlewares/authenticateTenant');
const bcrypt = require('bcrypt');
const validator = require('validator');
const cookieParser = require('cookie-parser');


tenantProfileRouter.use(cookieParser());

tenantProfileRouter.get('/view', tenantAuth, async (req, res) => {
    try {
        const user = req.tenant
        res.json({
            "message": "Welcome " + user.firstName,
            TenantInfo: user
        });
    } catch (err) {
        console.log(err)
    }
});

tenantProfileRouter.put('/edit', tenantAuth, async (req, res) => {
    try {
        const editableFields = ['firstName','dob','gender', 'age', 'mobile', 'address', 'email', 'bio','lastName','rent','memberCount','balance'];
        const tenant = req.tenant
        Object.keys(req.body).forEach((key) => {
            if (editableFields.includes(key)) {
                tenant[key] = req.body[key]
            }
            else {
                throw new Error("Update request is not valid");
            }
        })
        await tenant.save();
        res.json({ 'message': `${tenant.firstName}, Your Profile Updated succesfully` });
    } catch (err) {
        res.status(400).end("Error : ", err);
    }
})

tenantProfileRouter.patch('/passwordUpdate', tenantAuth, async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;
        const isOldPassValid = await bcrypt.compare(oldPassword, req.tenant.password)
        if (!isOldPassValid) {
            res.status(400).send("Password incorrect")
        }
        if (!validator.isStrongPassword(newPassword)) {
            res.status(400).send("Password is Weak");
        }
        if (newPassword != confirmPassword) {
            res.status(400).send("Passwords doesnot match");
        }
        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        await tenantModel.findByIdAndUpdate(req.tenant._id, { password: newPasswordHash });
        res.status(200).send("Password updated successfully");
    } catch (err) {
        res.status(400).send(err.message);
    }
})

module.exports = { tenantProfileRouter };